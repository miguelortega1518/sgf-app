# Lectura-modificación de comentarios: FOR UPDATE en tx

En rutas de comentarios (tareas y espacios) que auditan previousValue, leer la fila con tx.select()...limit(1).for('update') dentro de db.transaction y lanzar 404/403 con Object.assign(new Error(msg), { httpStatus }). No leer con db.select fuera de la transacción. No normalizar el texto auditado más allá de stripHtml, porque la redacción encadenada exige igualdad exacta.

_Origen: retrospectiva de «Evitar carrera de lectura en PATCH/DELETE de comentarios (leer con bloqueo dentro de la transacción)» (20261114-023249-d8ff46cfae)_
