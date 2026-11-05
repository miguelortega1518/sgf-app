# Para probar lógica que depende de la zona horaria RD, usar v

Para probar lógica que depende de la zona horaria RD, usar vi.useFakeTimers() + vi.setSystemTime() con una hora UTC cercana a medianoche (p. ej. 01:00Z = 21:00 RD) para cubrir el caso en que UTC y RD caen en días distintos.

_Origen: Las tareas aparecen vencidas antes de tiempo por usar la fecha UTC (20261105-034116-cf6ee663d7)_
