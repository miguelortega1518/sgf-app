# Rutas con [id]: assertValidUuid tras requireRole

En rutas API con parámetros UUID, llamar a assertValidUuid justo después de requireRole y antes de req.json() o de tocar la BD. Así un id mal formado da 400 y no un 500 por 22P02, y un no admin sigue recibiendo 401/403. Los tests deben comprobar que db y logger.error no se llaman.

_Origen: retrospectiva de «Acotar a su plantilla las tareas de plantilla y hacer atómicos el borrado y la duplicación» (20261114-145329-d5f40d168b)_
