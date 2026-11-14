# xlsx se instala desde el CDN de SheetJS

xlsx se fija a un tarball de https://cdn.sheetjs.com/ (0.20.3), no al registro npm, que se quedó en 0.18.5 vulnerable. npm audit y Dependabot no lo vigilan: hay que revisar a mano avisos y versiones nuevas. tests/xlsx-version.test.ts exige versión >= 0.20.2 y URL del CDN en package.json; no volver a un rango semver.

_Origen: retrospectiva de «Actualizar xlsx a una versión sin CVE-2023-30533 y CVE-2024-22363» (20261114-224958-3c71e63a10)_
