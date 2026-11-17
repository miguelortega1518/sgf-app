CREATE TYPE "public"."sprint_status" AS ENUM('planificado', 'activo', 'cerrado');--> statement-breakpoint
CREATE TABLE "sprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"goal" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "sprint_status" DEFAULT 'planificado' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_sprint_dates" CHECK ("sprints"."end_date" >= "sprints"."start_date")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "sprint_id" uuid;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sprint_space" ON "sprints" USING btree ("space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sprint_active_per_space" ON "sprints" USING btree ("space_id") WHERE status = 'activo';--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_task_sprint" ON "tasks" USING btree ("sprint_id");