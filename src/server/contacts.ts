import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { parseStoredProfile } from "@/server/ai/lead-profile";

export function serializeContact(c: typeof schema.contact.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    notes: c.notes,
    aiProfile: parseStoredProfile(c.aiProfile),
    aiProfileAt: c.aiProfileAt?.toISOString() ?? null,
    archivedAt: c.archivedAt?.toISOString() ?? null,
    // Cumplimiento de la política de Meta (006).
    optedOutAt: c.optedOutAt?.toISOString() ?? null,
    optedOutReason: c.optedOutReason,
    consentSource: c.consentSource,
    consentGrantedAt: c.consentGrantedAt?.toISOString() ?? null,
  };
}

export async function getContactById(
  organizationId: string,
  contactId: string
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        organizationId,
        eq(schema.contact.id, contactId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Etapa actual del lead del contacto (si existe). */
export async function getContactStage(
  organizationId: string,
  contactId: string
) {
  const db = getDb();
  const rows = await db
    .select({ stage: schema.pipelineStage, lead: schema.lead })
    .from(schema.lead)
    .innerJoin(
      schema.pipelineStage,
      eq(schema.lead.stageId, schema.pipelineStage.id)
    )
    .where(
      scoped(
        schema.lead.organizationId,
        organizationId,
        eq(schema.lead.contactId, contactId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
