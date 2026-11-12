# Carrera PATCH/DELETE de comentarios rompe la cadena

En comments/route.ts, PATCH y DELETE leen comment.content fuera de la transacción y sin bloqueo. Con un PATCH y un DELETE concurrentes, el comment_deleted puede guardar un previousValue obsoleto. Entonces la edición no enlaza con el ancla y el texto final queda visible para no admins. Si se toca esa ruta, leer dentro de la transacción con SELECT ... FOR UPDATE.

_Origen: retrospectiva de «Cerrar la fuga de texto de comentarios borrados vía ediciones previas del autor» (20261112-164030-68da03b07a)_
