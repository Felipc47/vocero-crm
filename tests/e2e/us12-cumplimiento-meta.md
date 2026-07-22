# US12 — Cumplimiento de la política de Meta en el envío masivo

**Guion ejecutable**: `tests/e2e/us12-cumplimiento-meta.sh`
**Requisitos**: `pnpm dev` con los mocks y Postgres local en `:5433`.
Resetea la BD, así que es re-ejecutable.

## Qué se ejerce

| # | Comportamiento | Resultado esperado |
|---|---|---|
| 1 | Origen del contacto según cómo llega | Quien escribe → `inbound_message`; alta manual → `manual` |
| 2 | Plantilla MARKETING | Excluye a quien no tiene consentimiento y lo dice |
| 3 | Plantilla UTILITY | No restringe a nadie |
| 4 | Campaña MARKETING | Solo entra quien dio permiso |
| 5 | El operador confirma el permiso en la ficha | Ese contacto vuelve a ser elegible |
| 6 | «No me escriban más» por WhatsApp | Baja automática, con la frase guardada |
| 7 | Elegir a mano un contacto dado de baja | Sigue fuera (la baja gana) |
| 8 | «¿Hacen envíos a Baja California?» | NO da de baja (falso positivo evitado) |
| 9 | Volver a escribir tras la baja | NO la reactiva; solo se retira a mano |
| 10 | Tope del número (`messaging_limit_tier`) | Avisa cuántos sobran si se excede |
| 11 | Meta responde «límite de spam» (131048) | La campaña se PAUSA, nadie queda fallido |
| 12 | Campaña sin nadie con consentimiento | Se rechaza; el operador puede forzarla confirmando |

## Notas de diseño

- **El detector de bajas es conservador a propósito.** Marcar una baja por
  error pierde un cliente en silencio, así que las palabras ambiguas
  («baja», «cancelar») solo cuentan si son el mensaje entero. La batería de
  falsos positivos vive en `tests/unit/opt-out.test.ts`.
- **Fallo del canal ≠ fallo del destinatario.** Los códigos de Meta que
  afectan a toda la campaña (131048, 131042, 131031, 132015/16, límites de
  tasa) pausan; el resto marca solo a ese destinatario.
- **Controles del harness** (dev-only, 404 en producción):
  `POST /api/dev/wa-mock/tier` fija el escalón;
  `POST /api/dev/wa-mock/fail-next` con `mode: delivery | auth | limit`.
