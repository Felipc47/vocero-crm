# Guion E2E — US8: etapa «Agendado» + ficha del lead con IA

> **Automatizado**: `bash tests/e2e/us8-agendado-ficha.sh` contra `pnpm dev`
> con mocks (wa-mock + ai-mock + google-mock). Resetea la BD y **los mocks**
> antes de correr: su estado vive en memoria del proceso, y un evento de la
> corrida anterior hacía fallar el agendamiento por `slot_taken`.

## Etapa «Agendado»

1. Organización nueva → el pipeline incluye `Agendado` con `kind=scheduled`,
   ubicada después de las etapas abiertas y ANTES de `Cliente`.
   ✅ Es un ancla del sistema: no se renombra ni se borra a mano (como
   ganado/perdido), porque la alimenta el agendamiento.
2. La migración `0005` la siembra en organizaciones ya existentes y es
   re-ejecutable (constitución IV): aplicarla dos veces NO duplica la etapa.
3. El cliente confirma una reunión y el agente la agenda.
   ✅ El lead salta a `Agendado` en el tablero.
   ✅ Si el operador borró/renombró la etapa, la reunión se crea igual — el
   movimiento del tablero es secundario y jamás tumba el agendamiento.

## Ficha del lead con IA

4. Llega un mensaje del cliente contando su negocio, necesidad, presupuesto y
   plazo.
   ✅ Tras el turno se genera sola la ficha: nombre real, negocio, a qué se
   dedica, necesidades, presupuesto y plazo.
   ✅ El campo `notes` del operador NO se toca: la ficha vive aparte y se
   REGENERA en cada actualización (antes se acumulaban líneas `[IA]` sueltas).
5. Corre aunque el agente esté apagado o la conversación en handoff: el
   comercial que atiende a mano también necesita el contexto.
6. Camino infeliz: si el proveedor de IA falla o devuelve algo inservible, la
   ficha simplemente no se actualiza — el turno y la conversación siguen
   intactos (se registra un `warn`, nunca una excepción).
