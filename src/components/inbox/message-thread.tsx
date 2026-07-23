"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Clock3,
  Download,
  FileText,
  ImageIcon,
  Mic,
  Paperclip,
  Play,
  Sparkles,
} from "lucide-react";
import type { MessageDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { mediaLabel } from "./helpers";

function mediaUrl(m: MessageDto): string {
  return `/api/conversations/${m.conversationId}/messages/${m.id}/media`;
}

/**
 * Documento (PDF, Word, etc.): tarjeta con el nombre del archivo; al
 * presionarla se descarga bajo demanda con su nombre original.
 */
function DocumentAttachment({ m }: { m: MessageDto }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function download() {
    if (state === "busy") return;
    setState("busy");
    const res = await fetch(`${mediaUrl(m)}?download=1`).catch(() => null);
    if (!res?.ok) {
      setState("error");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = m.mediaFilename ?? "adjunto";
    a.click();
    URL.revokeObjectURL(url);
    setState("idle");
  }

  return (
    <span className="block">
      <button
        onClick={() => void download()}
        className="mb-1 flex items-center gap-2.5 rounded-xl border bg-surface-2 px-3.5 py-2.5 text-left transition-colors hover:bg-subtle"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
          <FileText className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-bold">
            {m.mediaFilename ?? "Documento"}
          </span>
          <span className="block text-[11.5px] text-text-3">
            {state === "busy" ? "Descargando…" : "Presiona para descargar"}
          </span>
        </span>
        <Download className="ml-1 h-4 w-4 shrink-0 text-mute" strokeWidth={2} />
      </button>
      {state === "error" && (
        <span className="mb-1 block text-[12px] italic text-text-3">
          El documento ya no está disponible en WhatsApp.
        </span>
      )}
      {m.text && (
        <span className="block whitespace-pre-wrap break-words">{m.text}</span>
      )}
    </span>
  );
}

/** Video: igual que la imagen, solo baja cuando el usuario lo pide. */
function VideoAttachment({ m }: { m: MessageDto }) {
  const [state, setState] = useState<"idle" | "shown" | "error">("idle");
  return (
    <span className="block">
      {state === "idle" && (
        <button
          onClick={() => setState("shown")}
          className="mb-1 flex items-center gap-2.5 rounded-xl border bg-surface-2 px-3.5 py-2.5 text-left transition-colors hover:bg-subtle"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
            <Play className="ml-0.5 h-[18px] w-[18px] fill-current" strokeWidth={2} />
          </span>
          <span>
            <span className="block text-[13px] font-bold">Video</span>
            <span className="block text-[11.5px] text-text-3">
              Presiona para descargar
            </span>
          </span>
        </button>
      )}
      {state === "shown" && (
        <video
          controls
          autoPlay
          src={mediaUrl(m)}
          onError={() => setState("error")}
          className="mb-1 max-h-80 w-auto max-w-full rounded-xl border"
        />
      )}
      {state === "error" && (
        <span className="mb-1 block text-[12px] italic text-text-3">
          El video ya no está disponible en WhatsApp.
        </span>
      )}
      {m.text && (
        <span className="block whitespace-pre-wrap break-words">{m.text}</span>
      )}
    </span>
  );
}

/**
 * Nota de voz: la transcripción se muestra siempre; el audio solo se descarga
 * cuando el usuario presiona «Reproducir» (nada baja solo).
 */
function VoiceNote({ m }: { m: MessageDto }) {
  const [state, setState] = useState<"idle" | "playing" | "error">("idle");
  return (
    <span className="block">
      <span className="mb-0.5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-3">
        <Mic className="h-3 w-3" strokeWidth={2} />
        Nota de voz
      </span>
      {m.hasMedia && state === "idle" && (
        <button
          onClick={() => setState("playing")}
          className="mb-1 flex items-center gap-2 rounded-full border bg-surface-2 py-1.5 pl-2.5 pr-3.5 text-[12.5px] font-bold text-text-2 transition-colors hover:bg-subtle"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white">
            <Play className="ml-0.5 h-3 w-3 fill-current" strokeWidth={2} />
          </span>
          Reproducir
        </button>
      )}
      {state === "playing" && (
        <audio
          controls
          autoPlay
          preload="auto"
          src={mediaUrl(m)}
          onError={() => setState("error")}
          className="mb-1 h-10 w-64 max-w-full"
        />
      )}
      {state === "error" && (
        <span className="mb-1 block text-[12px] italic text-text-3">
          La nota de voz ya no está disponible en WhatsApp.
        </span>
      )}
      {m.text && (
        <span className="block whitespace-pre-wrap break-words italic">
          {m.text}
        </span>
      )}
    </span>
  );
}

/**
 * Imagen: no se descarga al abrir el hilo — se muestra un adjunto que el
 * usuario presiona para traer la imagen bajo demanda.
 */
function ImageAttachment({ m }: { m: MessageDto }) {
  const [state, setState] = useState<"idle" | "shown" | "error">("idle");
  return (
    <span className="block">
      {state === "idle" && (
        <button
          onClick={() => setState("shown")}
          className="mb-1 flex items-center gap-2.5 rounded-xl border bg-surface-2 px-3.5 py-2.5 text-left transition-colors hover:bg-subtle"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
            <ImageIcon className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <span>
            <span className="block text-[13px] font-bold">Imagen</span>
            <span className="block text-[11.5px] text-text-3">
              Presiona para descargar
            </span>
          </span>
        </button>
      )}
      {state === "shown" && (
        // eslint-disable-next-line @next/next/no-img-element -- binario autenticado bajo demanda, fuera del optimizador
        <img
          src={mediaUrl(m)}
          alt={m.text ?? "Imagen recibida"}
          onError={() => setState("error")}
          className="mb-1 max-h-80 w-auto max-w-full rounded-xl border"
        />
      )}
      {state === "error" && (
        <span className="mb-1 block text-[12px] italic text-text-3">
          La imagen ya no está disponible en WhatsApp.
        </span>
      )}
      {m.text && (
        <span className="block whitespace-pre-wrap break-words">{m.text}</span>
      )}
    </span>
  );
}

function StatusTicks({ status }: { status: MessageDto["status"] }) {
  const cls = "h-[13px] w-[13px]";
  if (status === "pending") return <Clock3 className={cn(cls, "text-text-4")} strokeWidth={1.7} />;
  if (status === "sent") return <Check className={cn(cls, "text-text-4")} strokeWidth={1.7} />;
  if (status === "delivered")
    return <CheckCheck className={cn(cls, "text-text-4")} strokeWidth={1.7} />;
  if (status === "read")
    return <CheckCheck className={cn(cls, "text-brand")} strokeWidth={1.7} />;
  return <AlertTriangle className={cn(cls, "text-destructive")} strokeWidth={1.7} />;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "long" });
}

function bubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function MessageThread({ messages }: { messages: MessageDto[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div
      ref={scrollRef}
      className="flex flex-1 flex-col gap-[3px] overflow-y-auto bg-chat px-[6%] py-5"
    >
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay =
          !prev ||
          new Date(prev.createdAt).toDateString() !==
            new Date(m.createdAt).toDateString();
        const grouped =
          !newDay && prev !== undefined && prev.direction === m.direction;
        const out = m.direction === "out";

        return (
          <div key={m.id}>
            {newDay && (
              <div className="my-3 flex justify-center">
                <span className="rounded-full border bg-background px-3 py-1 text-[11.5px] font-semibold text-text-2 shadow-sm">
                  {dayLabel(m.createdAt)}
                </span>
              </div>
            )}
            <div
              className={cn(
                "flex",
                out ? "justify-end" : "justify-start",
                grouped ? "mt-[3px]" : "mt-2.5"
              )}
            >
              <div
                className={cn(
                  "max-w-[86%] rounded-2xl px-[15px] pb-1.5 pt-2 text-sm leading-[1.45] md:max-w-[74%]",
                  out
                    ? "bg-bubble-out text-bubble-out-text"
                    : "border border-border bg-surface shadow-sm",
                  !grouped && (out ? "rounded-br-[5px]" : "rounded-bl-[5px]")
                )}
              >
                {m.type === "text" || m.type === "template" ? (
                  <span className="whitespace-pre-wrap break-words">
                    {m.text}
                  </span>
                ) : m.type === "audio" && (m.hasMedia || m.text) ? (
                  /* Nota de voz (007): transcripción siempre visible +
                     reproducción bajo demanda si el adjunto sigue vivo. */
                  <VoiceNote m={m} />
                ) : (m.type === "image" || m.type === "sticker") &&
                  m.hasMedia ? (
                  <ImageAttachment m={m} />
                ) : m.type === "video" && m.hasMedia ? (
                  <VideoAttachment m={m} />
                ) : m.type === "document" && m.hasMedia ? (
                  <DocumentAttachment m={m} />
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-text-3">
                    <Paperclip className="h-3.5 w-3.5" strokeWidth={1.7} />
                    {mediaLabel(m.type)}
                    {m.text ? ` — ${m.text}` : ""}
                  </span>
                )}
                <span className="float-right ml-2 mt-1 flex items-center gap-1">
                  {m.aiGenerated && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-accent-2"
                      title="Respuesta generada por IA"
                    >
                      <Sparkles className="h-3 w-3" strokeWidth={2} /> IA
                    </span>
                  )}
                  <span className="text-[10.5px] text-text-4">
                    {bubbleTime(m.createdAt)}
                  </span>
                  {out && <StatusTicks status={m.status} />}
                </span>
              </div>
            </div>
            {out && m.status === "failed" && (
              <div className="mt-1 flex justify-end">
                <span className="max-w-[86%] text-right text-[11px] leading-snug text-destructive md:max-w-[74%]">
                  No entregado{m.error ? `: ${m.error}` : ""}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
