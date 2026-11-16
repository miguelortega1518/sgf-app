# xlsx se instala desde el CDN de SheetJS

En package.json, xlsx apunta al tarball de https://cdn.sheetjs.com/ (0.20.3), no al registro npm, que se quedó en 0.18.5 vulnerable (CVE-2023-30533 y CVE-2024-22363). npm audit y Dependabot no vigilan esa dependencia, así que los avisos y las versiones nuevas no llegan solos. tests/xlsx-version.test.ts exige versión ≥ 0.20.2 en tiempo de ejecución y una URL del CDN en package.json; falla si se vuelve a un rango semver del registro.

_Origen: retrospectiva de «Actualizar xlsx a una versión sin CVE-2023-30533 y CVE-2024-22363» (20261114-224958-3c71e63a10)_
