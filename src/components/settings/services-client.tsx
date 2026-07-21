"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Plus, Trash2, X } from "lucide-react";
import type { TemplateDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type ServiceDto = {
  id: string;
  name: string;
  greetingTemplateId: string | null;
  templateName: string | null;
  forms: string[];
};

type DetectedForm = {
  formId: string;
  leads: number;
  lastAt: string;
  linked: boolean;
};

/**
 * Ajustes → Servicios: vinculación de formularios de Meta Lead Ads. Cada
 * servicio (SEO, desarrollo web…) define la plantilla de saludo que recibe
 * el lead de sus formularios; sin vínculo aplica el saludo global de
 * Ajustes → Plantillas.
 */
export function ServicesClient() {
  const toast = useToast();
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [detected, setDetected] = useState<DetectedForm[]>([]);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ServiceDto | null>(null);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/services").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      services: ServiceDto[];
      detectedForms: DetectedForm[];
    };
    setServices(data.services);
    setDetected(data.detectedForms);
  }, []);

  useEffect(() => {
    void refetch();
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates?: TemplateDto[] }) =>
        setTemplates((d.templates ?? []).filter((t) => t.status === "approved"))
      )
      .catch(() => {});
  }, [refetch]);

  async function createService() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    setCreating(false);
    if (!res?.ok) {
      toast("No se pudo crear el servicio");
      return;
    }
    setNewName("");
    toast(`Servicio "${name}" creado`);
    void refetch();
  }

  async function patchService(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/services/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res?.ok) toast("No se pudo guardar el cambio");
    void refetch();
  }

  async function removeService(svc: ServiceDto) {
    setBusy(true);
    const res = await fetch(`/api/services/${svc.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusy(false);
    setDeleting(null);
    if (res?.ok) toast("Servicio eliminado");
    void refetch();
  }

  async function linkForm(serviceId: string, formId: string) {
    const clean = formId.trim();
    if (!clean) return;
    const res = await fetch(`/api/services/${serviceId}/forms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ formId: clean }),
    }).catch(() => null);
    if (!res?.ok) {
      toast("No se pudo vincular el formulario");
      return;
    }
    toast("Formulario vinculado");
    void refetch();
  }

  async function unlinkForm(serviceId: string, formId: string) {
    await fetch(`/api/services/${serviceId}/forms`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ formId }),
    }).catch(() => null);
    void refetch();
  }

  const unlinked = detected.filter((d) => !d.linked);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Servicios</CardTitle>
          <CardDescription>
            Vincula cada formulario de Meta a un servicio y elige la plantilla
            de saludo que recibirán sus leads. Un formulario sin vincular usa
            el saludo global de la sección Plantillas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Nuevo servicio (ej. SEO, Desarrollo web…)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createService();
              }}
            />
            <Button
              disabled={creating || !newName.trim()}
              onClick={() => void createService()}
            >
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          </div>

          {services.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aún no hay servicios. Crea el primero (ej. &quot;SEO&quot;,
              &quot;Desarrollo web&quot;) y vincúlale sus formularios.
            </p>
          )}

          <ul className="space-y-3">
            {services.map((svc) => (
              <li
                key={svc.id}
                className="rounded-[14px] border bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <p className="min-w-0 flex-1 truncate font-display text-[15px] font-bold">
                    {svc.name}
                  </p>
                  <select
                    value={svc.greetingTemplateId ?? ""}
                    onChange={(e) =>
                      void patchService(svc.id, {
                        greetingTemplateId: e.target.value || null,
                      })
                    }
                    className="rounded-[9px] border bg-surface-2 px-3 py-2 text-[13px] font-semibold outline-none focus:border-brand"
                  >
                    <option value="">Saludo global (sin plantilla propia)</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label={`Eliminar servicio ${svc.name}`}
                    title="Eliminar servicio"
                    onClick={() => setDeleting(svc)}
                    className="flex h-[36px] w-[36px] items-center justify-center rounded-[9px] border border-brand/40 bg-brand-tint text-brand transition-colors hover:bg-brand-soft"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {svc.forms.map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-bold text-mute"
                    >
                      Form {f}
                      <button
                        aria-label={`Desvincular formulario ${f}`}
                        onClick={() => void unlinkForm(svc.id, f)}
                        className="text-faint transition-colors hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2.4} />
                      </button>
                    </span>
                  ))}
                  {svc.forms.length === 0 && (
                    <span className="text-xs text-faint">
                      Sin formularios vinculados todavía.
                    </span>
                  )}
                </div>

                <AddFormInline onLink={(formId) => void linkForm(svc.id, formId)} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {unlinked.length > 0 && services.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Formularios detectados sin vincular</CardTitle>
            <CardDescription>
              Formularios de Meta que ya enviaron leads a esta instancia y aún
              no pertenecen a ningún servicio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {unlinked.map((d) => (
                <li
                  key={d.formId}
                  className="flex flex-wrap items-center gap-3 rounded-[12px] border bg-surface px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">Form {d.formId}</p>
                    <p className="text-xs text-mute">
                      {d.leads} {d.leads === 1 ? "lead recibido" : "leads recibidos"}
                    </p>
                  </div>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) void linkForm(e.target.value, d.formId);
                    }}
                    className="rounded-[9px] border bg-surface-2 px-3 py-2 text-[13px] font-semibold outline-none focus:border-brand"
                  >
                    <option value="" disabled>
                      Vincular a…
                    </option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {deleting && (
        <ConfirmDialog
          title="Eliminar servicio"
          message={
            <>
              Se eliminará{" "}
              <strong className="text-foreground">{deleting.name}</strong> y la
              vinculación de sus formularios (los leads de esos formularios
              pasarán a usar el saludo global).
            </>
          }
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void removeService(deleting)}
        />
      )}
    </div>
  );
}

/** Input compacto para vincular un form por id (los detectados salen abajo). */
function AddFormInline({ onLink }: { onLink: (formId: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="mt-3 flex items-center gap-2">
      <Input
        placeholder="ID del formulario de Meta (ej. 1629528354923529)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onLink(value);
            setValue("");
          }
        }}
        className="max-w-[340px]"
      />
      <Button
        variant="ghost"
        disabled={!value.trim()}
        onClick={() => {
          onLink(value);
          setValue("");
        }}
      >
        <Link2 className="h-4 w-4" />
        Vincular
      </Button>
    </div>
  );
}
