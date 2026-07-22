import { asc, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { publish } from "@/server/events/bus";
import { getOrCreateConversation } from "@/server/inbox/ingest";
import { countVariables, sendTemplate } from "@/server/whatsapp/templates";
import {
  hasMarketingConsent,
  resolveAudience,
  type AudienceFilter,
} from "@/server/campaigns/audience";

/**
 * Despachador del envío masivo (005): recorre los destinatarios `pending` de
 * una campaña UNO A UNO, a ~1 mensaje/segundo, dentro del proceso (sin colas
 * externas — Constitución II).
 *
 * Idempotencia (IV): el estado vive en `campaign_recipient`. Cada envío se
 * marca ANTES de pasar al siguiente, así que pausar, reanudar o reiniciar el
 * proceso nunca reenvía lo ya enviado; el UNIQUE (campaign, contact) impide
 * además que un contacto entre dos veces a la misma campaña.
 */

/** Ritmo por defecto: 1 msg/s protege la calificación de calidad del número. */
const RATE_MS = Number(process.env.CAMPAIGN_RATE_MS ?? 1000);

export class CampaignError extends Error {
  code: "not_found" | "invalid" | "conflict";

  constructor(code: CampaignError["code"], message: string) {
    super(message);
    this.name = "CampaignError";
    this.code = code;
  }
}

export function campaignErrorStatus(err: CampaignError): number {
  return err.code === "not_found" ? 404 : err.code === "conflict" ? 409 : 400;
}

type CreateInput = {
  name: string;
  templateId: string;
  variableMode: "none" | "contact_name" | "fixed";
  variableValue?: string | null;
  audience: AudienceFilter;
  /** El operador confirma que tiene permiso de los contactos sin registro. */
  includeWithoutConsent?: boolean;
};

/** Crea la campaña en `draft` y materializa sus destinatarios. */
export async function createCampaign(
  organizationId: string,
  input: CreateInput
): Promise<string> {
  const db = getDb();

  const templates = await db
    .select()
    .from(schema.template)
    .where(
      scoped(
        schema.template.organizationId,
        organizationId,
        eq(schema.template.id, input.templateId)
      )
    )
    .limit(1);
  const template = templates[0];
  if (!template) {
    throw new CampaignError("not_found", "Plantilla no encontrada");
  }
  if (template.status !== "approved") {
    throw new CampaignError(
      "invalid",
      "Solo se pueden enviar plantillas aprobadas"
    );
  }

  const needsVariable = countVariables(template.body) === 1;
  if (needsVariable && input.variableMode === "none") {
    throw new CampaignError(
      "invalid",
      "La plantilla tiene {{1}}: elige el nombre del contacto o un valor fijo"
    );
  }
  if (input.variableMode === "fixed" && !input.variableValue?.trim()) {
    throw new CampaignError("invalid", "Escribe el valor fijo de {{1}}");
  }

  let contacts = await resolveAudience(organizationId, input.audience);

  // Política de Meta (006): las plantillas de MARKETING exigen consentimiento.
  // Se excluye por defecto a quien no lo tenga; el operador puede incluirlos
  // de forma explícita, asumiendo él la responsabilidad del permiso.
  const isMarketing = template.category.toUpperCase() === "MARKETING";
  let excludedWithoutConsent = 0;
  if (isMarketing && !input.includeWithoutConsent) {
    const before = contacts.length;
    contacts = contacts.filter(hasMarketingConsent);
    excludedWithoutConsent = before - contacts.length;
  }

  if (contacts.length === 0) {
    throw new CampaignError(
      "invalid",
      excludedWithoutConsent > 0
        ? `Ningún contacto de esa audiencia tiene consentimiento registrado para mensajes de marketing (${excludedWithoutConsent} excluidos)`
        : "La audiencia seleccionada no tiene contactos"
    );
  }

  const campaignId = newId("campaign");
  await db.insert(schema.campaign).values({
    id: campaignId,
    organizationId,
    name: input.name,
    templateId: input.templateId,
    variableMode: input.variableMode,
    variableValue:
      input.variableMode === "fixed"
        ? (input.variableValue?.trim() ?? null)
        : null,
    audience: input.audience,
    status: "draft",
  });

  await db
    .insert(schema.campaignRecipient)
    .values(
      contacts.map((c) => ({
        id: newId("campaignRecipient"),
        organizationId,
        campaignId,
        contactId: c.id,
        status: "pending" as const,
      }))
    )
    // Garantía de idempotencia aunque la audiencia traiga repetidos.
    .onConflictDoNothing({
      target: [
        schema.campaignRecipient.campaignId,
        schema.campaignRecipient.contactId,
      ],
    });

  return campaignId;
}

/** Pone la campaña en marcha y despacha en segundo plano (fire-and-forget). */
export async function startCampaign(
  organizationId: string,
  campaignId: string
): Promise<void> {
  const campaign = await loadCampaign(organizationId, campaignId);
  if (campaign.status === "running") return;
  if (campaign.status === "done" || campaign.status === "failed") {
    const pending = await countByStatus(organizationId, campaignId);
    if (pending.pending === 0) {
      throw new CampaignError("invalid", "La campaña ya terminó");
    }
  }

  await markRunning(organizationId, campaignId);
  spawnDispatch(organizationId, campaignId);
}

/** Pausa: el bucle lo detecta en el siguiente destinatario y se detiene. */
export async function pauseCampaign(
  organizationId: string,
  campaignId: string
): Promise<void> {
  const campaign = await loadCampaign(organizationId, campaignId);
  if (campaign.status !== "running") {
    throw new CampaignError("invalid", "La campaña no está en curso");
  }
  await getDb()
    .update(schema.campaign)
    .set({ status: "paused", updatedAt: new Date() })
    .where(
      scoped(
        schema.campaign.organizationId,
        organizationId,
        eq(schema.campaign.id, campaignId)
      )
    );
  await publishProgress(organizationId, campaignId, "paused");
}

/** Devuelve los fallidos a `pending` y reanuda la campaña. */
export async function retryFailed(
  organizationId: string,
  campaignId: string
): Promise<number> {
  const db = getDb();
  await loadCampaign(organizationId, campaignId);

  const reset = await db
    .update(schema.campaignRecipient)
    .set({ status: "pending", error: null })
    .where(
      scoped(
        schema.campaignRecipient.organizationId,
        organizationId,
        eq(schema.campaignRecipient.campaignId, campaignId),
        eq(schema.campaignRecipient.status, "failed")
      )
    )
    .returning({ id: schema.campaignRecipient.id });

  if (reset.length === 0) {
    throw new CampaignError("invalid", "No hay envíos fallidos que reintentar");
  }

  await markRunning(organizationId, campaignId);
  spawnDispatch(organizationId, campaignId);
  return reset.length;
}

/** Marca `running` respetando el lock de una campaña activa por organización. */
async function markRunning(
  organizationId: string,
  campaignId: string
): Promise<void> {
  try {
    await getDb()
      .update(schema.campaign)
      .set({
        status: "running",
        error: null,
        startedAt: new Date(),
        finishedAt: null,
        updatedAt: new Date(),
      })
      .where(
        scoped(
          schema.campaign.organizationId,
          organizationId,
          eq(schema.campaign.id, campaignId)
        )
      );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new CampaignError(
        "conflict",
        "Ya hay otra campaña en curso; espera a que termine o pausala"
      );
    }
    throw err;
  }
}

