import { getEnv, isAiConfigured } from "@/lib/env";

/**
 * Transcripción de notas de voz (007).
 *
 * Usa el MISMO proveedor ya configurado (`OPENROUTER_BASE_URL` +
 * `OPENROUTER_API_TOKEN`) contra su endpoint de transcripción, así que no
 * introduce una dependencia nueva (Constitución II). Si el proveedor no lo
 * ofrece —OpenRouter, por ejemplo, no expone transcripción— basta con no
 * configurar `OPENROUTER_TRANSCRIBE_MODEL`: la función devuelve
 * `not_configured` y el resto del sistema sigue igual.
 *
 * Nunca lanza. Un fallo del proveedor jamás tumba la ingesta del mensaje.
 */

const TIMEOUT_MS = 60_000;

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; error: "not_configured" | "provider_error" | "empty"; detail: string };

export function isTranscriptionConfigured(): boolean {
  return isAiConfigured() && Boolean(getEnv().OPENROUTER_TRANSCRIBE_MODEL?.trim());
}

export async function transcribeAudio(input: {
  bytes: Uint8Array;
  mime: string;
  /** Nombre con extensión: algunos proveedores deciden el formato por él. */
  filename?: string;
}): Promise<TranscribeResult> {
  if (!isTranscriptionConfigured()) {
    return {
      ok: false,
      error: "not_configured",
      detail: "Sin OPENROUTER_TRANSCRIBE_MODEL configurado",
    };
  }
  const env = getEnv();

  const form = new FormData();
  const filename = input.filename ?? `audio.${extensionFor(input.mime)}`;
  form.append(
    "file",
    new Blob([input.bytes as unknown as BlobPart], { type: input.mime }),
    filename
  );
  form.append("model", env.OPENROUTER_TRANSCRIBE_MODEL!);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${env.OPENROUTER_BASE_URL}/v1/audio/transcriptions`, {
      method: "POST",
      // El token solo viaja en el header; jamás se loguea.
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_TOKEN}` },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        error: "provider_error",
        detail: `proveedor respondió ${res.status}: ${detail.slice(0, 200)}`,
      };
    }
    const json = (await res.json().catch(() => null)) as { text?: string } | null;
    const text = json?.text?.trim();
    if (!text) {
      return { ok: false, error: "empty", detail: "transcripción vacía" };
    }
    return { ok: true, text };
  } catch (err) {
    return {
      ok: false,
      error: "provider_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** WhatsApp manda las notas de voz en OGG/Opus; el resto es defensa. */
function extensionFor(mime: string): string {
  const clean = mime.split(";")[0]?.trim() ?? "";
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/oga": "oga",
    "audio/mpeg": "mp3",
    "audio/mp4": "mp4",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/amr": "amr",
  };
  return map[clean] ?? "ogg";
}
