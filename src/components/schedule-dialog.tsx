"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { useToast } from "@/components/ui/toast";

/**
 * Modal "Agendar reunión" (004): crea el evento en Google Calendar invitando
 * al prospecto + invitados internos. Se abre desde el slide-over del lead.
 */
export function ScheduleDialog({
  contactId,
  contactName,
  defaultEmail,
  onClose,
  onScheduled,
}: {
  contactId: string;
  contactName: string;
  defaultEmail: string | null;
  onClose: () => void;
  /** Se llama tras agendar con éxito (para refrescar notas/panel). */
  onScheduled: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [title, setTitle] = useState("");
  const [datetime, setDatetime] = useState("");
  const [duration, setDuration] = useState(45);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);

  const canSave =
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && datetime.length > 0;

  async function schedule() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/contacts/${contactId}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prospectEmail: email.trim(),
        startIso: new Date(datetime).toISOString(),
        durationMin: duration,
        title: title.trim() || undefined,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res) {
      setError("Sin conexión con el servidor.");
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      const code = data?.error?.code;
      if (code === "not_connected" || code === "reconnect_required") {
        setError(
          <>
            {data?.error?.message ?? "Google Calendar no está conectado."}{" "}
            <Link
              href="/settings/calendar"
              className="font-bold text-brand-text underline underline-offset-2"
            >
              Ir a Ajustes → Calendario
            </Link>
          </>
        );
      } else {
        setError(data?.error?.message ?? "No se pudo agendar la reunión.");
      }
      return;
    }
    const data = (await res.json()) as {
      event: { meetLink: string | null };
    };
    toast(
      data.event.meetLink
        ? "Reunión agendada — invitaciones enviadas con Google Meet"
        : "Reunión agendada — invitaciones enviadas"
    );
    onScheduled();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex animate-[fade-in_.16s_ease] items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agendar reunión"
        className="w-full max-w-[420px] animate-[pop-in_.2s_ease] rounded-2xl bg-surface p-6 shadow-[0_24px_60px_rgba(0,0,0,.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-brand-soft">
          <CalendarPlus className="h-[26px] w-[26px] text-brand" strokeWidth={2} />
        </div>
        <h3 className="mb-1 font-display text-[19px] font-bold">
          Agendar reunión
        </h3>
        <p className="mb-5 text-sm leading-relaxed text-mute">
          Se crea en Google Calendar con Meet, invitando a{" "}
          <strong className="text-foreground">{contactName}</strong> y a tus
          invitados internos.
        </p>

        <div className="flex flex-col gap-3.5">
          <div>
            <label
              htmlFor="sch-email"
              className="mb-1.5 block text-[12.5px] font-bold"
            >
              Correo del prospecto
            </label>
            <input
              id="sch-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@correo.com"
              className="w-full rounded-[10px] border bg-surface-2 px-[13px] py-[11px] text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
            />
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div>
              <label
                htmlFor="sch-datetime"
                className="mb-1.5 block text-[12.5px] font-bold"
              >
                Fecha y hora
              </label>
              <input
                id="sch-datetime"
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                className="w-full rounded-[10px] border bg-surface-2 px-[13px] py-[10px] text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
              />
            </div>
            <div>
              <label
                htmlFor="sch-duration"
                className="mb-1.5 block text-[12.5px] font-bold"
              >
                Duración
              </label>
              <select
                id="sch-duration"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full rounded-[10px] border bg-surface-2 px-2.5 py-[11px] text-sm outline-none focus:border-brand"
              >
                {[30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label
              htmlFor="sch-title"
              className="mb-1.5 block text-[12.5px] font-bold"
            >
              Título (opcional)
            </label>
            <input
              id="sch-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sesión de diagnóstico"
              className="w-full rounded-[10px] border bg-surface-2 px-[13px] py-[11px] text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-[13px] leading-relaxed text-destructive">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2.5">
          <button
            onClick={() => void schedule()}
            disabled={!canSave || saving}
            className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-accent transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {saving ? "Agendando…" : "Agendar y enviar invitaciones"}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border px-5 py-3 text-sm font-bold text-mute transition-colors hover:bg-surface-2"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
