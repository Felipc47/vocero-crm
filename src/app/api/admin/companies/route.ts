import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { seedOrganizationDefaults } from "@/server/auth/on-signup";

export const dynamic = "force-dynamic";

/**
 * Administración de empresas (solo superadmin): cada empresa es una
 * organización con su espacio aislado (multi-tenancy de la constitución III)
 * y nace con un admin (owner) que configura su número, bot y equipo.
 */

export const GET = withAuth(async (session) => {
  if (!session.isSuperadmin) {
    return apiError(403, "forbidden", "Solo el superadmin administra empresas");
  }
  const db = getDb();
  const orgs = await db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      createdAt: schema.organization.createdAt,
    })
    .from(schema.organization)
    .orderBy(schema.organization.createdAt);

  const [memberCounts, contactCounts, creds, owners] = await Promise.all([
    db
      .select({ orgId: schema.member.organizationId, n: count() })
      .from(schema.member)
      .groupBy(schema.member.organizationId),
    db
      .select({ orgId: schema.contact.organizationId, n: count() })
      .from(schema.contact)
      .groupBy(schema.contact.organizationId),
    db
      .select({ orgId: schema.metaCredentials.organizationId })
      .from(schema.metaCredentials),
    db
      .select({
        orgId: schema.member.organizationId,
        email: schema.user.email,
        createdAt: schema.member.createdAt,
      })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
      .where(eq(schema.member.role, "owner"))
      .orderBy(schema.member.createdAt),
  ]);

  const membersBy = new Map(memberCounts.map((r) => [r.orgId, r.n]));
  const contactsBy = new Map(contactCounts.map((r) => [r.orgId, r.n]));
  const connected = new Set(creds.map((r) => r.orgId));
  const adminBy = new Map<string, string>();
  for (const o of owners) if (!adminBy.has(o.orgId)) adminBy.set(o.orgId, o.email);

  return Response.json({
    companies: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      createdAt: o.createdAt.toISOString(),
      members: membersBy.get(o.id) ?? 0,
      contacts: contactsBy.get(o.id) ?? 0,
      whatsappConnected: connected.has(o.id),
      adminEmail: adminBy.get(o.id) ?? null,
    })),
  });
});

const createSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  adminName: z.string().trim().min(1).max(120),
  adminEmail: z.string().trim().email(),
  adminPassword: z.string().min(8).max(128),
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  // Sufijo aleatorio: el slug es UNIQUE y dos empresas pueden llamarse igual.
  return `${base || "empresa"}-${Math.random().toString(36).slice(2, 8)}`;
}

export const POST = withAuth(async (session, req: Request) => {
  if (!session.isSuperadmin) {
    return apiError(403, "forbidden", "Solo el superadmin administra empresas");
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  // El alta interna atraviesa el gate de registro cerrado (FR-060), igual que
  // las cuentas de equipo. El hook onUserCreated no crea org (ya existen).
  const auth = getAuth();
  let adminUserId: string;
  try {
    const result = await runInternalSignup(() =>
      auth.api.signUpEmail({
        body: {
          name: body.data.adminName,
          email: body.data.adminEmail,
          password: body.data.adminPassword,
        },
      })
    );
    adminUserId = result.user.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo crear la cuenta";
    if (/exist/i.test(message)) {
      return apiError(409, "duplicate", "Ya existe una cuenta con ese correo");
    }
    return apiError(422, "invalid", message);
  }

  const db = getDb();
  const orgId = newId("organization");
  await db.transaction(async (tx) => {
    await tx.insert(schema.organization).values({
      id: orgId,
      name: body.data.companyName,
      slug: slugify(body.data.companyName),
    });
    await tx.insert(schema.member).values({
      id: newId("organization"),
      organizationId: orgId,
      userId: adminUserId,
      role: "owner",
    });
    await seedOrganizationDefaults(tx, orgId);
  });

  const [org] = await db
    .select({ n: count() })
    .from(schema.member)
    .where(eq(schema.member.organizationId, orgId));
  return Response.json(
    {
      company: {
        id: orgId,
        name: body.data.companyName,
        adminEmail: body.data.adminEmail,
        members: org?.n ?? 1,
      },
    },
    { status: 201 }
  );
});
