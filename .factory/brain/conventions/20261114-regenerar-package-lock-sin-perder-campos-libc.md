# Regenerar package-lock sin perder campos libc

Al ejecutar npm install para cambiar una dependencia, revisar `git diff package-lock.json`. Si desaparecen los campos `libc` de paquetes opcionales de plataforma, es ruido de otra versión de npm: regenerar con la versión de npm del proyecto o restaurar esas líneas, para que el diff contenga solo el cambio pedido.

_Origen: retrospectiva de «Actualizar xlsx a una versión sin CVE-2023-30533 y CVE-2024-22363» (20261114-224958-3c71e63a10)_
