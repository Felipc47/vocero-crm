import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { graphRequest } from "@/lib/meta/client";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";
import { publish } from "@/server/events/bus";
import {
  getOrCreateContact,
  getOrCreateConversation,
} from "@/server/inbox/ingest";
import { onLeadActivity } from "@/server/inbox/lead-activity";
import { getLeadgenSettings } from "@/server/org-settings";
import { sendTemplate } from "@/server/whatsapp/templates";
import type { WebhookValue } from "@/server/inbox/webhook";

/**
 * Ingesta de Meta Lead Ads (004, spec B): al llegar un evento `leadgen`, se
 * recupera el lead vía Graph API, se crea el contacto+lead idempotentemente
 * (Principio IV: UNIQUE por leadgen_id) y, si es nuevo y hay plantilla de
 * saludo configurada, se le envía por WhatsApp.
 *
 * Enrutamiento: una instancia = un negocio, así que el evento se atribuye a
 * la única conexión de WhatsApp guardada (supuesto trazable — Principio VII:
 * si algún día hay varias organizaciones por instancia, habrá que guardar el
 * page_id junto a las credenciales y enrutar por él).
 */

type LeadgenField = { name?: string; values?: string[] };

type LeadDetail = {
  field_data?: LeadgenField[];
  campaign_name?: string;
  ad_name?: string;
  form_id?: string;
};

function firstValue(fields: LeadgenField[], ...names: string[]): string | null {
  for (const n of names) {
    const f = fields.find((x) => x.name?.toLowerCase() === n);
    const v = f?.values?.[0]?.trim();
    if (v) return v;
  }
  return null;
}

/** Teléfono del form → dígitos con código de país (formato del CRM). */
function normalizeLeadPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

export async function processLeadgenValue(value: WebhookValue): Promise<void> {
  const leadgenId = value.leadgen_id;
  if (!leadgenId) return;

  const db = getDb();

  // Una instancia = un negocio: la conexión de WhatsApp define la organización.
  const credRows = await db.select().from(schema.metaCredentials).limit(1);
  const creds = credRows[0];
  if (!creds) {
    console.warn(
      "[leadgen] evento recibido sin conexión de WhatsApp guardada: se ignora"
    );
    return;
  }
  const organizationId = creds.organizationId;

  // Idempotencia por leadgen_id: el mismo evento repetido no duplica nada.
  const eventRow = await db
    .insert(schema.leadgenEvent)
    .values({
      id: newId("leadgenEvent"),
      organizationId,
      leadgenId,
      formId: value.form_id ?? null,
    })
    .onConflictDoNothing({ target: [schema.leadgenEvent.leadgenId] })
    .returning();
  if (!eventRow[0]) return; // ya procesado

  // Recuperar el lead. Si Graph falla, se libera el registro de idempotencia
  // para que el reintento de Meta sí pueda procesarlo (spec B, criterio 4).
  let detail: LeadDetail;
  try {
    const credentials = await getCredentialsByOrg(organizationId);
    if (!credentials) throw new Error("conexión de WhatsApp no encontrada");
    detail = await graphRequest<LeadDetail>(
      `${leadgenId}?fields=field_data,campaign_name,ad_name,form_id`,
      { token: credentials.token }
    );
  } catch (err) {
    await db
      .delete(schema.leadgenEvent)
      .where(eq(schema.leadgenEvent.id, eventRow[0].id));
    console.error(
      `[leadgen] no se pudo recuperar el lead ${leadgenId} de Graph:`,
      err
    );
    return;
  }

  const fields = detail.field_data ?? [];
  const rawPhone = firstValue(fields, "phone_number", "telefono", "teléfono");
  const phone = rawPhone ? normalizeLeadPhone(rawPhone) : null;
  if (!phone) {
    console.warn(
      `[leadgen] lead ${leadgenId} sin teléfono utilizable: se registra sin contacto`
    );
    return;
  }
  const name = firstValue(fields, "full_name", "nombre", "name");
  const email = firstValue(fields, "email", "correo");

  const { contact, isNew } = await getOrCreateContact(
    organizationId,
    phone,
    name
  );

  // Rastro de la campaña + correo del form (sin pisar datos del operador).
  const campaignParts = [
    detail.campaign_name ? `Campaña: ${detail.campaign_name}` : null,
    detail.ad_name ? `Anuncio: ${detail.ad_name}` : null,
    detail.form_id ?? value.form_id
      ? `Form: ${detail.form_id ?? value.form_id}`
      : null,
  ].filter(Boolean);
  const campaignNote = `[Meta Ads] ${campaignParts.join(" · ") || "Lead de formulario"}`;
  await db
    .update(schema.contact)
    .set({
      email: contact.email ?? email,
      notes: contact.notes
        ? `${contact.notes}\n${campaignNote}`
        : campaignNote,
      updatedAt: new Date(),
    })
    .where(eq(schema.contact.id, contact.id));

  const conversation = await getOrCreateConversation(
    organizationId,
    contact.id
  );
  await onLeadActivity(organizationId, contact.id, new Date());

  await db
    .update(schema.leadgenEvent)
    .set({ contactId: contact.id })
    .where(eq(schema.leadgenEvent.id, eventRow[0].id));

  // Saludo automático SOLO para contactos nuevos (spec B: existente no se
  // vuelve a saludar). Sin plantilla configurada, el lead entra igual.
  if (isNew) {
    const settings = await getLeadgenSettings(organizationId);
    if (settings.greetingTemplateId) {
      try {
        const firstName = (name ?? "").split(/\s+/)[0] || "Hola";
        await sendTemplate({
          organizationId,
          conversationId: conversation.id,
          templateId: settings.greetingTemplateId,
          variable: firstName,
        });
      } catch (err) {
        console.error(
          `[leadgen] el saludo automático falló para ${contact.id} (el lead queda en la bandeja):`,
          err
        );
      }
    } else {
      console.warn(
        "[leadgen] sin plantilla de saludo configurada (Ajustes → Plantillas): el lead entra sin mensaje"
      );
    }
  }

  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversation.id } },
  });
}
