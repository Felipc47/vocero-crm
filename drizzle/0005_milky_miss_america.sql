ALTER TABLE "contact" ADD COLUMN "ai_profile" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "ai_profile_at" timestamp;--> statement-breakpoint
-- Etapa "Agendado" (kind='scheduled'): la alimenta el sistema cuando el lead
-- confirma una reunión. Se siembra en organizaciones YA existentes; las nuevas
-- la reciben por SEED_STAGES. Re-ejecutable (constitución IV): el NOT EXISTS
-- evita duplicarla y el reordenamiento es idempotente.
INSERT INTO "pipeline_stage" ("id", "organization_id", "name", "position", "kind")
SELECT
  'stg_' || substr(md5(random()::text || o."id"), 1, 21),
  o."id",
  'Agendado',
  COALESCE((
    SELECT MAX(s."position") + 1
    FROM "pipeline_stage" s
    WHERE s."organization_id" = o."id" AND s."kind" = 'open'
  ), 0),
  'scheduled'
FROM "organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "pipeline_stage" s
  WHERE s."organization_id" = o."id" AND s."kind" = 'scheduled'
);--> statement-breakpoint
-- Empuja las anclas won/lost detrás de "Agendado" para conservar el orden
-- natural del tablero (… → Agendado → Cliente → Perdido).
UPDATE "pipeline_stage" w
SET "position" = w."position" + 1
FROM "pipeline_stage" a
WHERE a."organization_id" = w."organization_id"
  AND a."kind" = 'scheduled'
  AND w."kind" IN ('won', 'lost')
  AND w."position" <= a."position";