/** Campañas con un bucle de despacho VIVO en este proceso. */
const globalForDispatch = globalThis as unknown as {
  __seomosCampaignLoops?: Set<string>;
};
const activeLoops = (globalForDispatch.__seomosCampaignLoops ??=
  new Set<string>());

/**
 * Relanza el despacho de una campaña que quedó `running` sin bucle vivo
 * (p. ej. tras reiniciar el proceso). La llaman las lecturas, así que la
 * campaña se auto-sana en cuanto alguien abre la sección.
 */
export function ensureDispatching(
  organizationId: string,
  campaignId: string,
  status: string
): void {
  if (status !== "running" || activeLoops.has(campaignId)) return;
  spawnDispatch(organizationId, campaignId);
}

function spawnDispatch(organizationId: string, campaignId: string): void {
  if (activeLoops.has(campaignId)) return;
  activeLoops.add(campaignId);
  void dispatch(organizationId, campaignId)
    .finally(() => activeLoops.delete(campaignId))
    .catch(async (err) => {
    console.error("[campaigns] despacho falló:", err);
    await getDb()
      .update(schema.campaign)
      .set({
        status: "failed",
        error: String(err),
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.campaign.id, campaignId));
    await publishProgress(organizationId, campaignId, "failed");
  });
}

/**
 * Bucle de despacho. Relee el estado en CADA vuelta: así una pausa (o un
 * cambio hecho por otra pestaña) se respeta sin necesidad de señales.
 */
