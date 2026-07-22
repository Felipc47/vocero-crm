"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw, Send, Users } from "lucide-react";
import type {
  AudienceFilterDto,
  CampaignDto,
  CampaignRecipientDto,
  ContactDto,
  StageDto,
  TemplateDto,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEvents } from "@/components/use-events";

type ServiceDto = { id: string; name: string };

const STATUS_BADGE: Record<
  CampaignDto["status"],
  { label: string; variant: "secondary" | "warning" | "success" | "destructive" }
> = {
  draft: { label: "Borrador", variant: "secondary" },
  running: { label: "Enviando", variant: "warning" },
  paused: { label: "En pausa", variant: "secondary" },
  done: { label: "Terminada", variant: "success" },
  failed: { label: "Con error", variant: "destructive" },
};

const AUDIENCE_LABEL: Record<AudienceFilterDto["mode"], string> = {
  all: "Todos los contactos",
  stages: "Por etapa del pipeline",
  services: "Por servicio",
  manual: "Selección manual",
};

const selectClass =
  "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CampaignsClient() {
  const [campaigns, setCampaigns] = useState<CampaignDto[]>([]);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [stages, setStages] = useState<StageDto[]>([]);
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [contacts, setContacts] = useState<ContactDto[]>([]);

  // Formulario de creación
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [variableMode, setVariableMode] =
    useState<CampaignDto["variableMode"]>("contact_name");
  const [variableValue, setVariableValue] = useState("");
  const [mode, setMode] = useState<AudienceFilterDto["mode"]>("all");
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  type Preview = {
    total: number;
    eligible: number;
    withoutConsent: number;
    isMarketing: boolean;
    messagingLimit: {
      tier: string | null;
      cap: number | null;
      exceeds: boolean;
      overflow: number;
    };
  };
  const [preview, setPreview] = useState<Preview | null>(null);
  const [includeWithoutConsent, setIncludeWithoutConsent] = useState(false);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Detalle abierto
  const [openId, setOpenId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipientDto[]>([]);

  const approved = useMemo(
    () => templates.filter((t) => t.status === "approved"),
    [templates]
  );
  const selectedTemplate = approved.find((t) => t.id === templateId);
  const needsVariable = selectedTemplate
    ? /\{\{\s*1\s*\}\}/.test(selectedTemplate.body)
    : false;

  const refetch = useCallback(async () => {
    const res = await fetch("/api/campaigns").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { campaigns: CampaignDto[] };
    setCampaigns(data.campaigns);
  }, []);

  useEffect(() => {
    void refetch();
    void (async () => {
      const [t, s, sv, c] = await Promise.all([
        fetch("/api/templates").catch(() => null),
        fetch("/api/pipeline/stages").catch(() => null),
        fetch("/api/services").catch(() => null),
        fetch("/api/contacts").catch(() => null),
      ]);
      if (t?.ok)
        setTemplates(((await t.json()) as { templates: TemplateDto[] }).templates);
      if (s?.ok) setStages(((await s.json()) as { stages: StageDto[] }).stages);
      if (sv?.ok)
        setServices(((await sv.json()) as { services: ServiceDto[] }).services);
      if (c?.ok)
        setContacts(((await c.json()) as { contacts: ContactDto[] }).contacts);
    })();
  }, [refetch]);

  const refetchDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { recipients: CampaignRecipientDto[] };
    setRecipients(data.recipients);
  }, []);

  // Progreso en vivo: cada avance del despachador refresca lista y detalle.
  useEvents({
    onCampaignProgress: () => {
      void refetch();
      if (openId) void refetchDetail(openId);
    },
    onReconnect: () => void refetch(),
  });

  function buildAudience(): AudienceFilterDto {
    if (mode === "stages") return { mode: "stages", stageIds };
    if (mode === "services") return { mode: "services", serviceIds };
    if (mode === "manual") return { mode: "manual", contactIds };
    return { mode: "all" };
  }

  const audienceReady =
    mode === "all" ||
    (mode === "stages" && stageIds.length > 0) ||
    (mode === "services" && serviceIds.length > 0) ||
    (mode === "manual" && contactIds.length > 0);

  useEffect(() => {
    setPreview(null);
    if (!audienceReady) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/campaigns/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          audience: buildAudience(),
          templateId: templateId || undefined,
        }),
      }).catch(() => null);
      if (!res?.ok || cancelled) return;
      const data = (await res.json()) as Preview;
      if (!cancelled) setPreview(data);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, stageIds, serviceIds, contactIds, audienceReady, templateId]);

  async function create() {
    setCreating(true);
    setMsg(null);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        templateId,
        variableMode: needsVariable ? variableMode : "none",
        variableValue: variableValue.trim() || undefined,
        audience: buildAudience(),
        includeWithoutConsent,
      }),
    }).catch(() => null);
    setCreating(false);

    if (res?.ok) {
      setName("");
      setContactIds([]);
      setMsg("Campaña creada ✓ — revísala y pulsa «Enviar»");
      void refetch();
    } else {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setMsg(data?.error?.message ?? "No se pudo crear la campaña");
    }
  }

  async function act(id: string, action: "start" | "pause" | "retry") {
    setMsg(null);
    const res = await fetch(`/api/campaigns/${id}/${action}`, {
      method: "POST",
    }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setMsg(data?.error?.message ?? "No se pudo completar la acción");
    }
    void refetch();
    if (openId === id) void refetchDetail(id);
  }

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  const filteredContacts = contacts
    .filter((c) => !c.archivedAt)
    .filter((c) =>
      search.trim()
        ? `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())
        : true
    )
    .slice(0, 100);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Nueva campaña</CardTitle>
          <CardDescription>
            Envía una plantilla aprobada a muchos contactos, a ritmo seguro
            (≈1 mensaje por segundo). Solo plantillas aprobadas: es el único
            camino permitido fuera de la ventana de 24 horas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {approved.length === 0 && (
            <p className="rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-[13px] text-mute">
              Todavía no tienes plantillas aprobadas por Meta. Crea una en
              <strong className="text-foreground"> Plantillas</strong> y vuelve
              cuando esté aprobada.
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cmp-name">Nombre de la campaña</Label>
              <Input
                id="cmp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Reactivación de leads · julio"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cmp-template">Plantilla aprobada</Label>
              <select
                id="cmp-template"
                className={selectClass}
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">Elige una plantilla…</option>
                {approved.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedTemplate && (
            <p className="whitespace-pre-wrap rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-[13px] text-text-2">
              {selectedTemplate.body}
            </p>
          )}

          {needsVariable && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cmp-var">Valor de {"{{1}}"}</Label>
                <select
                  id="cmp-var"
                  className={selectClass}
                  value={variableMode}
                  onChange={(e) =>
                    setVariableMode(
                      e.target.value as CampaignDto["variableMode"]
                    )
                  }
                >
                  <option value="contact_name">Nombre del contacto</option>
                  <option value="fixed">Un valor fijo</option>
                </select>
              </div>
              {variableMode === "fixed" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cmp-var-value">Texto fijo</Label>
                  <Input
                    id="cmp-var-value"
                    value={variableValue}
                    onChange={(e) => setVariableValue(e.target.value)}
                    placeholder="20% de descuento"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cmp-mode">Audiencia</Label>
            <select
              id="cmp-mode"
              className={selectClass}
              value={mode}
              onChange={(e) =>
                setMode(e.target.value as AudienceFilterDto["mode"])
              }
            >
              {(
                Object.keys(AUDIENCE_LABEL) as AudienceFilterDto["mode"][]
              ).map((m) => (
                <option key={m} value={m}>
                  {AUDIENCE_LABEL[m]}
                </option>
              ))}
            </select>
          </div>

          {mode === "stages" && (
            <div className="flex flex-wrap gap-2">
              {stages.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStageIds((prev) => toggle(prev, s.id))}
                  className={chipClass(stageIds.includes(s.id))}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {mode === "services" && (
            <div className="flex flex-wrap gap-2">
              {services.length === 0 && (
                <p className="text-[13px] text-mute">
                  No hay servicios configurados todavía.
                </p>
              )}
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceIds((prev) => toggle(prev, s.id))}
                  className={chipClass(serviceIds.includes(s.id))}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {mode === "manual" && (
            <div className="flex flex-col gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contacto por nombre o teléfono…"
              />
              <div className="max-h-[220px] overflow-y-auto rounded-xl border border-border">
                {filteredContacts.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-[13px] last:border-b-0 hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={contactIds.includes(c.id)}
                      onChange={() =>
                        setContactIds((prev) => toggle(prev, c.id))
                      }
                    />
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-mute">{c.phone}</span>
                  </label>
                ))}
                {filteredContacts.length === 0 && (
                  <p className="px-3 py-3 text-[13px] text-mute">
                    Sin contactos que coincidan.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Avisos de cumplimiento (006): consentimiento y tope del número. */}
          {preview && preview.withoutConsent > 0 && (
            <div className="rounded-xl border border-[color:var(--warning-border)] bg-[color:var(--warning-bg)] px-3.5 py-3">
              <p className="text-[13px] font-bold text-[color:var(--warning-fg)]">
                {preview.withoutConsent} contacto(s) quedan fuera por falta de
                consentimiento
              </p>
              <p className="mt-1 text-[12.5px] text-[color:var(--warning-fg)] opacity-90">
                Esta plantilla es de MARKETING y Meta exige permiso previo. Se
                excluyen los contactos de alta manual o importados que no lo
                tengan confirmado en su ficha.
              </p>
              <label className="mt-2 flex items-start gap-2 text-[12.5px] font-semibold text-[color:var(--warning-fg)]">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={includeWithoutConsent}
                  onChange={(e) => setIncludeWithoutConsent(e.target.checked)}
                />
                Incluirlos de todos modos — confirmo que tengo su permiso
              </label>
            </div>
          )}

          {preview?.messagingLimit.exceeds && (
            <div className="rounded-xl border border-[color:var(--warning-border)] bg-[color:var(--warning-bg)] px-3.5 py-3">
              <p className="text-[13px] font-bold text-[color:var(--warning-fg)]">
                La audiencia supera el límite de tu número
              </p>
              <p className="mt-1 text-[12.5px] text-[color:var(--warning-fg)] opacity-90">
                Meta te permite iniciar{" "}
                {preview.messagingLimit.cap?.toLocaleString("es-CO")}{" "}
                conversaciones nuevas por 24 h
                {preview.messagingLimit.tier
                  ? ` (${preview.messagingLimit.tier})`
                  : ""}
                . Sobran {preview.messagingLimit.overflow.toLocaleString("es-CO")}
                : esos envíos serán rechazados. Divide la campaña en varios
                días o sube de escalón enviando a más contactos que respondan.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[13px] text-mute">
              <Users className="h-4 w-4" strokeWidth={1.9} />
              {preview === null
                ? "Elige una audiencia para ver el alcance"
                : includeWithoutConsent
                  ? `${preview.total} destinatario(s)`
                  : `${preview.eligible} destinatario(s)`}
            </span>
            <Button
              onClick={() => void create()}
              disabled={
                creating ||
                !name.trim() ||
                !templateId ||
                !audienceReady ||
                preview === null ||
                (includeWithoutConsent ? preview.total : preview.eligible) === 0
              }
            >
              <Send className="h-4 w-4" strokeWidth={1.9} />
              {creating ? "Creando…" : "Crear campaña"}
            </Button>
          </div>

          {msg && <p className="text-[13px] text-text-2">{msg}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campañas</CardTitle>
          <CardDescription>
            El progreso se actualiza en vivo mientras se envía.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {campaigns.length === 0 && (
            <p className="text-[13px] text-mute">
              Todavía no has creado ninguna campaña.
            </p>
          )}
          {campaigns.map((c) => {
            const badge = STATUS_BADGE[c.status];
            const pct =
              c.progress.total > 0
                ? Math.round(
                    ((c.progress.sent + c.progress.failed) /
                      c.progress.total) *
                      100
                  )
                : 0;
            const open = openId === c.id;
            return (
              <div
                key={c.id}
                className="rounded-xl border border-border bg-surface-2 px-3.5 py-3"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold">
                    {c.name}
                  </span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {(c.status === "draft" || c.status === "paused") && (
                    <Button
                      size="sm"
                      onClick={() => void act(c.id, "start")}
                      disabled={c.progress.pending === 0}
                    >
                      <Play className="h-4 w-4" strokeWidth={1.9} />
                      {c.status === "paused" ? "Reanudar" : "Enviar"}
                    </Button>
                  )}
                  {c.status === "running" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void act(c.id, "pause")}
                    >
                      <Pause className="h-4 w-4" strokeWidth={1.9} />
                      Pausar
                    </Button>
                  )}
                  {c.progress.failed > 0 && c.status !== "running" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void act(c.id, "retry")}
                    >
                      <RotateCcw className="h-4 w-4" strokeWidth={1.9} />
                      Reintentar fallidos
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setOpenId(open ? null : c.id);
                      if (!open) void refetchDetail(c.id);
                    }}
                  >
                    {open ? "Ocultar" : "Detalle"}
                  </Button>
                </div>

                <p className="mt-1.5 text-[12.5px] text-mute">
                  Plantilla <strong className="text-text-2">{c.templateName}</strong> ·{" "}
                  {c.progress.sent} enviados · {c.progress.failed} fallidos ·{" "}
                  {c.progress.total} en total
                </p>

                <div className="mt-2 h-[6px] w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {c.error && (
                  <p className="mt-2 text-[12.5px] text-[color:var(--danger-fg)]">
                    {c.error}
                  </p>
                )}

                {open && (
                  <div className="mt-3 max-h-[260px] overflow-y-auto rounded-xl border border-border bg-surface">
                    {recipients.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-[13px] last:border-b-0"
                      >
                        <span className="font-semibold">{r.contactName}</span>
                        <span className="text-mute">{r.contactPhone}</span>
                        <span className="ml-auto">
                          {r.status === "sent" && (
                            <Badge variant="success">Enviado</Badge>
                          )}
                          {r.status === "pending" && (
                            <Badge variant="secondary">En cola</Badge>
                          )}
                          {r.status === "failed" && (
                            <Badge variant="destructive">Falló</Badge>
                          )}
                        </span>
                        {r.error && (
                          <span className="w-full text-[12px] text-mute">
                            {r.error}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function chipClass(active: boolean): string {
  return active
    ? "rounded-full border border-transparent bg-brand px-3 py-1.5 text-[13px] font-bold text-white"
    : "rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-bold text-mute hover:bg-surface-2 hover:text-foreground";
}
