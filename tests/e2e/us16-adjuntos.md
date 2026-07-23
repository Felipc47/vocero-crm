# US16 — Enviar y recibir adjuntos en la bandeja

**Objetivo**: el operador puede adjuntar archivos al responder (PDF, Word,
Excel, PowerPoint, TXT, JPG, PNG, MP4/3GP, audios) y recibir los del cliente,
con descarga bajo demanda (US15).

## Guion automatizado

```bash
# Requiere `pnpm dev` corriendo con wa-mock y la BD local (:5433). Resetea la BD.
bash tests/e2e/us16-adjuntos.sh
```

Cubre por API: documento entrante con `filename` (DTO + descarga con
`Content-Disposition`), envío de PDF/Word/imagen con pie (el wa-mock recibe
`type=document/image` con filename y caption; round-trip del binario), y los
caminos infelices — formato no permitido (422 `unsupported_media`), tamaño
excedido (413 `too_large`), ventana cerrada (409 `window_closed`), sin sesión
(401).

## Verificación manual en la UI (hilo de la bandeja)

1. Con la ventana abierta, presiona el clip del composer y elige un PDF: el
   chip muestra nombre y tamaño; lo que escribas va como pie. Enviar muestra
   la tarjeta del documento en la burbuja saliente.
2. Un documento del cliente llega como tarjeta con su nombre; al presionarla
   se descarga con el nombre original.
3. Videos e imágenes (y stickers) se ven bajo demanda; audios se reproducen.
4. Un archivo no permitido (ej. .exe) o demasiado grande se rechaza con
   mensaje claro antes de enviar.

## Reglas y límites

- Formatos y topes según WhatsApp Cloud API (imagen 5 MB, video/audio 16 MB);
  tope operativo global de **16 MB** (`src/lib/wa-media.ts`) porque el binario
  pasa por memoria en un VPS modesto.
- Los adjuntos son «texto libre»: **solo dentro de la ventana de 24 h** (fuera
  de ella, plantillas). Mismos guards de sandbox del Laboratorio.
- El binario sube a Meta (`POST /{phone}/media`) y solo se guarda el
  `media_id`: el enviado también se re-descarga del hilo bajo demanda, sin
  almacenar archivos en el servidor.
