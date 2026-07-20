import type { schema } from "@/lib/db";

type AgentProfile = typeof schema.agentProfile.$inferSelect;
type KbEntry = typeof schema.kbEntry.$inferSelect;

/** Marcador del prompt del juez: el ai-mock lo usa para despachar veredictos. */
export const JUDGE_MARKER = "[JUEZ]";

export function renderKb(entries: KbEntry[]): string {
  if (entries.length === 0) return "(knowledge base vacío)";
  return entries
    .map((e) =>
      e.kind === "qa"
        ? `P: ${e.question}\nR: ${e.answer}`
        : (e.content ?? "")
    )
    .filter(Boolean)
    .join("\n\n");
}

/**
 * System prompt del agente (v1: inyecta el KB completo — el límite se
 * documenta con el contador de tamaño en la UI).
 */
/** 004: contexto temporal para que el agente interprete y proponga fechas. */
export type SchedulingContext = {
  /** Fecha/hora actuales legibles, en la zona del negocio. */
  nowLabel: string;
  /** Primer momento agendable legible (antelación en días hábiles). */
  minStartLabel: string;
  /** Horario laboral legible ("lunes a viernes de 9:00 a. m. a 5:30 p. m., …"). */
  workHoursLabel: string;
  /** Zona horaria IANA del negocio (ej. America/Bogota). */
  timezone: string;
  /** Offset a usar en el ISO (ej. -05:00). */
  utcOffset: string;
};

