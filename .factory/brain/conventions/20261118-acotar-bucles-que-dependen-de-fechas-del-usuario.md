# Acotar bucles que dependen de fechas del usuario

Todo cálculo que recorra días entre dos fechas de entrada del usuario (sprints, hitos, rangos) debe comprobar la longitud de forma aritmética antes de iterar y devolver una variante explícita (p. ej. {kind:'too_long'}) si supera un tope constante (MAX_BURNDOWN_DAYS = 366 en sprint-metrics.ts). No reutilices 'empty' para ese caso, porque la UI mostraría un mensaje engañoso. Valida también el rango en el esquema zod cuando sea posible.

_Origen: retrospectiva de «Fase 2 (5/8): burndown y velocidad con tendencia por sprint» (20261118-163811-7641e66676-452fcc)_
