# Mutaciones desde perfil: refrescar la sesión

Si una página edita datos que también lee useSession() (preferencias, perfil), tras un PATCH correcto hay que hacer `await refresh()`. El SessionProvider vive en el layout y conserva `user` entre navegaciones cliente, así que el estado local de la página no basta. Mientras `loading` o `!user`, deshabilita los controles para no calcular el valor previo con un default.

_Origen: retrospectiva de «Fase 1 (1/2): correo inmediato sólo para lo importante y preferencias de correo» (20261117-101332-f8f3e3c4f5)_
