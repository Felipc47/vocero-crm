import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  // dataURL de imagen ya redimensionada en el cliente, o null para quitarla.
  // Se guarda self-hosted en la BD (Constitución II: sin almacenamiento externo).
  image: z
    .string()
    .regex(
      /^data:image\/(png|jpeg|webp);base64,/,
      "Formato de imagen no válido"
    )
    .max(700_000, "La imagen es demasiado grande (máx. ~500 KB)")
    .nullable()
    .optional(),
});

/** Perfil del usuario autenticado. */
export const GET = withAuth(async (session) => {
  const db = getDb();
  const rows = await db
    .select({
      name: schema.user.name,
      email: schema.user.email,
      image: schema.user.image,
    })
    .from(schema.user)
    .where(eq(schema.user.id, session.userId))
    .limit(1);
  if (!rows[0]) return apiError(404, "not_found", "Usuario no encontrado");
  return Response.json({ profile: rows[0] });
});

/** Actualiza nombre y/o foto del usuario autenticado. */
export const PATCH = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.data.name !== undefined) set.name = body.data.name;
  if (body.data.image !== undefined) set.image = body.data.image;

  const db = getDb();
  const updated = await db
    .update(schema.user)
    .set(set)
    .where(eq(schema.user.id, session.userId))
    .returning({
      name: schema.user.name,
      email: schema.user.email,
      image: schema.user.image,
    });
  if (!updated[0]) return apiError(404, "not_found", "Usuario no encontrado");
  return Response.json({ profile: updated[0] });
});
