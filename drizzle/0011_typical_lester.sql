ALTER TABLE "user" ADD COLUMN "is_superadmin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: el primer usuario registrado de la instancia es el superadmin.
UPDATE "user" SET "is_superadmin" = true
WHERE "id" = (SELECT "id" FROM "user" ORDER BY "created_at" ASC LIMIT 1);
