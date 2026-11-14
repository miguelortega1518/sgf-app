CREATE TABLE "github_deliveries" (
	"delivery_id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text
);
--> statement-breakpoint
-- Cambio de datos: persona de sistema "GitHub", con la que el webhook audita los cambios automáticos.
-- Está inactiva (no inicia sesión, no aparece en la lista de usuarios y no se le asignan tareas) y su
-- password_hash no es un hash bcrypt válido: lleva una parte aleatoria para que nunca coincida.
INSERT INTO "persons" ("name", "email", "role", "active", "must_change_password", "password_hash")
VALUES ('GitHub', 'github@forja.system', 'miembro', false, false, '!sin-acceso-' || md5(random()::text))
ON CONFLICT ("email") DO NOTHING;
