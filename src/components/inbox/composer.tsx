"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Mic, Paperclip, Send, Square, Trash2, X } from "lucide-react";
import type { ConversationDto, TemplateDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { classifyWaMedia, formatBytes, waMediaAccept } from "@/lib/wa-media";
import { formatRemaining } from "./helpers";
import { TemplateSender } from "./template-sender";

/** Tope de grabación: WhatsApp corta el audio en 16 MB; 5 min de AAC/opus
 * quedan muy por debajo. */
const MAX_RECORDING_SECS = 300;

/**
 * Formato de grabación según el navegador, siempre uno que WhatsApp acepte:
 * Firefox da ogg/opus (WhatsApp lo pinta como nota de voz), Chrome 126+ y
 * Safari dan mp4/AAC. Sin transcodificar ni dependencias extra.
 */
function pickRecordingFormat(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus"))
    return { mime: "audio/ogg;codecs=opus", ext: "ogg" };
  if (MediaRecorder.isTypeSupported("audio/mp4;codecs=mp4a.40.2"))
    return { mime: "audio/mp4;codecs=mp4a.40.2", ext: "m4a" };
  if (MediaRecorder.isTypeSupported("audio/mp4"))
    return { mime: "audio/mp4", ext: "m4a" };
  return null;
}

function formatSecs(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Composer({
  conversation,
  onSend,
  onSendFile,
  onSent,
}: {
  conversation: ConversationDto;
  onSend: (text: string) => Promise<string | null>;
  onSendFile: (file: File, caption: string | null) => Promise<string | null>;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recCancelRef = useRef(false);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Vista previa de la nota grabada: se escucha antes de enviarla.
  const audioPreviewUrl = useMemo(
    () =>
      file && file.type.startsWith("audio/") ? URL.createObjectURL(file) : null,
    [file]
  );
  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  // Si el componente se desmonta grabando, se sueltan mic y timer.
  useEffect(() => {
    return () => {
      recCancelRef.current = true;
      recorderRef.current?.stop();
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates?: TemplateDto[] }) => {
        if (!cancelled)
          setTemplates((d.templates ?? []).filter((t) => t.status === "approved"));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function autogrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function pickFile(selected: File | null) {
    if (!selected) return;
    const spec = classifyWaMedia(selected.type);
    if (!spec) {
      setError(
        "WhatsApp no acepta este formato. Permitidos: PDF, Word, Excel, PowerPoint, TXT, JPG, PNG, MP4/3GP y audios."
      );
      return;
    }
    if (selected.size > spec.maxBytes) {
      setError(
        `El archivo supera el máximo permitido (${formatBytes(spec.maxBytes)})`
      );
      return;
    }
    setError(null);
    setFile(selected);
  }

  async function startRecording() {
    if (recording || sending) return;
    const format = pickRecordingFormat();
    if (!format) {
      setError("Este navegador no permite grabar notas de voz.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(
        "No se pudo acceder al micrófono. Revisa los permisos del navegador."
      );
      return;
    }
    const recorder = new MediaRecorder(stream, { mimeType: format.mime });
    const chunks: Blob[] = [];
    recCancelRef.current = false;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      recorderRef.current = null;
      setRecording(false);
      if (recCancelRef.current) return;
      const note = new File(chunks, `nota-de-voz.${format.ext}`, {
        type: format.mime.split(";")[0],
      });
      if (note.size === 0) {
        setError("La grabación quedó vacía; intenta de nuevo.");
        return;
      }
      pickFile(note);
    };
    recorder.start(250);
    recorderRef.current = recorder;
    setRecording(true);
    setRecSecs(0);
    setError(null);
    let elapsed = 0;
    recTimerRef.current = setInterval(() => {
      elapsed += 1;
      setRecSecs(elapsed);
      if (elapsed >= MAX_RECORDING_SECS) recorder.stop();
    }, 1000);
  }

  function stopRecording(cancel: boolean) {
    recCancelRef.current = cancel;
    recorderRef.current?.stop();
  }

  async function submit() {
    const value = text.trim();
    if (sending || recording || (!value && !file)) return;
    setSending(true);
    setError(null);
    // Los audios no llevan pie en WhatsApp: si hay texto, va como mensaje
    // aparte después de la nota.
    const isAudio = file?.type.startsWith("audio/") ?? false;
    let err: string | null = null;
    if (file) {
      err = await onSendFile(file, isAudio ? null : value || null);
      if (!err && isAudio && value) err = await onSend(value);
    } else {
      err = await onSend(value);
    }
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    setText("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    if (taRef.current) taRef.current.style.height = "auto";
  }

  if (!conversation.windowOpen) {
    return (
      <div className="border-t bg-background px-[18px] py-3.5">
        <div className="mb-3 flex items-start gap-2 rounded-md border border-[color:var(--warning-border)] bg-[color:var(--warning-bg)] p-3 text-sm text-[color:var(--warning-fg)]">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
          <div>
            <p className="font-medium">La ventana de 24 horas está cerrada.</p>
            <p className="opacity-80">
              WhatsApp solo permite texto libre dentro de las 24 horas
              siguientes al último mensaje del cliente. Para retomar la
              conversación, envía una plantilla aprobada.
            </p>
          </div>
        </div>
        <TemplateSender conversationId={conversation.id} onSent={onSent} />
      </div>
    );
  }

  return (
    <div className="border-t bg-background px-[18px] pb-3.5 pt-3">
      {templates.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {templates.slice(0, 4).map((t) => (
            <button
              key={t.id}
              className="rounded-full border bg-surface-2 px-3 py-1.5 text-xs font-bold text-mute transition-colors hover:border-brand-soft hover:bg-brand-tint hover:text-brand-text"
              onClick={() => {
                const firstName = conversation.contact.name.split(" ")[0] ?? "";
                setText(t.body.replace(/\{\{\s*1\s*\}\}/g, firstName));
                taRef.current?.focus();
                setTimeout(autogrow, 0);
              }}
              title={t.body}
            >
              {t.name.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}
      {recording && (
        <div className="mb-2.5 flex items-center gap-3 rounded-[11px] border border-brand/40 bg-brand-tint px-3.5 py-2.5">
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-brand" />
          <span className="flex-1 text-[13px] font-bold">
            Grabando nota de voz… {formatSecs(recSecs)}
          </span>
          <button
            aria-label="Cancelar grabación"
            title="Cancelar"
            onClick={() => stopRecording(true)}
            className="rounded-md p-1.5 text-mute transition-colors hover:bg-subtle hover:text-foreground"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            aria-label="Detener grabación"
            onClick={() => stopRecording(false)}
            className="flex items-center gap-1.5 rounded-[9px] bg-brand px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-hover"
          >
            <Square className="h-3 w-3 fill-current" strokeWidth={2} />
            Detener
          </button>
        </div>
      )}
      {file && (
        <div className="mb-2.5 flex items-center gap-2.5 rounded-[11px] border bg-surface-2 px-3.5 py-2.5">
          {audioPreviewUrl ? (
            <Mic className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
          ) : (
            <Paperclip className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold">
              {audioPreviewUrl ? "Nota de voz" : file.name}
            </span>
            <span className="block text-[11.5px] text-text-3">
              {formatBytes(file.size)}
              {audioPreviewUrl
                ? " · escúchala antes de enviar"
                : " · se enviará con el texto como pie"}
            </span>
          </span>
          {audioPreviewUrl && (
            <audio
              controls
              src={audioPreviewUrl}
              className="h-9 w-48 max-w-[40%]"
            />
          )}
          <button
            aria-label="Quitar adjunto"
            onClick={() => {
              setFile(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="rounded-md p-1 text-mute transition-colors hover:bg-subtle hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2.5 rounded-[14px] border bg-surface-2 py-2 pl-2 pr-2 transition-shadow focus-within:border-brand focus-within:bg-background focus-within:ring-[3px] focus-within:ring-brand-soft">
        <input
          ref={fileRef}
          type="file"
          accept={waMediaAccept()}
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={sending || recording}
          aria-label="Adjuntar archivo"
          title="Adjuntar archivo (PDF, Word, imagen…)"
          className="flex h-[42px] w-[38px] shrink-0 items-center justify-center rounded-[11px] text-mute transition-colors hover:bg-subtle hover:text-foreground"
        >
          <Paperclip className="h-[19px] w-[19px]" strokeWidth={2} />
        </button>
        <button
          onClick={() =>
            recording ? stopRecording(false) : void startRecording()
          }
          disabled={sending}
          aria-label={recording ? "Detener grabación" : "Grabar nota de voz"}
          title={recording ? "Detener" : "Grabar nota de voz"}
          className={cn(
            "flex h-[42px] w-[38px] shrink-0 items-center justify-center rounded-[11px] transition-colors",
            recording
              ? "bg-brand-tint text-brand"
              : "text-mute hover:bg-subtle hover:text-foreground"
          )}
        >
          {recording ? (
            <Square className="h-[17px] w-[17px] fill-current" strokeWidth={2} />
          ) : (
            <Mic className="h-[19px] w-[19px]" strokeWidth={2} />
          )}
        </button>
        <textarea
          ref={taRef}
          placeholder="Escribe una respuesta…"
          value={text}
          rows={1}
          onChange={(e) => {
            setText(e.target.value);
            autogrow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          className="max-h-[120px] w-full resize-none self-center bg-transparent text-[16px] leading-relaxed outline-none placeholder:text-text-3 md:text-sm"
        />
        <button
          onClick={() => void submit()}
          disabled={sending || (text.trim().length === 0 && !file)}
          aria-label="Enviar"
          className={cn(
            "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] bg-brand text-white shadow-accent transition-opacity hover:bg-brand-hover",
            (sending || (!text.trim() && !file)) && "opacity-40 shadow-none"
          )}
        >
          <Send className="h-[19px] w-[19px]" strokeWidth={2.2} />
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        {error ? <p className="text-xs text-destructive">{error}</p> : <span />}
        <p className="text-[11px] font-semibold text-faint">
          Ventana abierta · quedan {formatRemaining(conversation.windowRemainingMs)}
        </p>
      </div>
    </div>
  );
}
