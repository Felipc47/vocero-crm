# Guion E2E — US9: el cliente confirma el horario con una respuesta corta

> **Automatizado**: `bash tests/e2e/us9-hora-corta.sh` contra `pnpm dev` con
> mocks. Verificado que FALLA sin el arreglo (reproduce el bug real) y pasa
> con él.

## El bug (reportado 2026-07-21, conversación real)

El cliente elegía un horario ofrecido respondiendo `11 am`, y el agente
contestaba «Antes de agendar, confírmame qué horario te queda mejor» con la
lista de disponibilidad otra vez. Al repetir `a las 11` sí agendaba.

**Causa**: el guard `quoteAppearsInInbound` exige que la cita del modelo tenga
6+ caracteres alfanuméricos (para que un «sí» suelto no valga de confirmación).
`"11 am"` colapsa a `"11am"` = 4 → rechazado; `"a las 11"` → `"alas11"` = 6 →
aceptado. El largo mínimo, por sí solo, no distingue un comodín vago de una
hora concreta.

**Arreglo**: segunda evidencia independiente (`inboundMentionsTime`) — que la
hora que se va a agendar aparezca mencionada por el cliente. No depende de la
cita del modelo. Basta cualquiera de las dos.

## Pasos

1. El cliente pide una reunión sin dar correo → el agente lo pide.
   (Si el primer mensaje ya trae el correo, el agente agenda de una vez y el
   bug ni se alcanza — el orden de este guion importa.)
2. El cliente manda solo su correo → el agente ofrece horarios, aún sin agendar.
3. El cliente responde `11 am` a secas.
   ✅ NO repite «Antes de agendar, confírmame qué horario…».
   ✅ Confirma la reunión **a las 11:00**, la hora que pidió.
   ✅ El evento existe de verdad en el calendario.
4. Protección intacta: `tengo 11 empleados` NO agenda nada — el número solo
   cuenta como hora si el contexto lo respalda (meridiano, minutos, «a las»,
   o que el mensaje sea la hora). Un «sí» suelto tampoco confirma.

## Cobertura unitaria

`tests/unit/schedule-time-mentions.test.ts`: variantes cortas (`11`, `11 am`,
`11:30`, `4:30 pm`, `a las 11`), ambigüedad sin meridiano (1–7 también por la
tarde), y los negativos (`tengo 11 empleados`, `el 23 de julio`, `sí`).
