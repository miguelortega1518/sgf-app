CREATE TABLE "team_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"show_person_metrics" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "team_settings" ADD CONSTRAINT "team_settings_updated_by_persons_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;