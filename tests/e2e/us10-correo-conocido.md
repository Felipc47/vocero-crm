# Guion E2E — US10: no volver a pedir el correo si ya se tiene

> **Automatizado**: `bash tests/e2e/us10-correo-conocido.sh`. Verificado que
> FALLA sin el arreglo y pasa con él.

## El problema (reportado 2026-07-21)

El agente pedía el correo en cada agendamiento aunque el contacto YA lo tuviera
en su ficha (los leads de Meta Lead Ads llegan con correo, y tras agendar
también queda guardado). Para el cliente era volver a escribir algo que el
negocio ya sabía.

**Causa**: el prompt del agente nunca recibía el correo del contacto, y su
flujo obligatorio de agendamiento arrancaba con «(1) pide el CORREO».

**Arreglo**, en dos capas:

1. **Prompt**: si el contacto tiene correo, se inyecta «YA TIENES el correo de
   este cliente: X. NO se lo vuelvas a pedir» y se le indica mencionarlo al
   ofrecer los horarios, para que el cliente pueda corregirlo si cambió.
2. **Servidor (red de seguridad)**: si el modelo manda un correo inválido o un
   placeholder pero la ficha tiene uno válido, se usa el de la ficha en vez de
   repreguntar. Así el arreglo no depende de que el modelo obedezca.

## Pasos

1. El contacto existe con correo en su ficha (como un lead de Meta).
2. Escribe pidiendo una reunión **sin** poner su correo.
   ✅ El agente NO pide el correo.
3. Elige horario con una respuesta corta (`8 am`, ver [US9](us9-hora-corta.md)).
   ✅ Agenda usando el correo guardado.
   ✅ Ese correo queda como invitado del evento en el calendario.

## Nota

Si el cliente dice que ese correo ya no sirve, el agente sí debe pedir uno
nuevo — la regla del prompt lo contempla explícitamente.
