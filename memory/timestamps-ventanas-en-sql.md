---
name: timestamps-ventanas-en-sql
description: Las ventanas de recencia sobre timestamps de Postgres se evalúan en SQL (now() de la BD), nunca comparando con Date.now() en JS.
metadata:
  type: reference
---

Aprendido con el guard anti-repetición del agente (2026-07-20). Comparar un
`created_at` leído por drizzle contra `Date.now()` falló en local: el Postgres
de desarrollo guarda `timestamp` en hora local y el driver lo interpreta con
otra zona → un mensaje de hace 5 segundos aparentaba horas de antigüedad y la
ventana de 15 minutos nunca se cumplía. En prod (contenedor UTC) habría
funcionado "de casualidad".

**Cómo aplicar:** cualquier condición de recencia va en el WHERE con el reloj
de la propia BD, p. ej.
`sql\`${schema.message.createdAt} > now() - make_interval(mins => N)\``
(ver `deliverReply` en `src/server/ai/pipeline.ts`). La igualdad exacta de
timestamps round-trip (escribir Date → leer Date, como
`conversation.meetingScheduledFor`) sí es consistente porque usa el mismo
driver en ambas direcciones.
