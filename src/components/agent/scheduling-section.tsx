"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

/**
 * Comportamiento del AGENDAMIENTO del agente (004b): horario, franjas y
 * antelación mínima. El sistema aplica estas reglas por encima de las
 * instrucciones de texto del agente.
 */

type State = {
  googleConfigured: boolean;
  connection: { accountEmail: string; status: string } | null;
  settings: {
    workStartMin: number;
    workEndMin: number;
    slotMinutes: number;
    leadTimeBusinessDays: number;
  };
};

const selectCls =
  "flex h-11 w-full rounded-xl border border-border bg-surface-2 px-3.5 text-sm font-medium focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft";

function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? "a. m." : "p. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Opciones de hora cada 30 min entre 6:00 y 21:00. */
const HOUR_OPTIONS = Array.from({ length: 31 }, (_, i) => 6 * 60 + i * 30);

export function SchedulingSection() {
  const toast = useToast();
  const [state, setState] = useState<State | null>(null);
  const [workStart, setWorkStart] = useState(9 * 60);
  const [workEnd, setWorkEnd] = useState(17 * 60 + 30);
  const [slot, setSlot] = useState(30);
  const [leadDays, setLeadDays] = useState(2);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/calendar").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as State;
    setState(data);
    setWorkStart(data.settings.workStartMin);
    setWorkEnd(data.settings.workEndMin);
    setSlot(data.settings.slotMinutes);
    setLeadDays(data.settings.leadTimeBusinessDays);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!state) return null;

  async function save() {
    if (workEnd - slot < workStart) {
      toast("El fin de jornada debe dejar al menos una franja completa");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings/calendar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workStartMin: workStart,
        workEndMin: workEnd,
        slotMinutes: slot,
        leadTimeBusinessDays: leadDays,
      }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) toast("Agendamiento guardado");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="h-5 w-5 text-brand" strokeWidth={2} />
            <CardTitle>Agendamiento</CardTitle>
          </div>
          {state.connection ? (
            <Badge variant="success">
              Calendar: {state.connection.accountEmail}
            </Badge>
          ) : (
            <Badge variant="warning">Calendar sin conectar</Badge>
          )}
        </div>
        <CardDescription>
          Reglas con las que el agente ofrece y agenda reuniones. El sistema
          las aplica SIEMPRE, por encima de las instrucciones de texto — no
          hace falta repetirlas arriba.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!state.connection && (
          <p className="rounded-xl border border-[color:var(--warning-border)] bg-[color:var(--warning-bg)] p-3 text-[13px] leading-relaxed text-[color:var(--warning-fg)]">
            Sin una cuenta de Google conectada el agente no ofrece agendar.{" "}
            <Link
              href="/settings/calendar"
              className="font-bold underline underline-offset-2"
            >
              Conectar en Ajustes → Calendario
            </Link>
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="sch-start">Inicio de jornada</Label>
            <select
              id="sch-start"
              value={workStart}
              onChange={(e) => setWorkStart(Number(e.target.value))}
              className={selectCls}
            >
              {HOUR_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {minutesLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sch-end">Fin de jornada</Label>
            <select
              id="sch-end"
              value={workEnd}
              onChange={(e) => setWorkEnd(Number(e.target.value))}
              className={selectCls}
            >
              {HOUR_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {minutesLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sch-slot">Franjas de</Label>
            <select
              id="sch-slot"
              value={slot}
              onChange={(e) => setSlot(Number(e.target.value))}
              className={selectCls}
            >
              {[15, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} minutos
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sch-lead">Antelación mínima</Label>
            <select
              id="sch-lead"
              value={leadDays}
              onChange={(e) => setLeadDays(Number(e.target.value))}
              className={selectCls}
            >
              {[0, 1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "Mismo día" : `${d} día${d > 1 ? "s" : ""} hábil${d > 1 ? "es" : ""}`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Hoy: el agente ofrece reuniones de lunes a viernes de{" "}
          <strong className="text-foreground">{minutesLabel(workStart)}</strong>{" "}
          a <strong className="text-foreground">{minutesLabel(workEnd)}</strong>
          , cada {slot} min, desde{" "}
          <strong className="text-foreground">
            {leadDays === 0 ? "el mismo día" : `${leadDays} días hábiles`}
          </strong>{" "}
          después del contacto (al inicio de la jornada).
        </p>
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? "Guardando…" : "Guardar agendamiento"}
        </Button>
      </CardContent>
    </Card>
  );
}
