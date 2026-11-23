CREATE TABLE "sprint_capacity" (
	"sprint_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sprint_capacity_sprint_id_person_id_pk" PRIMARY KEY("sprint_id","person_id"),
	CONSTRAINT "chk_sprint_capacity_points" CHECK ("sprint_capacity"."points" >= 0)
);
--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "business_days_only" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sprints" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sprints" ADD COLUMN "summary" jsonb;--> statement-breakpoint
ALTER TABLE "sprint_capacity" ADD CONSTRAINT "sprint_capacity_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_capacity" ADD CONSTRAINT "sprint_capacity_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;