# Sub-recursos: filtrar también por el id del padre

En rutas anidadas (/padre/[id]/hijos/[hijoId]) los WHERE de UPDATE/DELETE/SELECT deben incluir and(eq(hijo.id, hijoId), eq(hijo.padreId, id)). En DELETE con dependencias, leer primero con tx.select(...).for('update') y devolver false (404) sin escribir, en vez de borrar dependencias antes de comprobar.

_Origen: retrospectiva de «Acotar a su plantilla las tareas de plantilla y hacer atómicos el borrado y la duplicación» (20261114-145329-d5f40d168b)_
