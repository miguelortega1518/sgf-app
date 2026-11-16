# Kanban: la fila de metadatos lleva flex-wrap

En `TaskCardBoard` (`src/components/tasks/kanban-board.tsx`), el contenedor de la fila de metadatos lleva `flex flex-wrap … whitespace-nowrap`. Sus bloques (punto de prioridad, estimación, fecha absoluta + relativa) llevan `shrink-0` y el avatar `ml-auto shrink-0`. En columnas estrechas el avatar baja a otra línea y la fecha relativa no se recorta. Las versiones descartadas fueron `whitespace-nowrap` + `shrink-0` sin flex-wrap, que desbordaba el avatar, y `truncate`, que recortaba el texto. El caso crítico es 1280px con 5 columnas: cada columna mide `xl:min-w-[13.5rem]` (~174px útiles).

_Origen: retrospectiva de «Mostrar cuánto falta para la fecha límite en las tarjetas de tarea» (20261112-024304-799d64c509)_
