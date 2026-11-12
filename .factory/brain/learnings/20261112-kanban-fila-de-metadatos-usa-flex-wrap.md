# Kanban: fila de metadatos usa flex-wrap

En la fila de metadatos de `TaskCardBoard` (columna de 13.5rem, ~174px útiles) no usar `whitespace-nowrap`+`shrink-0` ni `truncate` para texto variable: el primero desborda el avatar y el segundo recorta el texto a 1280px. La solución aceptada es `flex-wrap` con el avatar `ml-auto`. Verificar visualmente a 1280px con 5 columnas.

_Origen: retrospectiva de «Mostrar cuánto falta para la fecha límite en las tarjetas de tarea» (20261112-024304-799d64c509)_
