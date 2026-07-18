"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarCheck2, Plus, X } from "lucide-react";
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
import { useToast } from "@/components/ui/toast";

type CalendarState = {
  googleConfigured: boolean;
  connection: {
    accountEmail: string;
    status: "connected" | "reconnect_required";
  } | null;
  settings: {
    internalInvitees: string[];
    defaultTitle: string;
    defaultDurationMin: number;
  };
};

const RESULT_MESSAGES: Record<string, string> = {
  conectado: "Google Calendar conectado",
  "estado-invalido": "La autorización no se pudo validar. Intenta de nuevo.",
  "sin-refresh-token":
    "Google no entregó un token duradero. Intenta conectar de nuevo.",
  "sin-configurar": "Faltan las credenciales de Google en la instancia.",
  error: "La conexión con Google falló. Intenta de nuevo.",
};

export function CalendarClient() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const [state, setState] = useState<CalendarState | null>(null);
  const [invitees, setInvitees] = useState<string[]>([]);
  const [newInvitee, setNewInvitee] = useState("");
  const [title, setTitle] = useState("Sesión de diagnóstico");
  const [duration, setDuration] = useState(45);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/calendar").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as CalendarState;
    setState(data);
    setInvitees(data.settings.internalInvitees);
    setTitle(data.settings.defaultTitle);
    setDuration(data.settings.defaultDurationMin);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Resultado del callback OAuth (?resultado=...)
  const resultado = searchParams.get("resultado");
  useEffect(() => {
    if (resultado && RESULT_MESSAGES[resultado]) {
      toast(RESULT_MESSAGES[resultado]);
      window.history.replaceState(null, "", "/settings/calendar");
    }
  }, [resultado, toast]);

  if (!state) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  function addInvitee() {
    const email = newInvitee.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    if (invitees.includes(email) || invitees.length >= 10) return;
    setInvitees([...invitees, email]);
    setNewInvitee("");
  }

  async function saveSettings() {
    setSaving(true);
    const res = await fetch("/api/settings/calendar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        internalInvitees: invitees,
        defaultTitle: title.trim() || "Sesión de diagnóstico",
        defaultDurationMin: duration,
      }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) toast("Ajustes de calendario guardados");
  }

  async function disconnect() {
    setDisconnecting(true);
    const res = await fetch("/api/settings/calendar", {
      method: "DELETE",
    }).catch(() => null);
    setDisconnecting(false);
    if (res?.ok) {
      toast("Cuenta de Google desconectada");
      void refetch();
    }
  }

  return (
    <div className="space-y-6">
      {/* Estado de conexión */}
      {!state.googleConfigured ? (
        <div className="rounded-2xl border border-[color:var(--warning-border)] bg-[color:var(--warning-bg)] p-5 text-sm text-[color:var(--warning-fg)]">
          <p className="font-bold">
            Faltan las credenciales de Google en la instancia.
          </p>
          <p className="mt-1 leading-relaxed">
            Agrega <code className="font-bold">GOOGLE_CLIENT_ID</code> y{" "}
            <code className="font-bold">GOOGLE_CLIENT_SECRET</code> a las
            variables de entorno (guía en{" "}
            <code className="font-bold">docs/google-calendar.md</code>) y
            reinicia la instancia. Mientras tanto, el CRM funciona normal sin
            agendamiento.
          </p>
        </div>
      ) : state.connection ? (
        <div className="flex items-center gap-3.5 rounded-[14px] border border-[color:var(--success-border)] bg-[color:var(--success-bg)] px-5 py-4">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-success">
            <CalendarCheck2 className="h-5 w-5 text-white" strokeWidth={2.4} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-semibold">
              Cuenta conectada: {state.connection.accountEmail}
            </p>
            <p className="text-[13px] font-semibold text-mute">
              Las reuniones se crean en su calendario con Google Meet.
            </p>
          </div>
          {state.connection.status === "reconnect_required" ? (
            <Badge variant="warning">Reconexión necesaria</Badge>
          ) : (
            <Badge variant="success">Conectada</Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={disconnecting}
            onClick={() => void disconnect()}
          >
            Desconectar
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Conectar Google Calendar</CardTitle>
            <CardDescription>
              Conecta la cuenta de Google donde se crearán las reuniones (la
              del comercial o la del CEO). Cada reunión invita al prospecto y a
              los invitados internos, con Google Meet incluido.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a href="/api/google/oauth/start">
              <Button>Conectar Google Calendar</Button>
            </a>
          </CardContent>
        </Card>
      )}

      {(state.connection || state.googleConfigured) && (
        <Card>
          <CardHeader>
            <CardTitle>Invitados internos</CardTitle>
            <CardDescription>
              Correos de tu equipo (comercial, CEO) que se invitan a TODAS las
              reuniones, además del prospecto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {invitees.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-surface-2 px-3 py-1.5 text-[13px] font-bold"
                >
                  {email}
                  <button
                    aria-label={`Quitar ${email}`}
                    onClick={() =>
                      setInvitees(invitees.filter((e) => e !== email))
                    }
                    className="text-mute transition-colors hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </button>
                </span>
              ))}
              {invitees.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Sin invitados internos: solo el prospecto y la cuenta
                  conectada.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="correo@seomos.com"
                value={newInvitee}
                onChange={(e) => setNewInvitee(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addInvitee();
                }}
              />
              <Button variant="secondary" onClick={addInvitee}>
                <Plus className="h-4 w-4" /> Agregar
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cal-title">Título por defecto</Label>
                <Input
                  id="cal-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cal-duration">Duración (minutos)</Label>
                <select
                  id="cal-duration"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="flex h-11 w-full rounded-xl border border-border bg-surface-2 px-3.5 text-sm font-medium focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft"
                >
                  {[30, 45, 60, 90].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button disabled={saving} onClick={() => void saveSettings()}>
              {saving ? "Guardando…" : "Guardar ajustes"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
