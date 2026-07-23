# US17 — Grabar notas de voz desde el composer

**Objetivo**: el operador graba una nota de voz en la bandeja y la envía por
WhatsApp, con vista previa antes de enviar.

## Cómo funciona

- Botón de micrófono junto al clip (solo con la ventana de 24 h abierta, como
  todo texto libre). Al grabar: barra con timer, «Cancelar» (descarta) y
  «Detener» (pasa al chip con reproductor de vista previa). Tope: 5 min.
- El formato lo decide el navegador con `MediaRecorder`, siempre uno que
  WhatsApp acepte — **sin transcodificar ni dependencias nuevas**: Firefox
  graba `audio/ogg` (opus; WhatsApp lo pinta como nota de voz), Chrome 126+ y
  Safari graban `audio/mp4` (AAC). Navegador sin soporte → mensaje claro.
- Los audios no llevan pie en WhatsApp: si había texto escrito, sale como
  mensaje aparte inmediatamente después de la nota.
- El envío reutiliza el pipeline de adjuntos (US16): sube a Meta, guarda el
  `media_id` y la nota enviada se re-reproduce desde el hilo bajo demanda.

## Self-test (Playwright, mic falso de Chromium)

Guion de referencia: `scratchpad/ui-voz.mjs` de la sesión (mic falso con
`--use-fake-device-for-media-capture`; **requiere `headless: false`** — el
headless shell de Playwright no soporta `getUserMedia`). Verificó: barra con
timer, cancelar sin rastro, chip con vista previa reproducible, burbuja
saliente «Nota de voz», texto como mensaje aparte, outbox del mock con
`type=audio` + `type=text`, y round-trip (la nota enviada se re-reproduce
desde el hilo).

## Verificación manual

1. Abre un hilo con ventana abierta → presiona el micrófono → habla → «Detener».
2. Escucha la vista previa en el chip; «X» la descarta.
3. Envía: la burbuja muestra «Nota de voz» con «Reproducir».
4. Niega el permiso del micrófono en el navegador → mensaje claro sin colgarse.
