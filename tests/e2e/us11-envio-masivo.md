# US11 — Envío masivo (campañas de WhatsApp)

**Guion ejecutable**: `tests/e2e/us11-envio-masivo.sh`
**Requisitos**: `pnpm dev` corriendo con los mocks
(`WA_MOCK_ENABLED=true`, `META_GRAPH_BASE_URL` → `/api/dev/wa-mock/graph`)
y Postgres local en `:5433`. El guion resetea la BD, así que es re-ejecutable.

## Qué se ejerce

| # | Comportamiento | Resultado esperado |
|---|---|---|
| 0-1 | Número conectado + plantilla con `{{1}}` aprobada por Meta | La plantilla queda `approved` |
| 2-3 | Tres contactos y previsualización de la audiencia | «3 destinatarios» antes de crear nada |
| 4-5 | Campaña a todos, `{{1}}` = nombre del contacto | 3 plantillas salen al canal, personalizadas |
| 6 | Reiniciar una campaña terminada | 400 y el outbox NO crece (idempotencia) |
| 7 | Segmentar por etapa del pipeline | Solo el lead movido a esa etapa entra |
| 7 | Audiencia manual con un id inexistente | 0 destinatarios (no cuela fantasmas) |
| 7b | Navegación | `/campaigns` carga y el panel izquierdo enlaza a la sección |
| 8 | Plantilla NO aprobada | Se rechaza la campaña |
| 9 | Un destinatario que Meta rechaza | Queda `failed` con motivo; la campaña TERMINA igual |
| 10 | Reintentar fallidos | Vuelven a la cola y quedan enviados |
| 11 | Token caído a mitad del envío | La campaña se **pausa**; no marca a todos fallidos ni gasta envíos |
| 12 | Campaña inexistente | 404 sin colgarse |

## Notas de diseño verificadas en vivo

- **Ritmo**: el despachador espera `CAMPAIGN_RATE_MS` (default 1000) entre
  mensajes. Bajarlo acelera el guion, pero el default es el comportamiento
  que se envía a producción.
- **Fallo del canal ≠ fallo del destinatario**: si el token cae o Meta no
  responde, seguir enviando quemaría la lista entera marcando todo como
  fallido. La campaña se pausa y los destinatarios siguen `pending`. Este
  caso lo descubrió el propio self-test.
- **Fallos inyectados**: `POST /api/dev/wa-mock/fail-next`
  (`{"count":N,"mode":"delivery"|"auth"}`) hace que el mock rechace los
  próximos N envíos. Vive tras el gate de dev: 404 en producción.
