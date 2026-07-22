# 007 — El agente entiende audios e imágenes

## Objetivo

Hoy los mensajes de tipo `image`/`audio` se guardan con `text=null`: el agente
los ve vacíos y el operador solo ve un adjunto sin contenido. Esta feature hace
que el agente ENTIENDA una nota de voz (transcripción) y una imagen (visión),
reutilizando el proveedor de IA ya configurado.

## Decisiones del dueño (cerradas)

1. **Audio**: se transcribe SIEMPRE al ingerir, aunque el agente esté apagado, y
   la transcripción queda visible para el operador en la bandeja.
2. **Imágenes**: se pasan al modelo como contenido multimodal en el turno del
   agente.

## Requisitos funcionales

- **FR-301** Al ingerir un adjunto se guardan `message.media_id` y
  `message.media_mime`; el pie de foto de las imágenes va en `text`.
- **FR-302** Las notas de voz se transcriben al entrar con el endpoint de
  transcripción del MISMO proveedor (`OPENROUTER_TRANSCRIBE_MODEL`). La
  transcripción se guarda en `message.text` (el tipo sigue siendo `audio`), así
  que la bandeja, la ficha del lead y el historial del agente la aprovechan.
- **FR-303** La última imagen entrante viaja como contenido multimodal
  (`image_url` con data URI) al modelo de visión (`OPENROUTER_VISION_MODEL`, o
  `OPENROUTER_MODEL` si no se define). Solo la última: mandar el álbum entero en
  cada turno multiplicaría el coste sin aportar.
- **FR-304** La bandeja muestra las notas de voz como transcripción, con una
  marca visible de que es una nota de voz (no algo escrito).
- **FR-305** La descarga de media es de dos pasos (id → URL firmada → binario),
  bajo demanda por `media_id`, porque la URL de Meta caduca.

## Degradación (Definición de Hecho REFORZADA)

Ningún fallo del proveedor tumba el turno ni la ingesta:

- Sin `OPENROUTER_TRANSCRIBE_MODEL`, o si la transcripción falla → el mensaje
  queda con `[nota de voz — no se pudo transcribir]` y el flujo sigue.
- Si el modelo RECHAZA la imagen (no soporta visión, formato inválido) → el
  turno se **reintenta sin la imagen** con la etiqueta textual; NO se escala.
- Media inexistente o ilegible → se ignora el adjunto, el mensaje se registra.

## Soberanía (Constitución II)

No se introduce ningún proveedor nuevo: transcripción y visión usan el proveedor
LLM ya configurado (`OPENROUTER_BASE_URL` + `OPENROUTER_API_TOKEN`) y la descarga
usa la Cloud API de WhatsApp. Con OpenRouter, que no expone transcripción, basta
con dejar `OPENROUTER_TRANSCRIBE_MODEL` vacío.

## Criterios de aceptación (verificados en vivo)

`tests/e2e/us13-audio-imagen.sh` — 15 comprobaciones verdes: transcripción al
entrar y respuesta del agente a su contenido · imagen recibida de verdad por el
modelo · pie de foto guardado · proveedor de transcripción caído · modelo que
rechaza la imagen (no escala) · media inexistente · baja pedida por nota de voz
(006 + 007). Sin regresión en us9–us12.
