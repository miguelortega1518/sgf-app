# En los tests que cambian process.env.TZ en caliente, guardar

En los tests que cambian process.env.TZ en caliente, guardar el valor original y restaurarlo en afterEach (con delete si era undefined), porque el cambio afecta a todo el worker de vitest. Un test de control que reproduce el bug (por ejemplo con TZ Asia/Tokyo) confirma que el cambio de zona surte efecto.

_Origen: Fechas en UTC en las páginas de administración (feriados y plantillas) (20261105-035823-07da2bc696)_
