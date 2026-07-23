"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Check,
  Copy,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type CompanyDto = {
  id: string;
  name: string;
  createdAt: string;
  members: number;
  contacts: number;
  whatsappConnected: boolean;
  adminEmail: string | null;
};

function randomPassword(): string {
  // Legible para dictar por teléfono: 3 bloques de 4, sin ambiguos (0/O, 1/l).
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const block = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map((b) => abc[b % abc.length])
      .join("");
  return `${block()}-${block()}-${block()}`;
}

function NewCompanyDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (summary: { name: string; email: string; password: string }) => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState(randomPassword());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/companies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ companyName, adminName, adminEmail, adminPassword }),
    }).catch(() => null);
    setSaving(false);
    if (!res) {
      setError("Sin conexión con el servidor");
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo crear la empresa");
      return;
    }
    onCreated({ name: companyName, email: adminEmail, password: adminPassword });
  }

  const field =
    "w-full rounded-[11px] border bg-surface-2 px-3.5 py-[10px] text-[14px] outline-none transition-colors focus:border-brand focus:bg-background focus:ring-[3px] focus:ring-brand-soft";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Nueva empresa"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border bg-surface p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Nueva empresa</h2>
          <button
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-md p-1.5 text-mute transition-colors hover:bg-subtle hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
        <div className="flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-bold text-text-2">
              Nombre de la empresa
            </span>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ferretería El Tornillo"
              className={field}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-bold text-text-2">
              Nombre del admin
            </span>
            <input
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="María Pérez"
              className={field}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-bold text-text-2">
              Correo del admin
            </span>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="maria@eltornillo.co"
              className={field}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-bold text-text-2">
              Contraseña temporal
            </span>
            <span className="flex gap-2">
              <input
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className={cn(field, "font-mono")}
              />
              <button
                aria-label="Generar otra contraseña"
                title="Generar otra"
                onClick={() => setAdminPassword(randomPassword())}
                className="shrink-0 rounded-[11px] border bg-surface-2 px-3 text-mute transition-colors hover:text-foreground"
              >
                <RefreshCw className="h-4 w-4" strokeWidth={2} />
              </button>
            </span>
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            disabled={
              saving ||
              !companyName.trim() ||
              !adminName.trim() ||
              !adminEmail.trim() ||
              adminPassword.length < 8
            }
            onClick={() => void submit()}
          >
            {saving ? "Creando…" : "Crear empresa"}
          </Button>
          <p className="text-[11.5px] leading-snug text-text-3">
            La empresa nace con su pipeline y su agente listos. El admin entra
            en esta misma dirección con su correo y contraseña, y configura su
            WhatsApp, bot y equipo en Ajustes.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Credenciales recién creadas: visibles UNA vez para copiar y compartir. */
function CreatedBanner({
  summary,
  onDismiss,
}: {
  summary: { name: string; email: string; password: string };
  onDismiss: () => void;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const text = `${summary.name} — acceso al CRM\nURL: ${window.location.origin}/login\nCorreo: ${summary.email}\nContraseña temporal: ${summary.password}`;
  return (
    <div className="mb-5 rounded-[13px] border border-brand/40 bg-brand-tint p-4">
      <p className="mb-1 text-[13.5px] font-bold">
        Empresa «{summary.name}» creada
      </p>
      <p className="mb-3 text-[12.5px] text-text-2">
        Comparte estas credenciales con el admin — la contraseña no se vuelve a
        mostrar: <span className="font-mono font-bold">{summary.email}</span> ·{" "}
        <span className="font-mono font-bold">{summary.password}</span>
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              toast("Credenciales copiadas");
            });
          }}
        >
          {copied ? (
            <Check className="h-4 w-4" strokeWidth={2} />
          ) : (
            <Copy className="h-4 w-4" strokeWidth={2} />
          )}
          Copiar credenciales
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Entendido
        </Button>
      </div>
    </div>
  );
}

export function CompaniesClient() {
  const [companies, setCompanies] = useState<CompanyDto[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/admin/companies").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { companies: CompanyDto[] };
    setCompanies(data.companies);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8 md:px-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-[24px] font-bold">Empresas</h1>
            <p className="text-[13px] text-text-3">
              Cada empresa tiene su espacio aislado: su WhatsApp, su bot, su
              equipo y sus datos.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            Nueva empresa
          </Button>
        </div>

        {created && (
          <CreatedBanner summary={created} onDismiss={() => setCreated(null)} />
        )}

        {companies === null ? (
          <p className="py-10 text-center text-sm text-text-3">Cargando…</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {companies.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-4 rounded-[15px] border bg-surface px-5 py-4"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-brand-tint text-brand">
                  <Building2 className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">
                    {c.name}
                  </span>
                  <span className="block truncate text-[12.5px] text-text-3">
                    {c.adminEmail ?? "sin admin"} · desde{" "}
                    {new Date(c.createdAt).toLocaleDateString("es-CO", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </span>
                <span className="hidden items-center gap-1.5 text-[12.5px] font-semibold text-mute sm:flex">
                  <Users className="h-4 w-4" strokeWidth={2} />
                  {c.members}
                </span>
                <span className="hidden text-[12.5px] font-semibold text-mute sm:block">
                  {c.contacts} contactos
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-extrabold",
                    c.whatsappConnected
                      ? "bg-success/15 text-success"
                      : "bg-surface-2 text-mute"
                  )}
                >
                  {c.whatsappConnected ? "WhatsApp ✓" : "Sin WhatsApp"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <NewCompanyDialog
          onClose={() => setCreating(false)}
          onCreated={(summary) => {
            setCreating(false);
            setCreated(summary);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
