ALTER TABLE "contact" ADD COLUMN "opted_out_at" timestamp;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "opted_out_reason" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "consent_source" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "consent_granted_at" timestamp;--> statement-breakpoint
--
-- Relleno retroactivo del origen del consentimiento (006).
--
-- Sin esto, TODOS los contactos anteriores a esta migración quedarían con
-- `consent_source` NULL y las campañas de MARKETING los excluirían, aunque
-- hayan llegado por Lead Ads o hayan escrito ellos mismos. Se deduce de la
-- evidencia que ya está en la base; `WHERE consent_source IS NULL` lo hace
-- idempotente y re-ejecutable (Constitución IV).
--
-- 1) Llegó por un formulario de Meta Lead Ads.
UPDATE "contact" c
SET "consent_source" = 'meta_lead_ads'
WHERE c."consent_source" IS NULL
  AND EXISTS (
    SELECT 1 FROM "leadgen_event" le WHERE le."contact_id" = c."id"
  );--> statement-breakpoint
-- 2) Escribió al negocio por WhatsApp (mensaje entrante en una conversación
--    real; las de prueba del Laboratorio no cuentan).
UPDATE "contact" c
SET "consent_source" = 'inbound_message'
WHERE c."consent_source" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "message" m
    JOIN "conversation" cv ON cv."id" = m."conversation_id"
    WHERE cv."contact_id" = c."id"
      AND cv."is_test" = false
      AND m."direction" = 'in'
  );--> statement-breakpoint
-- 3) El resto: sin evidencia de consentimiento; el operador decide en la ficha.
UPDATE "contact"
SET "consent_source" = 'manual'
WHERE "consent_source" IS NULL;