export function buildAgentSystemPrompt(input: {
  profile: AgentProfile;
  kb: KbEntry[];
  stages: { name: string }[];
  /** 004: true si Google Calendar está conectado — habilita schedule_meeting. */
  calendarAvailable?: boolean;
  /** 004: presente solo cuando calendarAvailable. */
  scheduling?: SchedulingContext;
}): string {
  const { profile } = input;
  const stageNames = input.stages.map((s) => s.name).join(" | ");
  return [
    `Eres "${profile.name}", el asistente de WhatsApp de este negocio. Respondes SIEMPRE en español neutro, con mensajes breves y naturales para chat.`,
    profile.tone ? `Tono: ${profile.tone}` : null,
    profile.instructions ? `Instrucciones del negocio:\n${profile.instructions}` : null,
    profile.escalationRules
      ? `Reglas de escalado a humano:\n${profile.escalationRules}`
      : null,
    profile.greeting ? `Saludo sugerido para conversaciones nuevas: ${profile.greeting}` : null,
    `CONOCIMIENTO DEL NEGOCIO (tu única fuente de verdad; si algo no está aquí, NO lo inventes — di que lo confirmarás con el equipo o escala):\n${renderKb(input.kb)}`,
    `Etapas del pipeline disponibles: ${stageNames}`,
    input.calendarAvailable && input.scheduling
      ? [
          `FECHA Y HORA ACTUALES: ${input.scheduling.nowLabel} (zona ${input.scheduling.timezone}).`,
          `Usa SIEMPRE esta fecha para interpretar expresiones como "mañana", "el viernes" o "la próxima semana".`,
          `AGENDA DEL EQUIPO (estas reglas del sistema PREVALECEN sobre cualquier otra instrucción de agendamiento):`,
          `- Primera disponibilidad: ${input.scheduling.minStartLabel}. NUNCA aceptes ni propongas nada anterior; si el cliente pide antes, explícalo con amabilidad y ofrece 2-3 opciones desde esa fecha.`,
          `- Horario de reuniones: ${input.scheduling.workHoursLabel}.`,
        ].join("\n")
      : null,
    [
      "En cada turno respondes ÚNICAMENTE un objeto JSON con UNA acción:",
      '- {"action":"none"} — no responder nada.',
      '- {"action":"reply","text":"..."} — responder al cliente.',
      '- {"action":"update_lead","note":"...","reply":"..."} — guardar una nota del lead (reply opcional).',
      '- {"action":"move_stage","stage":"<nombre exacto de etapa>","reply":"..."} — mover el lead (reply opcional).',
      '- {"action":"handoff","reason":"...","farewell":"..."} — escalar a un humano (farewell opcional para despedirte).',
      ...(input.calendarAvailable
        ? [
            `- {"action":"schedule_meeting","email":"...","datetime":"<ISO 8601 con offset ${input.scheduling?.utcOffset ?? "-05:00"}, ej. 2026-07-20T15:00:00${input.scheduling?.utcOffset ?? "-05:00"}>","reply":"..."} — agendar la reunión/sesión de diagnóstico en el calendario (reply opcional para confirmar).`,
          ]
        : []),
      "Reglas duras:",
      "- Si el cliente pide hablar con una persona/humano/asesor → handoff.",
      "- Si la pregunta NO está cubierta por el conocimiento → NO inventes: responde que lo confirmarás o escala.",
      "- Si detectas intención clara de compra → move_stage a la etapa de interesados y confirma al cliente.",
      "- NUNCA repitas un mensaje que ya enviaste en la conversación: si el historial muestra que ya confirmaste o informaste algo, no lo vuelvas a enviar.",
      '- Si el cliente solo agradece, confirma o se despide ("gracias", "listo", "ok", "adiós") sin pedir nada nuevo → SIEMPRE despídete con UN cierre breve y cálido (ej. "¡Con mucho gusto! Cualquier cosa me escribes."); nunca lo dejes sin respuesta y JAMÁS repitas una confirmación anterior. Usa {"action":"none"} SOLO si ya te despediste y el cliente vuelve a agradecer.',
      ...(input.calendarAvailable
        ? [
            "- Para agendar una reunión: primero pide el CORREO del cliente y acuerda FECHA Y HORA concretas; solo usa schedule_meeting cuando tengas ambos confirmados. El sistema envía la invitación con Google Meet al correo.",
            "- schedule_meeting se usa UNA sola vez por reunión: si en el historial ya confirmaste el agendamiento, NO la vuelvas a usar salvo que el cliente pida cambiar la fecha u hora.",
          ]
        : []),
      "- JSON puro, sin markdown ni texto adicional.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Prompt del juez del Laboratorio: UNA llamada por conversación (FR-032). */
export function buildJudgePrompt(input: {
  persona: string;
  transcript: { role: "cliente" | "agente"; text: string }[];
  kbText: string;
  behaviorText: string;
}): { system: string; user: string } {
  const system = [
    `${JUDGE_MARKER} Eres un evaluador de calidad independiente de agentes de WhatsApp. Evalúas UNA conversación simulada completa contra el conocimiento y comportamiento configurados. Eres estricto: la alucinación (inventar datos que no están en el conocimiento) es la falla más grave.`,
    "Respondes ÚNICAMENTE un objeto JSON con este esquema:",
    '{"veredicto":"verde"|"amarillo"|"rojo","hallazgos":[{"tipo":"alucinacion"|"fuera_de_kb"|"debio_escalar"|"tono","evidencia":"cita textual del transcript","sugerencia":{"pregunta":"...","respuesta":"..."}}]}',
    "- verde: sin problemas relevantes. amarillo: mejorable. rojo: falla grave.",
    "- `sugerencia` es opcional: inclúyela cuando una nueva entrada P/R del knowledge base evitaría el problema.",
    "- Si el agente respondió sobre un tema que NO está en el conocimiento → hallazgo fuera_de_kb (o alucinacion si afirmó datos concretos).",
    "- Si el cliente pidió un humano y no hubo escalado → debio_escalar.",
  ].join("\n");

  const transcript = input.transcript
    .map((t) => `${t.role === "cliente" ? "CLIENTE" : "AGENTE"}: ${t.text}`)
    .join("\n");

  const user = [
    `PERSONA SIMULADA: ${input.persona}`,
    `COMPORTAMIENTO CONFIGURADO:\n${input.behaviorText || "(sin configurar)"}`,
    `CONOCIMIENTO CONFIGURADO:\n${input.kbText || "(vacío)"}`,
    `TRANSCRIPT COMPLETO:\n${transcript}`,
    "Evalúa y responde el JSON.",
  ].join("\n\n");

  return { system, user };
}
