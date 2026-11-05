# Convenciones de código de Forja

- **Idioma**: la interfaz, los mensajes de error y los comentarios están en español. Los
  identificadores del código, en inglés.
- **Vocabulario visible**: todo texto de dominio sale de `src/lib/labels.ts`. No escribas "Espacio"
  o "Empresa" en la UI: son "Proyecto" y "Repositorio".
- **Rutas de API**: usa `success` / `error` / `handleError` de `src/lib/api-utils.ts`, valida con
  zod (`src/lib/schemas/`), comprueba permisos y deja rastro en la auditoría en toda mutación.
- **Errores**: los errores del servidor llevan una referencia `(ref. xxxx)` (`src/lib/errors.ts`).
  No muestres detalles internos al usuario.
- **Lógica de dominio** en `src/lib/` como funciones puras con su test en `tests/<modulo>.test.ts`.
  Las transiciones de estado de las tareas pasan por `src/lib/task-transitions.ts`.
- **Métricas**: mediana y percentil 85, no promedios (`DECISIONES.md` §18).
- **UI**: colores sólo desde variables de `globals.css` (modo claro y oscuro desde un único sitio);
  un único acento ámbar ("brasa"); accesible por teclado (ver el selector "Mover a…" del Kanban).
- **Tests**: Vitest. `npm test` debe pasar siempre; no desactives ni borres tests para que pase.
- Lint: hay avisos heredados (0 errores). No añadas errores nuevos; no hace falta arreglar los avisos
  ajenos a la tarea.
