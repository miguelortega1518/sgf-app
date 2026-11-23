CREATE TABLE "space_share_links" (
	"space_id" uuid NOT NULL,
	"token_hash" text PRIMARY KEY NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "space_share_links" ADD CONSTRAINT "space_share_links_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_share_links" ADD CONSTRAINT "space_share_links_created_by_persons_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_share_link_active_per_space" ON "space_share_links" USING btree ("space_id") WHERE revoked_at IS NULL;