async function dispatch(
  organizationId: string,
  campaignId: string
): Promise<void> {
  const db = getDb();

  for (;;) {
    const campaign = await loadCampaign(organizationId, campaignId).catch(
      () => null
    );
    if (!campaign || campaign.status !== "running") return;

    const rows = await db
      .select({
        recipient: schema.campaignRecipient,
        contactName: schema.contact.name,
      })
      .from(schema.campaignRecipient)
      .innerJoin(
        schema.contact,
        eq(schema.contact.id, schema.campaignRecipient.contactId)
      )
      .where(
        scoped(
          schema.campaignRecipient.organizationId,
          organizationId,
          eq(schema.campaignRecipient.campaignId, campaignId),
          eq(schema.campaignRecipient.status, "pending")
        )
      )
      .orderBy(asc(schema.campaignRecipient.createdAt))
      .limit(1);

    const next = rows[0];
    if (!next) {
      await db
        .update(schema.campaign)
        .set({
          status: "done",
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.campaign.id, campaignId));
      await publishProgress(organizationId, campaignId, "done");
      return;
    }

    const variable =
      campaign.variableMode === "contact_name"
        ? next.contactName
        : campaign.variableMode === "fixed"
          ? (campaign.variableValue ?? undefined)
          : undefined;

    try {
      const conversation = await getOrCreateConversation(
        organizationId,
        next.recipient.contactId
      );
      const { messageId } = await sendTemplate({
        organizationId,
        conversationId: conversation.id,
        templateId: campaign.templateId,
        variable,
      });
      await db
        .update(schema.campaignRecipient)
        .set({ status: "sent", messageId, error: null, sentAt: new Date() })
        .where(eq(schema.campaignRecipient.id, next.recipient.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Un fallo del CANAL (token caído, número desconectado, Meta abajo) no
      // es culpa del destinatario: seguir quemaría la lista entera marcando
      // todo como fallido. La campaña se pausa con el motivo y el destinatario
      // sigue `pending`, listo para cuando el operador reconecte.
      if (isChannelFailure(err)) {
        await db
          .update(schema.campaign)
          .set({ status: "paused", error: message, updatedAt: new Date() })
          .where(eq(schema.campaign.id, campaignId));
        await publishProgress(organizationId, campaignId, "paused");
        return;
      }

      // Camino infeliz normal: un destinatario que falla NO tumba la campaña.
      await db
        .update(schema.campaignRecipient)
        .set({ status: "failed", error: message.slice(0, 500) })
        .where(eq(schema.campaignRecipient.id, next.recipient.id));
    }

    await publishProgress(organizationId, campaignId, "running");
    await sleep(RATE_MS);
  }
}

export async function loadCampaign(organizationId: string, campaignId: string) {
  const rows = await getDb()
    .select()
    .from(schema.campaign)
    .where(
      scoped(
        schema.campaign.organizationId,
        organizationId,
        eq(schema.campaign.id, campaignId)
      )
    )
    .limit(1);
  const campaign = rows[0];
  if (!campaign) throw new CampaignError("not_found", "Campaña no encontrada");
  return campaign;
}

export async function countByStatus(
  organizationId: string,
  campaignId: string
): Promise<{ total: number; pending: number; sent: number; failed: number }> {
  const rows = await getDb()
    .select({ status: schema.campaignRecipient.status, n: count() })
    .from(schema.campaignRecipient)
    .where(
      scoped(
        schema.campaignRecipient.organizationId,
        organizationId,
        eq(schema.campaignRecipient.campaignId, campaignId)
      )
    )
    .groupBy(schema.campaignRecipient.status);

  const tally = { total: 0, pending: 0, sent: 0, failed: 0 };
  for (const row of rows) {
    tally[row.status] = row.n;
    tally.total += row.n;
  }
  return tally;
}

async function publishProgress(
  organizationId: string,
  campaignId: string,
  status: string
): Promise<void> {
  const progress = await countByStatus(organizationId, campaignId);
  publish(organizationId, {
    type: "campaign.progress",
    data: { campaignId, status, progress },
  });
}

/**
 * Códigos de Meta que afectan a TODA la campaña, no a un destinatario: si
 * seguimos, los mil pendientes fallarían igual. Límite de spam alcanzado,
 * cuenta restringida o sin facturación, plantilla pausada por calidad,
 * mantenimiento y límites de tasa de la API.
 */
const CAMPAIGN_STOPPING_META_CODES = new Set([
  4, // límite de tasa de la aplicación
  80007, // límite de tasa de la cuenta
  130429, // límite de tasa de mensajería
  131042, // problema de facturación
  131031, // cuenta restringida por políticas
  131048, // envíos pausados por reportes de spam
  131057, // cuenta en mantenimiento
  132015, // plantilla pausada por baja calidad
  132016, // plantilla deshabilitada por baja calidad
]);

/** ¿El fallo es del canal (no del destinatario)? Entonces pausar, no quemar. */
function isChannelFailure(err: unknown): boolean {
  const e = err as { code?: string; metaCode?: number | null } | null;
  if (
    e?.code === "not_connected" ||
    e?.code === "reconnect_required" ||
    e?.code === "meta_unavailable"
  ) {
    return true;
  }
  return (
    typeof e?.metaCode === "number" &&
    CAMPAIGN_STOPPING_META_CODES.has(e.metaCode)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
}
