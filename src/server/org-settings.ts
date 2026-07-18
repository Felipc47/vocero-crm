import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";

/**
 * Settings de organización de la feature 004, guardados en
 * organization.metadata (JSON de Better Auth) — mismo patrón que branding.
 *
 * - `calendar`: invitados internos (correos del comercial/CEO) que se añaden a
 *   toda reunión agendada.
 * - `leadgen`: plantilla de saludo que se envía automáticamente a los leads
 *   que llegan de Meta Lead Ads.
 */

const calendarSettingsSchema = z.object({
  internalInvitees: z
    .array(z.string().trim().email())
    .max(10)
    .default([]),
  /** Título por defecto de la reunión. */
  defaultTitle: z.string().trim().max(120).default("Sesión de diagnóstico"),
  /** Duración por defecto en minutos. */
  defaultDurationMin: z.number().int().min(15).max(240).default(45),
  /** Zona horaria IANA del negocio (para interpretar y proponer fechas). */
  timezone: z.string().trim().min(1).default("America/Bogota"),
});
export type CalendarSettings = z.infer<typeof calendarSettingsSchema>;

const leadgenSettingsSchema = z.object({
  /** Plantilla aprobada que se envía al lead nuevo; null = no enviar. */
  greetingTemplateId: z.string().trim().min(1).nullable().default(null),
});
export type LeadgenSettings = z.infer<typeof leadgenSettingsSchema>;

function parseMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function readMetadata(
  organizationId: string
): Promise<Record<string, unknown>> {
  const db = getDb();
  const rows = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  return parseMetadata(rows[0]?.metadata ?? null);
}

async function writeMetadata(
  organizationId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const db = getDb();
  const meta = await readMetadata(organizationId);
  await db
    .update(schema.organization)
    .set({ metadata: JSON.stringify({ ...meta, ...patch }) })
    .where(eq(schema.organization.id, organizationId));
}

export async function getCalendarSettings(
  organizationId: string
): Promise<CalendarSettings> {
  const meta = await readMetadata(organizationId);
  const parsed = calendarSettingsSchema.safeParse(meta.calendar ?? {});
  return parsed.success ? parsed.data : calendarSettingsSchema.parse({});
}

export async function saveCalendarSettings(
  organizationId: string,
  settings: CalendarSettings
): Promise<void> {
  await writeMetadata(organizationId, {
    calendar: calendarSettingsSchema.parse(settings),
  });
}

export async function getLeadgenSettings(
  organizationId: string
): Promise<LeadgenSettings> {
  const meta = await readMetadata(organizationId);
  const parsed = leadgenSettingsSchema.safeParse(meta.leadgen ?? {});
  return parsed.success ? parsed.data : leadgenSettingsSchema.parse({});
}

export async function saveLeadgenSettings(
  organizationId: string,
  settings: LeadgenSettings
): Promise<void> {
  await writeMetadata(organizationId, {
    leadgen: leadgenSettingsSchema.parse(settings),
  });
}
