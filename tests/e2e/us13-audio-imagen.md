# US13 — El agente entiende audios e imágenes (007)

**Guion ejecutable**: `tests/e2e/us13-audio-imagen.sh`
**Requisitos**: `pnpm dev` con wa-mock + ai-mock, Postgres local en `:5433`, y
`OPENROUTER_TRANSCRIBE_MODEL` + `OPENROUTER_VISION_MODEL` definidos (en `.env`
apuntan a los modelos del mock). Resetea la BD: re-ejecutable.

## Qué se ejerce

| # | Comportamiento | Resultado esperado |
|---|---|---|
| 1 | Nota de voz entrante | Se transcribe al entrar; el texto queda en el mensaje (tipo sigue `audio`) |
| 2 | Turno del agente tras el audio | Responde al CONTENIDO transcrito, sin arrastrar la etiqueta de adjunto |
| 3 | Imagen entrante | El modelo la recibe de verdad (cita su contenido); el pie de foto se guarda |
| 4 | Proveedor de transcripción caído | `[nota de voz — no se pudo transcribir]`, sin colgarse |
| 5 | El modelo rechaza la imagen | El turno se reintenta sin ella; NO escala a handoff por error |
| 6 | Media inexistente en Meta | El mensaje se registra igual; la app sigue sana |
| 7 | «No me escriban más» por nota de voz | Da de baja (006 sobre la transcripción de 007) |

## Notas de diseño

- **Solo la última imagen** viaja como contenido multimodal; las anteriores
  quedan como etiqueta. Mandar el álbum entero por turno multiplica el coste.
- **Un rechazo de visión no escala**: `chatJson` con imagen que falla dispara un
  reintento sin la imagen (`stripImageParts`), no un handoff.
- **Controles del harness** (dev-only, 404 en producción):
  `POST /api/dev/wa-mock/media` registra un adjunto y devuelve su `media_id`;
  `POST /api/dev/ai-mock/fail-next` con `{transcriptions, vision}` fuerza los
  caminos infelices del proveedor de IA.
- **Soberanía**: sin proveedor nuevo. En producción (OpenAI) se transcribe con
  `whisper-1`/`gpt-4o-mini-transcribe`; con OpenRouter, dejar la var vacía.
