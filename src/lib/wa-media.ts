/**
 * Formatos de adjunto que WhatsApp Cloud API acepta al ENVIAR, con sus topes
 * oficiales. Compartido entre el composer (validación temprana) y el servidor
 * (validación de verdad). Fuente: developers.facebook.com → Cloud API →
 * Media → Supported media types.
 */

export type WaMediaKind = "image" | "video" | "audio" | "document";

const MB = 1024 * 1024;

/**
 * Tope operativo de la instancia: WhatsApp permite documentos de hasta
 * 100 MB, pero esta instancia corre en servidores modestos y el binario pasa
 * por memoria al subirlo — mismo tope que la descarga de adjuntos (16 MB).
 */
export const WA_MEDIA_MAX_BYTES = 16 * MB;

const TYPES: Record<string, { kind: WaMediaKind; maxBytes: number }> = {
  "image/jpeg": { kind: "image", maxBytes: 5 * MB },
  "image/png": { kind: "image", maxBytes: 5 * MB },
  "video/mp4": { kind: "video", maxBytes: 16 * MB },
  "video/3gpp": { kind: "video", maxBytes: 16 * MB },
  "audio/aac": { kind: "audio", maxBytes: 16 * MB },
  "audio/mp4": { kind: "audio", maxBytes: 16 * MB },
  "audio/mpeg": { kind: "audio", maxBytes: 16 * MB },
  "audio/amr": { kind: "audio", maxBytes: 16 * MB },
  "audio/ogg": { kind: "audio", maxBytes: 16 * MB },
  "text/plain": { kind: "document", maxBytes: WA_MEDIA_MAX_BYTES },
  "application/pdf": { kind: "document", maxBytes: WA_MEDIA_MAX_BYTES },
  "application/msword": { kind: "document", maxBytes: WA_MEDIA_MAX_BYTES },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    kind: "document",
    maxBytes: WA_MEDIA_MAX_BYTES,
  },
  "application/vnd.ms-excel": { kind: "document", maxBytes: WA_MEDIA_MAX_BYTES },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    kind: "document",
    maxBytes: WA_MEDIA_MAX_BYTES,
  },
  "application/vnd.ms-powerpoint": {
    kind: "document",
    maxBytes: WA_MEDIA_MAX_BYTES,
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    kind: "document",
    maxBytes: WA_MEDIA_MAX_BYTES,
  },
};

/** Clasifica un mime: `null` si WhatsApp no lo acepta como envío. */
export function classifyWaMedia(
  mime: string
): { kind: WaMediaKind; maxBytes: number } | null {
  const spec = TYPES[mime.toLowerCase().split(";")[0]?.trim() ?? ""];
  if (!spec) return null;
  return { kind: spec.kind, maxBytes: Math.min(spec.maxBytes, WA_MEDIA_MAX_BYTES) };
}

/** Valor para el atributo `accept` del selector de archivos. */
export function waMediaAccept(): string {
  return Object.keys(TYPES).join(",");
}

export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
