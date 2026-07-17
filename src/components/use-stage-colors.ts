"use client";

import { useEffect, useState } from "react";
import type { StageDto } from "@/lib/types";
import { stageColor } from "@/lib/stage-colors";

const FALLBACK = "#5B6B8C";

/**
 * Mapa nombre-de-etapa → color derivado (mock SEOMOS). Un solo fetch de
 * /api/pipeline/stages por montaje; los DTOs que solo traen stageName
 * (conversaciones, contactos) resuelven su color aquí.
 */
export function useStageColors(): (stageName: string | null) => string {
  const [byName, setByName] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pipeline/stages")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { stages: StageDto[] } | null) => {
        if (cancelled || !data) return;
        setByName(
          Object.fromEntries(data.stages.map((s) => [s.name, stageColor(s)]))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (stageName) => (stageName ? (byName[stageName] ?? FALLBACK) : FALLBACK);
}
