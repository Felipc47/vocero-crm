"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import type { TemplateDto } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUS_BADGE: Record<
  TemplateDto["status"],
  { label: string; variant: "secondary" | "warning" | "success" | "destructive" }
> = {
  draft: { label: "Borrador", variant: "secondary" },
  awaiting_approval: { label: "Por aprobar (admin)", variant: "warning" },
  pending: { label: "Pendiente de Meta", variant: "warning" },
  approved: { label: "Aprobada", variant: "success" },
  rejected: { label: "Rechazada", variant: "destructive" },
};

export function TemplatesClient({
  canApprove = true,
}: {
  /** Admin/superadmin: aprueba plantillas, elige el saludo y elimina. */
  canApprove?: boolean;
}) {
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  // 004: plantilla que se envía automáticamente a los leads de Meta Ads.
  const [greetingTemplateId, setGreetingTemplateId] = useState<string | "">("");
  const [savingGreeting, setSavingGreeting] = useState(false);
  const [greetingMsg, setGreetingMsg] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const [res, lg] = await Promise.all([
      fetch("/api/templates").catch(() => null),
      fetch("/api/settings/leadgen").catch(() => null),
    ]);
    if (res?.ok) {
      const data = (await res.json()) as { templates: TemplateDto[] };
      setTemplates(data.templates);
    }
    if (lg?.ok) {
      const data = (await lg.json()) as {
        settings: { greetingTemplateId: string | null };
      };
      setGreetingTemplateId(data.settings.greetingTemplateId ?? "");
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function saveGreeting(value: string) {
    setGreetingTemplateId(value);
    setSavingGreeting(true);
    setGreetingMsg(null);
    const res = await fetch("/api/settings/leadgen", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ greetingTemplateId: value || null }),
    }).catch(() => null);
    setSavingGreeting(false);
    setGreetingMsg(res?.ok ? "Guardado ✓" : "No se pudo guardar");
  }

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    const res = await fetch("/api/templates/sync", { method: "POST" }).catch(
      () => null
    );
    setSyncing(false);
    if (res?.ok) {
      const data = (await res.json()) as { updated: number };
      setSyncMsg(
        data.updated > 0
          ? `${data.updated} plantilla(s) actualizada(s)`
          : "Todo al día"
      );
      void refetch();
    } else {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setSyncMsg(data?.error?.message ?? "No se pudo sincronizar");
    }
  }

  const approved = templates.filter((t) => t.status === "approved");

  return (
    <div className="max-w-3xl space-y-6">
      {/* 004: saludo automático para leads de Meta Ads (solo admin) */}
      {canApprove && (
      <Card>
        <CardHeader>
          <CardTitle>Saludo automático para leads de Meta</CardTitle>
          <CardDescription>
            Cuando llega un lead nuevo desde tus campañas de Meta, se le envía
            esta plantilla por WhatsApp (con {"{{1}}"} = su primer nombre) y el
            agente IA continúa la conversación cuando responda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <select
              value={greetingTemplateId}
              onChange={(e) => void saveGreeting(e.target.value)}
              disabled={savingGreeting}
              className="flex h-11 w-full max-w-sm rounded-xl border border-border bg-surface-2 px-3.5 text-sm font-medium focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft"
            >
              <option value="">No enviar saludo automático</option>
              {approved.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.language})
                </option>
              ))}
            </select>
            {greetingMsg && (
              <span className="text-xs font-bold text-mute">{greetingMsg}</span>
            )}
          </div>
          {approved.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Necesitas al menos una plantilla aprobada por Meta.
            </p>
          )}
        </CardContent>
      </Card>
      )}

      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Las plantillas permiten reabrir conversaciones con la ventana de 24 h
          cerrada. Meta las aprueba en horas o días; el estado se actualiza por
          webhook y con el botón Sincronizar (imprescindible en modo agencia,
          donde los eventos de plantillas no llegan al webhook de la instancia).
        </p>
        <Button variant="outline" size="sm" disabled={syncing} onClick={() => void sync()}>
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          Sincronizar
        </Button>
      </div>
      {syncMsg && <p className="text-xs text-muted-foreground">{syncMsg}</p>}

      <CreateForm onCreated={() => void refetch()} />

      <div className="space-y-2">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            isGreeting={t.id === greetingTemplateId}
            canApprove={canApprove}
            onChanged={() => void refetch()}
          />
        ))}
        {templates.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Sin plantillas todavía. Crea la primera arriba — por ejemplo un
            «seguimos disponibles, ¿retomamos tu cotización?» para
            conversaciones frías.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Ficha de plantilla: categoría visible (MARKETING queda sujeta al límite por
 * destinatario de Meta, error 131049), edición del cuerpo/categoría y borrado.
 */
function TemplateCard({
  template: t,
  isGreeting,
  canApprove,
  onChanged,
}: {
  template: TemplateDto;
  isGreeting: boolean;
  canApprove: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(t.body);
  const [category, setCategory] = useState(
    t.category === "MARKETING" ? "MARKETING" : "UTILITY"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const marketing = t.category?.toUpperCase() === "MARKETING";

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/templates/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body, category }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo editar la plantilla");
      return;
    }
    setEditing(false);
    onChanged();
  }

  async function approve() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/templates/${t.id}/approve`, {
      method: "POST",
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo aprobar la plantilla");
      return;
    }
    onChanged();
  }

  async function rejectInternal() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/templates/${t.id}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("No se pudo devolver la plantilla");
      return;
    }
    onChanged();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/templates/${t.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo eliminar la plantilla");
      setConfirmDelete(false);
      return;
    }
    onChanged();
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-sm font-medium">
          {t.name}{" "}
          <span className="text-muted-foreground">({t.language})</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={marketing ? "warning" : "secondary"}>
            {marketing ? "MARKETING" : "UTILITY"}
          </Badge>
          <Badge variant={STATUS_BADGE[t.status].variant}>
            {STATUS_BADGE[t.status].label}
          </Badge>
        </div>
      </div>

      {marketing && (
        <p className="mt-2 text-xs text-warning">
          Categoría MARKETING: Meta limita cuántos mensajes promocionales recibe
          cada persona (de todos los negocios), así que algunos envíos pueden no
          entregarse. Las UTILITY de seguimiento no tienen ese límite.
        </p>
      )}

      {editing ? (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`edit-body-${t.id}`}>Cuerpo</Label>
            <Textarea
              id={`edit-body-${t.id}`}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-cat-${t.id}`}>Categoría</Label>
            <select
              id={`edit-cat-${t.id}`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-9 w-full max-w-xs rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="UTILITY">UTILITY (seguimiento)</option>
              <option value="MARKETING">MARKETING</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Al guardar, Meta vuelve a revisar la plantilla y queda pendiente
            hasta que la apruebe. El nombre y el idioma no se pueden cambiar:
            para eso hay que eliminarla y crearla de nuevo.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !body.trim()} onClick={() => void save()}>
              {busy ? "Enviando a Meta…" : "Guardar y reenviar a revisión"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setBody(t.body);
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">{t.body}</p>
          {t.status === "rejected" && t.rejectionReason && (
            <p className="mt-2 text-xs text-destructive">
              Razón del rechazo: {t.rejectionReason}
            </p>
          )}
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          {confirmDelete ? (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm">
                ¿Eliminar <span className="font-mono">{t.name}</span>? Se borra
                también en Meta y no se puede deshacer.
                {isGreeting && (
                  <>
                    {" "}
                    Es tu saludo automático de leads: quedará en «No enviar
                    saludo automático» hasta que elijas otra.
                  </>
                )}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  {busy ? "Eliminando…" : "Sí, eliminar"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {t.status === "awaiting_approval" && canApprove && (
                <>
                  <Button size="sm" disabled={busy} onClick={() => void approve()}>
                    {busy ? "Enviando a Meta…" : "Aprobar y enviar a Meta"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void rejectInternal()}
                  >
                    Devolver
                  </Button>
                </>
              )}
              {t.status === "awaiting_approval" && !canApprove && (
                <p className="text-xs text-muted-foreground">
                  Esperando la aprobación del admin para enviarse a Meta.
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setBody(t.body);
                  setCategory(marketing ? "MARKETING" : "UTILITY");
                  setEditing(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>
              {canApprove && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("es_CO");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING">("UTILITY");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, language, category, body }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo crear la plantilla");
      return;
    }
    setName("");
    setBody("");
    onCreated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva plantilla</CardTitle>
        <CardDescription>
          Cuerpo con máximo UNA variable <code>{"{{1}}"}</code> (v1). Se envía a
          aprobación de Meta al crearla.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Nombre</Label>
            <Input
              id="tpl-name"
              placeholder="seguimiento_cotizacion"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-lang">Idioma</Label>
            <select
              id="tpl-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="es_CO">es_CO (Colombia)</option>
              <option value="es">es (español genérico)</option>
              <option value="es_MX">es_MX (México)</option>
              <option value="es_AR">es_AR (Argentina)</option>
              <option value="en_US">en_US</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-cat">Categoría</Label>
            <select
              id="tpl-cat"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as "UTILITY" | "MARKETING")
              }
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="UTILITY">UTILITY (seguimiento)</option>
              <option value="MARKETING">MARKETING</option>
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-body">Cuerpo</Label>
          <Textarea
            id="tpl-body"
            rows={3}
            placeholder="Hola {{1}}, seguimos disponibles. ¿Retomamos tu cotización?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          disabled={saving || !name.trim() || !body.trim()}
          onClick={() => void create()}
        >
          {saving ? "Enviando a Meta…" : "Crear y enviar a aprobación"}
        </Button>
      </CardContent>
    </Card>
  );
}
