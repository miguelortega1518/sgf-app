CREATE TYPE "public"."github_pr_state" AS ENUM('abierto', 'borrador', 'fusionado', 'cerrado');--> statement-breakpoint
CREATE TABLE "github_pull_requests" (
	"url" text PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"state" "github_pr_state" NOT NULL,
	"head_sha" text NOT NULL,
	"author_login" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"ready_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"first_review_at" timestamp with time zone,
	"reviewers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checks" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_github_pr_task" ON "github_pull_requests" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_github_pr_head_sha" ON "github_pull_requests" USING btree ("head_sha");