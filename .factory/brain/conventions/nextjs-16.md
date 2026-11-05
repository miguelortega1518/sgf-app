# Next.js 16: no es el Next.js que conoces

Esta versión tiene cambios incompatibles en APIs, convenciones y estructura de archivos.

- **Antes de escribir código de Next.js**, lee la guía correspondiente en
  `node_modules/next/dist/docs/` (existe en el worktree tras `npm ci`) y respeta los avisos de
  deprecación. No te fíes de lo que recuerdes de versiones anteriores.
- Copia los patrones de las páginas y rutas que ya existen en `src/app/` antes de inventar uno nuevo.
- `next dev` reescribe `AGENTS.md`; si aparece modificado en un diff, no es parte de la tarea.
- La verificación de la fábrica incluye `npm run build`: un error de compilación de Next bloquea el
  cambio aunque los tests pasen.
