CREATE TABLE "digest_runs" (
	"person_id" uuid NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_runs_person_id_day_pk" PRIMARY KEY("person_id","day")
);
--> statement-breakpoint
ALTER TABLE "digest_runs" ADD CONSTRAINT "digest_runs_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;