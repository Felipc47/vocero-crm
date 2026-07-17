"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Pencil, RotateCcw, Sparkles, Trash2, UserRound, X } from "lucide-react";
import type { ConversationDto, StageDto } from "@/lib/types";
import { cn, formatPhone } from "@/lib/utils";
import { stageColor, stageTint } from "@/lib/stage-colors";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StageTag } from "@/components/ui/stage-tag";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

const HANDOFF_LABELS: Record<string, string> = {
  cliente: "El cliente pidió un humano",
  modelo: "El agente decidió escalar",
  error: "Error del proveedor de IA",
  ventana: "Ventana de 24h cerrada",
};

export function ContactPanel({
  conversation,
  refreshKey = 0,
  onPatchConversation,
  onResetConversation,
  onDeleteContact,
  onClose,
}: {
  conversation: ConversationDto;
  /** Aumenta con cada evento SSE relevante: dispara un refetch en vivo. */
  refreshKey?: number;
  onPatchConversation: (patch: {
    aiEnabled?: boolean;
    reactivate?: boolean;
  }) => Promise<void>;
  /** Borra el historial de la conversación y limpia su estado. */
  onResetConversation: () => Promise<boolean>;
  /** Borra el contacto de forma permanente (cascada). */
  onDeleteContact: (contactId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draftName, setDraftName] = useState("");
  const [notes, setNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<"delete" | "reset" | null>(null);
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<StageDto[]>([]);
  const [currentStageId, setCurrentStageId] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  // Estado global del agente: sin esto, el toggle "Respondiendo" mentiría
  // cuando el agente aún no se ha configurado/encendido.
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);

  const contactId = conversation.contact.id;

  const agentReady = aiConfigured && agentEnabled;
  const aiActive =
    agentReady && conversation.aiEnabled && !conversation.handoffAt;

  // Carga inicial (incluye notas): se re-ejecuta al cambiar de contacto.
  const refetch = useCallback(async () => {
    const [detail, stagesRes, agentRes] = await Promise.all([
      fetch(`/api/contacts/${contactId}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/pipeline/stages").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/agent/profile").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null, null]);
    if (detail) {
      setNotes(detail.contact?.notes ?? "");
      setCurrentStageId(detail.stage?.id ?? null);
      setLeadId(detail.lead?.id ?? null);
    }
    if (stagesRes) setStages(stagesRes.stages);
    setAgentEnabled(Boolean(agentRes?.profile?.enabled));
    setAiConfigured(Boolean(agentRes?.aiConfigured));
    setNotesLoaded(true);
  }, [contactId]);

  // Refetch en vivo (etapa/lead + estado del agente) SIN tocar las notas, para
  // no pisar lo que el operador esté escribiendo. Lo dispara el SSE.
  const refreshLive = useCallback(async () => {
    const [detail, agentRes] = await Promise.all([
      fetch(`/api/contacts/${contactId}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/agent/profile").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    if (detail) {
      setCurrentStageId(detail.stage?.id ?? null);
      setLeadId(detail.lead?.id ?? null);
    }
    if (agentRes) {
      setAgentEnabled(Boolean(agentRes.profile?.enabled));
      setAiConfigured(Boolean(agentRes.aiConfigured));
    }
  }, [contactId]);

  useEffect(() => {
    setNotesLoaded(false);
    setMode("view");
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!notesLoaded) return; // la carga inicial ya trae el estado fresco
    void refreshLive();
  }, [refreshKey, notesLoaded, refreshLive]);

  async function moveToStage(stageId: string) {
    if (!leadId || stageId === currentStageId) return;
    setCurrentStageId(stageId); // optimista
    await fetch(`/api/pipeline/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId, position: 0 }),
    }).catch(() => null);
    toast("Etapa actualizada");
    void refreshLive();
  }

  async function saveNotes() {
    setSavingNotes(true);
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes }),
    }).catch(() => null);
    setSavingNotes(false);
    toast("Notas guardadas");
  }

  async function saveEdit() {
    if (!draftName.trim()) return;
    setSaving(true);
    await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: draftName.trim(), notes }),
    }).catch(() => null);
    setSaving(false);
    setMode("view");
    toast("Cambios guardados");
    void refreshLive();
  }

  const currentStage = stages.find((s) => s.id === currentStageId) ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* Header del mock: avatar + nombre + teléfono + cerrar */}
      <header className="flex items-center gap-3 border-b px-[22px] py-5">
        <ContactAvatar
          name={conversation.contact.name}
          seed={conversation.contact.id}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold">
            {conversation.contact.name}
          </p>
          <p className="text-[13px] font-bold text-mute">
            {formatPhone(conversation.contact.phone)}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar panel"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border bg-surface-2 text-mute transition-colors hover:text-foreground"
        >
          <X className="h-[17px] w-[17px]" strokeWidth={2.4} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-[22px]">
        {mode === "edit" ? (
          <div className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="panel-edit-name"
                className="mb-1.5 block text-[12.5px] font-bold"
              >
                Nombre
              </label>
              <input
                id="panel-edit-name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="w-full rounded-[10px] border bg-surface-2 px-[13px] py-[11px] text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
              />
            </div>
            <div>
              <label
                htmlFor="panel-edit-notes"
                className="mb-1.5 block text-[12.5px] font-bold"
              >
                Notas
              </label>
              <Textarea
                id="panel-edit-notes"
                rows={5}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <>
            {currentStage && (
              <div className="mb-5 flex flex-wrap gap-2">
                <StageTag
                  name={currentStage.name}
                  color={stageColor(currentStage)}
                />
              </div>
            )}

            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-4 border-b py-3">
                <span className="shrink-0 text-[13px] font-semibold text-mute">
                  Teléfono
                </span>
                <span className="text-right text-sm font-bold">
                  {formatPhone(conversation.contact.phone)}
                </span>
              </div>
            </div>

            {conversation.handoffAt && (
              <div className="mt-4 rounded-xl border border-[color:var(--warning-border)] bg-[color:var(--warning-bg)] p-3">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--warning-fg)]">
                  <UserRound className="h-4 w-4" strokeWidth={1.7} /> Atención
                  humana
                </p>
                <p className="mt-1 text-xs text-[color:var(--warning-fg)]">
                  {HANDOFF_LABELS[conversation.handoffReason ?? ""] ??
                    "La IA está en pausa en esta conversación."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                  disabled={!agentReady}
                  onClick={() => void onPatchConversation({ reactivate: true })}
                >
                  Reactivar IA
                </Button>
              </div>
            )}

            <div className="mt-4 rounded-xl border bg-surface-2/60 px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold">
                    IA en esta conversación
                  </p>
                  <p className="text-[11px] text-text-3">
                    {!agentReady
                      ? "Agente sin activar"
                      : conversation.handoffAt
                        ? "En pausa · atención humana"
                        : conversation.aiEnabled
                          ? "Respondiendo"
                          : "En pausa"}
                  </p>
                </div>
                <Switch
                  size="sm"
                  checked={aiActive}
                  disabled={!agentReady}
                  aria-label="IA en esta conversación"
                  onCheckedChange={() => {
                    if (!agentReady) return;
                    void onPatchConversation({
                      aiEnabled: !conversation.aiEnabled,
                    });
                  }}
                />
              </div>

              {!agentReady && (
                <div className="mt-2.5 flex items-start gap-2 rounded-md border border-[color:var(--warning-border)] bg-[color:var(--warning-bg)] p-2.5">
                  <Sparkles
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--warning-fg)]"
                    strokeWidth={1.7}
                  />
                  <p className="text-[11px] leading-relaxed text-[color:var(--warning-fg)]">
                    {aiConfigured
                      ? "La IA todavía no responde por su cuenta. Configura lo básico del agente y enciéndelo."
                      : "Falta la clave de IA de la instancia (OPENROUTER_API_TOKEN) para que el agente pueda responder."}
                    {aiConfigured && (
                      <Link
                        href="/agent"
                        className="ml-1 whitespace-nowrap font-medium text-brand-text underline underline-offset-2 hover:text-brand"
                      >
                        Configurar agente →
                      </Link>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Stepper de etapa del mock: dot 22px del color de la etapa */}
            {stages.length > 0 && leadId && (
              <>
                <p className="mb-3 mt-6 text-[11px] font-extrabold uppercase tracking-[.6px] text-faint">
                  Etapa del pipeline
                </p>
                <div className="flex flex-col gap-0.5">
                  {stages.map((s) => {
                    const active = s.id === currentStageId;
                    const color = stageColor(s);
                    return (
                      <button
                        key={s.id}
                        onClick={() => void moveToStage(s.id)}
                        className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-subtle"
                        style={
                          active ? { background: stageTint(color) } : undefined
                        }
                      >
                        <span
                          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 text-white"
                          style={{
                            borderColor: active
                              ? color
                              : "var(--border-strong)",
                            background: active ? color : "transparent",
                          }}
                        >
                          {active && (
                            <Check className="h-3 w-3" strokeWidth={3.2} />
                          )}
                        </span>
                        <span
                          className={cn(
                            "text-sm",
                            active
                              ? "font-extrabold text-foreground"
                              : "font-semibold text-mute"
                          )}
                        >
                          {s.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Notas */}
            <p className="mb-2.5 mt-6 text-[11px] font-extrabold uppercase tracking-[.6px] text-faint">
              Notas
            </p>
            <Textarea
              rows={4}
              placeholder="Notas internas sobre este contacto…"
              value={notes}
              disabled={!notesLoaded}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              disabled={savingNotes || !notesLoaded}
              onClick={() => void saveNotes()}
            >
              {savingNotes ? "Guardando…" : "Guardar notas"}
            </Button>
          </>
        )}
      </div>

      {/* Footer de acciones del mock */}
      <div className="border-t px-[22px] py-4">
        {mode === "edit" ? (
          <div className="flex gap-2.5">
            <button
              onClick={() => void saveEdit()}
              disabled={saving || !draftName.trim()}
              className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-accent transition-colors hover:bg-brand-hover disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              onClick={() => {
                setMode("view");
                void refetch();
              }}
              className="rounded-xl border px-5 py-3 text-sm font-bold text-mute transition-colors hover:bg-surface-2"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex gap-2.5">
            <button
              onClick={() => {
                setDraftName(conversation.contact.name);
                setMode("edit");
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-accent transition-colors hover:bg-brand-hover"
            >
              <Pencil className="h-4 w-4" strokeWidth={2.2} />
              Editar
            </button>
            <button
              title="Reiniciar conversación"
              aria-label="Reiniciar conversación"
              disabled={busy}
              onClick={() => setConfirming("reset")}
              className="flex w-12 shrink-0 items-center justify-center rounded-xl border text-mute transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-[17px] w-[17px]" strokeWidth={2} />
            </button>
            <button
              title="Eliminar contacto"
              aria-label="Eliminar contacto"
              disabled={busy}
              onClick={() => setConfirming("delete")}
              className="flex w-12 shrink-0 items-center justify-center rounded-xl border border-brand/40 text-brand transition-colors hover:bg-brand-tint disabled:opacity-50"
            >
              <Trash2 className="h-[17px] w-[17px]" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      {confirming === "delete" && (
        <ConfirmDialog
          title="Eliminar contacto"
          message={
            <>
              Se eliminará{" "}
              <strong className="text-foreground">
                {conversation.contact.name}
              </strong>{" "}
              y toda su información del pipeline. Esta acción no se puede
              deshacer.
            </>
          }
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            setBusy(true);
            const ok = await onDeleteContact(conversation.contact.id);
            setBusy(false);
            setConfirming(null);
            if (ok) toast("Contacto eliminado");
          }}
        />
      )}
      {confirming === "reset" && (
        <ConfirmDialog
          title="Reiniciar conversación"
          message="Se borrará todo el historial de mensajes. El contacto y su etapa del pipeline se conservan."
          confirmLabel="Sí, reiniciar"
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            setBusy(true);
            await onResetConversation();
            setBusy(false);
            setConfirming(null);
            toast("Conversación reiniciada");
          }}
        />
      )}
    </div>
  );
}
