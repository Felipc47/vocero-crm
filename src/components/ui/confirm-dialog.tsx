"use client";

import { Trash2 } from "lucide-react";

/**
 * Modal de confirmación del mock SEOMOS: overlay oscuro, tarjeta centrada con
 * ícono en pastilla naranja suave y acciones lado a lado. Reemplaza a
 * window.confirm en flujos destructivos.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Sí, eliminar",
  cancelLabel = "Cancelar",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Deshabilita las acciones mientras corre la operación. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex animate-[fade-in_.16s_ease] items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[400px] animate-[pop-in_.2s_ease] rounded-2xl bg-surface p-6 shadow-[0_24px_60px_rgba(0,0,0,.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-brand-soft">
          <Trash2 className="h-[26px] w-[26px] text-brand" strokeWidth={2} />
        </div>
        <h3 className="mb-2 font-display text-[19px] font-bold">{title}</h3>
        <p className="mb-5 text-sm leading-relaxed text-mute">{message}</p>
        <div className="flex gap-2.5">
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Un momento…" : confirmLabel}
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-border py-3 text-sm font-bold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
