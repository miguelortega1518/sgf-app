CREATE TYPE "public"."blocked_by_area" AS ENUM('compras', 'operaciones', 'tesoreria', 'contabilidad', 'administracion', 'presupuesto', 'otro', 'infraestructura', 'diseno', 'producto', 'qa', 'seguridad', 'terceros');--> statement-breakpoint
CREATE TYPE "public"."delay_reason" AS ENUM('falta_informacion_terceros', 'documento_no_recibido_otra_area', 'error_sistema', 'capacidad_insuficiente', 'dependencia_atrasada', 'repriorizacion', 'otro');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('enlace', 'archivo', 'captura');--> statement-breakpoint
CREATE TYPE "public"."health" AS ENUM('verde', 'amarillo', 'rojo');--> statement-breakpoint
CREATE TYPE "public"."periodicity" AS ENUM('mensual', 'trimestral', 'anual');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('critica', 'alta', 'normal', 'baja');--> statement-breakpoint
CREATE TYPE "public"."space_role" AS ENUM('dueño', 'colaborador', 'observador');--> statement-breakpoint
CREATE TYPE "public"."space_status" AS ENUM('borrador', 'activo', 'cerrado');--> statement-breakpoint
CREATE TYPE "public"."space_type" AS ENUM('recurrente', 'proyecto', 'continuo');--> statement-breakpoint
CREATE TYPE "public"."task_kind" AS ENUM('feature', 'bug', 'mejora', 'deuda', 'chore');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('no_iniciada', 'en_proceso', 'en_revision', 'completada', 'bloqueada');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'miembro', 'observador');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid,
	"space_id" uuid,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"reason" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid,
	"space_id" uuid,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	CONSTRAINT "chk_comment_target" CHECK (
    ("comments"."task_id" IS NOT NULL AND "comments"."space_id" IS NULL) OR
    ("comments"."task_id" IS NULL AND "comments"."space_id" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"url_or_file" text NOT NULL,
	"type" "evidence_type" NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"date" date PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_date" date NOT NULL,
	"target_date_original" date NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"task_id" uuid,
	"space_id" uuid,
	"read" boolean DEFAULT false NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" DEFAULT 'miembro' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "persons_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_members" (
	"space_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"space_role" "space_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_members_space_id_person_id_pk" PRIMARY KEY("space_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "space_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"periodicity" "periodicity" NOT NULL,
	"target_cycle_days" integer NOT NULL,
	"auto_generate" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"health" "health" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "space_type" NOT NULL,
	"space_template_id" uuid,
	"period" text,
	"anchor_date" date,
	"objective" text,
	"owner_id" uuid NOT NULL,
	"leader_id" uuid,
	"status" "space_status" DEFAULT 'activo' NOT NULL,
	"target_date" date,
	"declared_health" "health",
	"template_snapshot" jsonb,
	"open_date" date NOT NULL,
	"close_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"task_id" uuid NOT NULL,
	"predecessor_id" uuid NOT NULL,
	CONSTRAINT "task_dependencies_task_id_predecessor_id_pk" PRIMARY KEY("task_id","predecessor_id")
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_template_id" uuid NOT NULL,
	"company_id" uuid,
	"task_name" text NOT NULL,
	"order" integer NOT NULL,
	"business_day_limit" integer NOT NULL,
	"default_responsible_id" uuid,
	"alternate_id" uuid,
	"reviewer_id" uuid,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"requires_evidence" boolean DEFAULT false NOT NULL,
	"instructions" text,
	"done_definition" text,
	"applies" boolean DEFAULT true NOT NULL,
	"not_applicable_reason" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"space_id" uuid NOT NULL,
	"template_id" uuid,
	"company_id" uuid,
	"milestone_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"responsible_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"creator_id" uuid NOT NULL,
	"due_date" date,
	"due_date_original" date,
	"completed_at" timestamp with time zone,
	"status" "task_status" DEFAULT 'no_iniciada' NOT NULL,
	"delay_reason" "delay_reason",
	"delay_reason_text" text,
	"blocked_by_area" "blocked_by_area",
	"blocked_by_area_text" text,
	"blocked_since" date,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"kind" "task_kind" DEFAULT 'feature' NOT NULL,
	"estimate" integer,
	"branch" text,
	"pr_url" text,
	"labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"dragged_from_id" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"requires_evidence" boolean DEFAULT false NOT NULL,
	"done_definition" text,
	"instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_dependencies" (
	"template_id" uuid NOT NULL,
	"predecessor_id" uuid NOT NULL,
	CONSTRAINT "template_dependencies_template_id_predecessor_id_pk" PRIMARY KEY("template_id","predecessor_id")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_persons_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_persons_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_uploaded_by_persons_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_persons_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_updates" ADD CONSTRAINT "space_updates_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_updates" ADD CONSTRAINT "space_updates_author_id_persons_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_space_template_id_space_templates_id_fk" FOREIGN KEY ("space_template_id") REFERENCES "public"."space_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_owner_id_persons_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_leader_id_persons_id_fk" FOREIGN KEY ("leader_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessor_id_tasks_id_fk" FOREIGN KEY ("predecessor_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_space_template_id_space_templates_id_fk" FOREIGN KEY ("space_template_id") REFERENCES "public"."space_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_default_responsible_id_persons_id_fk" FOREIGN KEY ("default_responsible_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_alternate_id_persons_id_fk" FOREIGN KEY ("alternate_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_reviewer_id_persons_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_responsible_id_persons_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_id_persons_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_id_persons_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_dependencies" ADD CONSTRAINT "template_dependencies_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_dependencies" ADD CONSTRAINT "template_dependencies_predecessor_id_task_templates_id_fk" FOREIGN KEY ("predecessor_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_task" ON "audit_log" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_comment_task" ON "comments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_task" ON "evidence" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_notification_recipient" ON "notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_template_period" ON "spaces" USING btree ("space_template_id","period");--> statement-breakpoint
CREATE INDEX "idx_subtask_task" ON "subtasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_responsible_due" ON "tasks" USING btree ("responsible_id","due_date");--> statement-breakpoint
CREATE INDEX "idx_task_reviewer" ON "tasks" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "idx_task_space_status" ON "tasks" USING btree ("space_id","status");--> statement-breakpoint
CREATE INDEX "idx_task_company_space" ON "tasks" USING btree ("company_id","space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_task_number" ON "tasks" USING btree ("number");