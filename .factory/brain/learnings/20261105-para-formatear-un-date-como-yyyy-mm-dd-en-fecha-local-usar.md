# Para formatear un Date como YYYY-MM-DD en fecha local, usar 

Para formatear un Date como YYYY-MM-DD en fecha local, usar toLocalDateString(date) de @/lib/date-utils. Para la fecha ancla por defecto de los ciclos de plantillas, usar lastDayOfPreviousMonth(ref) (new Date(y, m, 0) más formato local). Nunca usar toISOString().slice(0, 10): en zonas con UTC positivo como Asia/Tokyo devuelve el día anterior.

_Origen: Fechas en UTC en las páginas de administración (feriados y plantillas) (20261105-035823-07da2bc696)_
