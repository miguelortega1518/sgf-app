ALTER TABLE "persons" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Cambio de datos: toda cuenta existente debe elegir una contraseña propia en su próximo ingreso.
-- Motivo: las cuentas iniciales usaban una contraseña que estuvo escrita en el repositorio público.
UPDATE "persons" SET "must_change_password" = true;
