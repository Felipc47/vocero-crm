"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3, Paperclip, Send, X } from "lucide-react";
import type { ConversationDto, TemplateDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { classifyWaMedia, formatBytes, waMediaAccept } from "@/lib/wa-media";
import { formatRemaining } from "./helpers";
import { TemplateSender } from "./template-sender";

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
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function submit() {
    const value = text.trim();
    if (sending || (!value && !file)) return;
    setSending(true);
    setError(null);
    const err = file
      ? await onSendFile(file, value || null)
      : await onSend(value);
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
      {file && (
        <div className="mb-2.5 flex items-center gap-2.5 rounded-[11px] border bg-surface-2 px-3.5 py-2.5">
          <Paperclip className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold">
              {file.name}
            </span>
            <span className="block text-[11.5px] text-text-3">
              {formatBytes(file.size)} · se enviará con el texto como pie
            </span>
          </span>
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
          disabled={sending}
          aria-label="Adjuntar archivo"
          title="Adjuntar archivo (PDF, Word, imagen…)"
          className="flex h-[42px] w-[38px] shrink-0 items-center justify-center rounded-[11px] text-mute transition-colors hover:bg-subtle hover:text-foreground"
        >
          <Paperclip className="h-[19px] w-[19px]" strokeWidth={2} />
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
