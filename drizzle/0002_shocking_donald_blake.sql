CREATE TABLE "google_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"account_email" text NOT NULL,
	"refresh_cipher" text NOT NULL,
	"refresh_iv" text NOT NULL,
	"refresh_tag" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leadgen_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"leadgen_id" text NOT NULL,
	"form_id" text,
	"contact_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_credentials" ADD CONSTRAINT "google_credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leadgen_event" ADD CONSTRAINT "leadgen_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leadgen_event" ADD CONSTRAINT "leadgen_event_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_credentials_org_uq" ON "google_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leadgen_event_id_uq" ON "leadgen_event" USING btree ("leadgen_id");--> statement-breakpoint
CREATE INDEX "leadgen_event_org_idx" ON "leadgen_event" USING btree ("organization_id");