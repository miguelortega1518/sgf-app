# tests/today-rd-usage.test.ts recorre recursivamente src/app/

tests/today-rd-usage.test.ts recorre recursivamente src/app/(app) y falla si algún .ts/.tsx contiene 'toISOString().slice(0, 10)'. Así que cualquier página nueva bajo (app) debe usar los helpers de date-utils, o el test fallará.

_Origen: Fechas en UTC en las páginas de administración (feriados y plantillas) (20261105-035823-07da2bc696)_
