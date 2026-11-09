# Lookup de etiquetas en objetos literales y prototipo

Un helper como labelOr(map, v) con map[v] ?? v devuelve una propiedad del prototipo si v es 'constructor' o '__proto__'. Hoy no es explotable porque los valores son enums de la base. Si el helper se reutiliza con entrada de usuario, usa Object.hasOwn(map, v) o un Map.

_Origen: retrospectiva de «Usar el vocabulario de labels.ts en los exportes y reportes (XLSX/PDF)» (20261109-233118-ca6961fb43)_
