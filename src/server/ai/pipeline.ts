import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { getEnv, isAiConfigured } from "@/lib/env";
import { chatJson, type ChatMessage } from "@/lib/ai";
import { publish } from "@/server/events/bus";
import { isWindowOpen } from "@/server/inbox/window";
import { SendError, sendText } from "@/server/inbox/send";
import { AgentAction, degradeAction, resolveStage, type AgentActionType } from "@/server/ai/actions";
import { matchesHandoffIntent } from "@/server/ai/handoff";
import {
  isSameReplyText,
  REPEAT_WINDOW_MIN,
} from "@/server/ai/repeat-guard";
import {
  inboundMentionsTime,
  quoteAppearsInInbound,
} from "@/server/ai/schedule-confirm";
import { refreshLeadProfile } from "@/server/ai/lead-profile";
import { buildAgentSystemPrompt } from "@/server/ai/prompts";
import { isGoogleConfigured } from "@/lib/env";
import {
  freeRangesByDay,
  isValidMeetingStart,
  localMinutesOfDay,
  minSchedulableStart,
  utcOffsetOf,
  type DayAvailability,
} from "@/lib/business-days";
import { getGoogleConnection } from "@/server/google/credentials";
import {
  getBusyIntervals,
  ScheduleError,
  scheduleMeeting,
} from "@/server/google/scheduling";
import {
  getCalendarSettings,
  type CalendarSettings,
} from "@/server/org-settings";
import type { SchedulingContext } from "@/server/ai/prompts";

/** Etiqueta legible de una fecha en la zona del negocio. */
function formatInTz(d: Date, timezone: string): string {
  return d.toLocaleString("es-CO", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** "9:00 a. m." desde minutos locales. */
function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? "a. m." : "p. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Días hábiles cuya disponibilidad ve el modelo (cubre ~2 semanas). */
const AVAILABILITY_BUSINESS_DAYS = 10;

/** "miércoles, 22 de julio" en la zona del negocio. */
function formatDayInTz(d: Date, timezone: string): string {
  return d.toLocaleDateString("es-CO", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "9:00 a. m." en la zona del negocio. */
function formatHourInTz(d: Date, timezone: string): string {
  return d.toLocaleTimeString("es-CO", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Texto por día que ve el modelo: rangos libres reales o "SIN disponibilidad". */
export function buildAvailabilityLabel(
  days: DayAvailability[],
  timezone: string
): string {
  return days
    .map((d) => {
      const ranges = d.ranges
        .map(
          (r) =>
            `${formatHourInTz(r.start, timezone)} a ${formatHourInTz(r.end, timezone)}`
        )
        .join(" y de ");
      return `- ${formatDayInTz(d.day, timezone)}: ${
        ranges ? `libre de ${ranges}` : "SIN disponibilidad"
      }`;
    })
    .join("\n");
}

/** Disponibilidad por día desde el calendario real (freeBusy). */
async function fetchAvailabilityByDay(
  organizationId: string,
  settings: CalendarSettings
): Promise<DayAvailability[]> {
  const from = minSchedulableStart(new Date(), settings.timezone, {
    leadDays: settings.leadTimeBusinessDays,
    workStartMin: settings.workStartMin,
  });
  const timeMax = new Date(
    from.getTime() + (AVAILABILITY_BUSINESS_DAYS + 6) * 24 * 3600_000
  );
  let busy: { start: Date; end: Date }[];
  try {
    const intervals = await getBusyIntervals(
      organizationId,
      from.toISOString(),
      timeMax.toISOString()
    );
    busy = intervals.map((b) => ({
      start: new Date(b.start),
      end: new Date(b.end),
    }));
  } catch (err) {
    // Sin disponibilidad real el modelo queda ciego: que el log lo grite.
    // Causa típica: la conexión de Google carece del scope calendar.freebusy
    // (reconectar en Ajustes → Calendario tras actualizar los scopes).
    console.error(
      "[agente] freeBusy falló — el agente NO verá la disponibilidad real:",
      err
    );
    return [];
  }
  return freeRangesByDay({
    from,
    timezone: settings.timezone,
    workStartMin: settings.workStartMin,
    workEndMin: settings.workEndMin,
    slotMinutes: settings.slotMinutes,
    busy,
    businessDays: AVAILABILITY_BUSINESS_DAYS,
  });
}

/**
 * Resumen inline de disponibilidad real para negociar por chat: hasta `max`
 * días CON rangos libres ("miércoles, 22 de julio de 8:00 a. m. a 11:30 a. m.
 * · viernes, 24 de julio de 2:00 p. m. a 5:30 p. m."). Null si no hay datos.
 */
async function alternativesText(
  organizationId: string,
  settings: CalendarSettings,
  max = 3
): Promise<string | null> {
  const days = await fetchAvailabilityByDay(organizationId, settings);
  const withRanges = days.filter((d) => d.ranges.length > 0).slice(0, max);
  if (withRanges.length === 0) return null;
  const tz = settings.timezone;
  return withRanges
    .map(
      (d) =>
        `${formatDayInTz(d.day, tz)} de ${d.ranges
          .map(
            (r) => `${formatHourInTz(r.start, tz)} a ${formatHourInTz(r.end, tz)}`
          )
          .join(" y de ")}`
    )
    .join(" · ");
}

/** Contexto temporal del agente (004): hoy + primera disponibilidad. */
function buildSchedulingContext(
  settings: CalendarSettings
): SchedulingContext {
  const now = new Date();
  const timezone = settings.timezone;
  const minStart = minSchedulableStart(now, timezone, {
    leadDays: settings.leadTimeBusinessDays,
    workStartMin: settings.workStartMin,
  });
  return {
    nowLabel: formatInTz(now, timezone),
    minStartLabel: formatInTz(minStart, timezone),
    workHoursLabel: `lunes a viernes de ${minutesLabel(settings.workStartMin)} a ${minutesLabel(settings.workEndMin)}, en franjas de ${settings.slotMinutes} minutos`,
    timezone,
    utcOffset: utcOffsetOf(timezone, now),
  };
}

/**
 * Turno del agente (FR-021..FR-025).
 *
 * Coalesce + lock in-process por conversación: ráfagas de mensajes → UNA
 * respuesta; nunca dos turnos simultáneos; lo que llega durante un turno
 * re-encola exactamente un turno más. Suficiente para el monolito de una
 * instancia (sin colas externas — Constitución II).
 */

type CoalesceEntry = {
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  pending: boolean;
};

const globalForAgent = globalThis as unknown as {
  __agentCoalesce?: Map<string, CoalesceEntry>;
};

function coalesceMap(): Map<string, CoalesceEntry> {
  if (!globalForAgent.__agentCoalesce) {
    globalForAgent.__agentCoalesce = new Map();
  }
  return globalForAgent.__agentCoalesce;
}

/** Punto de entrada con debounce (mensajes entrantes reales). */
export function scheduleAgentTurn(conversationId: string): void {
  const map = coalesceMap();
  const entry = map.get(conversationId) ?? {
    timer: null,
    running: false,
    pending: false,
  };
  map.set(conversationId, entry);

  if (entry.running) {
    entry.pending = true; // se re-encola al terminar el turno actual
    return;
  }
  if (entry.timer) clearTimeout(entry.timer);
  const delay = getEnv().AGENT_COALESCE_MS;
  entry.timer = setTimeout(() => {
    entry.timer = null;
    void executeTurn(conversationId);
  }, delay);
}

async function executeTurn(conversationId: string): Promise<void> {
  const map = coalesceMap();
  const entry = map.get(conversationId);
  if (!entry || entry.running) return;
  entry.running = true;
  try {
    await runAgentTurn(conversationId);
  } catch (err) {
    console.error("[agente] turno falló:", err);
  }
  try {
    // Ficha del lead SIEMPRE, aunque el agente esté apagado o haya handoff:
    // el comercial que atiende a mano también necesita el contexto.
    await refreshProfileForConversation(conversationId);
  } catch (err) {
    console.error("[ficha-lead] refresco falló:", err);
  } finally {
    entry.running = false;
    if (entry.pending) {
      entry.pending = false;
      void executeTurn(conversationId);
    } else {
      map.delete(conversationId);
    }
  }
}

/**
 * Carga la conversación y su historial y recalcula la ficha del lead.
 * El sandbox del Laboratorio queda fuera: una evaluación no debe reescribir
 * la ficha de un contacto real ni gastar tokens del proveedor.
 */
async function refreshProfileForConversation(
  conversationId: string
): Promise<void> {
  if (!isAiConfigured()) return;
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.conversation)
    .where(eq(schema.conversation.id, conversationId))
    .limit(1);
  const conversation = rows[0];
  if (!conversation || conversation.isTest) return;

  const history = await db
    .select({
      direction: schema.message.direction,
      text: schema.message.text,
    })
    .from(schema.message)
    .where(eq(schema.message.conversationId, conversationId))
    .orderBy(desc(schema.message.createdAt))
    .limit(30);
  history.reverse();

  await refreshLeadProfile({
    organizationId: conversation.organizationId,
    contactId: conversation.contactId,
    conversationId,
    history: history.map((m) => ({
      direction: m.direction as "in" | "out",
      text: m.text,
    })),
  });
}

/**
 * Ejecuta UN turno del agente ahora (el Laboratorio lo llama directo, con
 * debounce 0 y sin pasar por el coalesce).
 */
export async function runAgentTurn(conversationId: string): Promise<void> {
  if (!isAiConfigured()) return;

  const db = getDb();
  const convRows = await db
    .select()
    .from(schema.conversation)
    .where(eq(schema.conversation.id, conversationId))
    .limit(1);
  const conversation = convRows[0];
  if (!conversation) return;
  const organizationId = conversation.organizationId;

  // Condiciones de silencio: handoff activo o IA apagada en la conversación.
  if (conversation.handoffAt || !conversation.aiEnabled) return;

  const profileRows = await db
    .select()
    .from(schema.agentProfile)
    .where(eq(schema.agentProfile.organizationId, organizationId))
    .limit(1);
  const profile = profileRows[0];
  if (!profile) return;
  // El toggle global aplica a conversaciones reales; el Laboratorio evalúa el
  // comportamiento configurado aunque el agente aún no esté encendido.
  if (!conversation.isTest && !profile.enabled) return;

  const history = await db
    .select()
    .from(schema.message)
    .where(eq(schema.message.conversationId, conversationId))
    .orderBy(desc(schema.message.createdAt))
    .limit(20);
  history.reverse();
  const lastInbound = [...history].reverse().find((m) => m.direction === "in");
  if (!lastInbound) return;

  // Turno ya atendido: si el último mensaje es SALIENTE, el entrante ya tuvo
  // respuesta. Cierra la carrera del barrido de recuperación (encolaba un
  // turno extra si revisaba mientras el original aún no enviaba) — la causa
  // de respuestas dobles casi idénticas.
  const lastMessage = history[history.length - 1];
  if (lastMessage?.direction === "out") return;

  // Ventana cerrada: el agente JAMÁS envía texto libre → handoff 'ventana'.
  if (!conversation.isTest && !isWindowOpen(conversation.lastInboundAt)) {
    await applyHandoff(conversationId, organizationId, "ventana");
    return;
  }

  // Patrón de respaldo ANTES del LLM (FR-022).
  if (lastInbound.text && matchesHandoffIntent(lastInbound.text)) {
    await applyHandoff(conversationId, organizationId, "cliente");
    return;
  }

  const kb = await db
    .select()
    .from(schema.kbEntry)
    .where(eq(schema.kbEntry.organizationId, organizationId))
    .orderBy(asc(schema.kbEntry.createdAt));
  const stages = await db
    .select({ id: schema.pipelineStage.id, name: schema.pipelineStage.name })
    .from(schema.pipelineStage)
    .where(eq(schema.pipelineStage.organizationId, organizationId))
    .orderBy(asc(schema.pipelineStage.position));

  // 004: la acción schedule_meeting solo se ofrece con Calendar conectado y
  // NUNCA en el sandbox del Laboratorio (una evaluación no crea eventos).
  let calendarAvailable = false;
  let scheduling: SchedulingContext | undefined;
  let calSettings: CalendarSettings | undefined;
  if (!conversation.isTest && isGoogleConfigured()) {
    const googleConn = await getGoogleConnection(organizationId);
    calendarAvailable = googleConn?.status === "connected";
    if (calendarAvailable) {
      calSettings = await getCalendarSettings(organizationId);
      scheduling = buildSchedulingContext(calSettings);
      // Disponibilidad real por día: única fuente para proponer horarios.
      const days = await fetchAvailabilityByDay(organizationId, calSettings);
      if (days.length > 0) {
        scheduling.availabilityLabel = buildAvailabilityLabel(
          days,
          calSettings.timezone
        );
      }
    }
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildAgentSystemPrompt({
        profile,
        kb,
        stages,
        calendarAvailable,
        scheduling,
      }),
    },
    ...history
      .filter((m) => m.text)
      .map((m) => ({
        role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
        content: m.text!,
      })),
  ];

  const result = await chatJson(AgentAction, messages);
  if (!result.ok) {
    if (result.error === "not_configured") return;
    // Fallo persistente del proveedor o salida imposible → escalar (FR-022).
    console.error(`[agente] fallo del proveedor (raw): ${result.detail}`);
    await applyHandoff(conversationId, organizationId, "error");
    return;
  }

  let action: AgentActionType = result.data;

  if (action.action === "move_stage") {
    const stage = resolveStage(action.stage, stages);
    if (!stage) {
      action = degradeAction(action);
    } else {
      await moveLeadToStage(organizationId, conversation.contactId, stage.id);
      publish(organizationId, {
        type: "conversation.updated",
        data: { conversation: { id: conversationId } },
      });
      if (action.reply) {
        await deliverReply(conversation, action.reply);
      }
      return;
    }
  }

  switch (action.action) {
    case "none":
      return;
    case "reply":
      await deliverReply(conversation, action.text);
      return;
    case "update_lead": {
      await appendLeadNote(organizationId, conversation.contactId, action.note);
      if (action.reply) await deliverReply(conversation, action.reply);
      return;
    }
    case "handoff": {
      if (action.farewell) {
        await deliverReply(conversation, action.farewell);
      }
      await applyHandoff(conversationId, organizationId, "modelo");
      return;
    }
    case "schedule_meeting": {
      const inboundTexts = history
        .filter((m) => m.direction === "in" && m.text)
        .map((m) => m.text!);
      await executeScheduleMeeting(
        conversation,
        action,
        calendarAvailable,
        scheduling,
        calSettings,
        inboundTexts
      );
      return;
    }
  }
}

/**
 * 004: ejecuta la acción de agendar. El turno JAMÁS se cae: cualquier fallo
 * degrada a una respuesta honesta + handoff para que un humano confirme.
 */
async function executeScheduleMeeting(
  conversation: Conversation,
  action: Extract<AgentActionType, { action: "schedule_meeting" }>,
  calendarAvailable: boolean,
  scheduling: SchedulingContext | undefined,
  calSettings: CalendarSettings | undefined,
  inboundTexts: string[]
): Promise<void> {
  // Correo con formato real: el modelo a veces copia el placeholder "..."
  // del ejemplo cuando aún no lo tiene — se pide en vez de tumbar el turno.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(action.email.trim())) {
    await deliverReply(
      conversation,
      "Para enviarte la invitación necesito tu correo electrónico. ¿Me lo compartes?",
      { allowRepeat: true }
    );
    return;
  }

  const start = new Date(action.datetime);
  if (!calendarAvailable || !calSettings || Number.isNaN(start.getTime())) {
    // Sin conexión (no debería ofrecerse) o fecha imposible de parsear:
    // pedir la fecha de nuevo en lugar de fallar.
    await deliverReply(
      conversation,
      action.reply ??
        "¿Me confirmas la fecha y hora exactas para la reunión? Por ejemplo: el próximo martes a las 10:00 a.m.",
      { allowRepeat: true }
    );
    return;
  }

  // Repetición del modelo ("¡Gracias!" → re-agendar lo mismo): la reunión ya
  // existe → ni evento duplicado ni re-confirmación (solo el reply si trae
  // uno distinto; el guard de deliverReply filtra los idénticos).
  if (conversation.meetingScheduledFor?.getTime() === start.getTime()) {
    if (action.reply) await deliverReply(conversation, action.reply);
    return;
  }

  // El CLIENTE debe haber confirmado la hora. Dos evidencias independientes:
  // la cita textual del modelo (clientOk) o —para respuestas cortísimas como
  // "11 am", que no llegan al mínimo de la cita— que la hora a agendar aparezca
  // mencionada por el cliente. Sin ninguna → se ofrecen horarios y se espera.
  const confirmedByQuote = quoteAppearsInInbound(action.clientOk, inboundTexts);
  const confirmedByTime = inboundMentionsTime(
    localMinutesOfDay(start, calSettings.timezone),
    inboundTexts
  );
  if (!confirmedByQuote && !confirmedByTime) {
    const opciones = await alternativesText(
      conversation.organizationId,
      calSettings
    );
    await deliverReply(
      conversation,
      opciones
        ? `Antes de agendar, confírmame qué horario te queda mejor. Disponibilidad real: ${opciones}. ¿Cuál prefieres?`
        : "Antes de agendar, confírmame qué día y hora te quedan mejor y con gusto la programo.",
      { allowRepeat: true }
    );
    return;
  }

  // Regla de negocio (004): antelación mínima en días hábiles, a nivel de
  // DÍA (el mínimo abre al inicio de la jornada — jamás "martes 9:24 p.m.").
  const tz = calSettings.timezone;
  const minStart = minSchedulableStart(new Date(), tz, {
    leadDays: calSettings.leadTimeBusinessDays,
    workStartMin: calSettings.workStartMin,
  });
  if (start.getTime() < minStart.getTime()) {
    const minLabel = scheduling?.minStartLabel ?? "dentro de dos días hábiles";
    await deliverReply(
      conversation,
      `Para darte una buena atención, la primera disponibilidad de nuestro equipo es a partir del ${minLabel}. ¿Te funciona ese día u otro posterior? Con gusto lo agendo.`,
      { allowRepeat: true }
    );
    return;
  }

  // Horario laboral y franjas: si el modelo propone fuera, se le pide al
  // cliente una franja válida en lugar de crear un evento absurdo.
  if (
    !isValidMeetingStart(start, tz, {
      workStartMin: calSettings.workStartMin,
      workEndMin: calSettings.workEndMin,
      slotMinutes: calSettings.slotMinutes,
    })
  ) {
    await deliverReply(
      conversation,
      `Agendamos reuniones ${scheduling?.workHoursLabel ?? "de lunes a viernes en horario laboral"}. ¿Qué franja dentro de ese horario te queda bien?`,
      { allowRepeat: true }
    );
    return;
  }

  try {
    const event = await scheduleMeeting({
      organizationId: conversation.organizationId,
      contactId: conversation.contactId,
      prospectEmail: action.email,
      startIso: start.toISOString(),
      title: action.title,
    });
    // El lead pasa a "Agendado": el tablero refleja que ya hay reunión.
    const moved = await moveLeadToScheduledStage(
      conversation.organizationId,
      conversation.contactId
    );
    if (moved) {
      publish(conversation.organizationId, {
        type: "conversation.updated",
        data: { conversation: { id: conversation.id } },
      });
    }

    // Siempre en la zona del negocio (el contenedor corre en UTC).
    const when = formatInTz(start, calSettings.timezone);
    const meetPart = event.meetLink
      ? ` Aquí tienes el enlace de Google Meet: ${event.meetLink}`
      : "";
    await deliverReply(
      conversation,
      action.reply ??
        `¡Listo! Agendé la reunión para el ${when}. Te llegará la invitación al correo ${action.email}.${meetPart}`
    );
  } catch (err) {
    // Choque de agenda: no es un error del sistema — se negocia otra hora
    // ofreciendo franjas realmente libres (sin handoff).
    if (err instanceof ScheduleError && err.code === "slot_taken") {
      // Incluye la hora pedida (cada intento produce un texto distinto) y un
      // panorama por días — no tres franjas seguidas del mismo día.
      const pedida = formatInTz(start, calSettings.timezone);
      const opciones = await alternativesText(
        conversation.organizationId,
        calSettings
      );
      await deliverReply(
        conversation,
        opciones
          ? `Lo siento, el ${pedida} ya está ocupado en nuestra agenda. Disponibilidad real: ${opciones}. ¿Cuál te funciona mejor?`
          : `Lo siento, el ${pedida} ya está ocupado en nuestra agenda. ¿Me propones otro horario y lo intento de nuevo?`,
        { allowRepeat: true }
      );
      return;
    }
    const detail =
      err instanceof ScheduleError ? err.code : "error inesperado";
    console.error(`[agente] schedule_meeting falló (${detail}):`, err);
    await deliverReply(
      conversation,
      "Tuve un inconveniente para agendar en este momento. Un compañero del equipo te confirmará la reunión por aquí muy pronto."
    );
    await applyHandoff(conversation.id, conversation.organizationId, "modelo");
  }
}

type Conversation = typeof schema.conversation.$inferSelect;

/**
 * Entrega la respuesta: envío real o persistencia sandbox (is_test).
 * `allowRepeat` es para las respuestas de negociación que GENERA EL SERVIDOR
 * (choque de agenda, pedir correo/hora): son legítimas aunque se repitan —
 * suprimirlas deja al cliente en silencio ("congelado").
 */
async function deliverReply(
  conversation: Conversation,
  text: string,
  opts?: { allowRepeat?: boolean }
): Promise<void> {
  // Red de seguridad anti-repetición: idéntico al último saliente reciente
  // de la conversación → se suprime (el prompt ya lo prohíbe; esto lo garantiza).
  // La recencia se filtra con el reloj de la BD: es la misma fuente que puso
  // el created_at, así que no depende de la zona horaria del proceso.
  if (!opts?.allowRepeat) {
    const lastOut = await getDb()
      .select({ text: schema.message.text })
      .from(schema.message)
      .where(
        and(
          eq(schema.message.conversationId, conversation.id),
          eq(schema.message.direction, "out"),
          sql`${schema.message.createdAt} > now() - make_interval(mins => ${REPEAT_WINDOW_MIN})`
        )
      )
      .orderBy(desc(schema.message.createdAt))
      .limit(1);
    if (isSameReplyText(text, lastOut[0]?.text)) {
      console.warn(
        `[agente] respuesta idéntica a la anterior en ${conversation.id}: se suprime`
      );
      return;
    }
  }

  if (conversation.isTest) {
    await persistTestOutbound(conversation, text);
    return;
  }
  try {
    await sendText({
      conversationId: conversation.id,
      organizationId: conversation.organizationId,
      text,
      aiGenerated: true,
    });
  } catch (err) {
    if (err instanceof SendError && err.code === "window_closed") {
      await applyHandoff(conversation.id, conversation.organizationId, "ventana");
      return;
    }
    throw err;
  }
}

/** Mensaje saliente del sandbox: se persiste, JAMÁS toca la API (FR-031). */
async function persistTestOutbound(
  conversation: Conversation,
  text: string
): Promise<void> {
  const db = getDb();
  await db.insert(schema.message).values({
    id: newId("message"),
    organizationId: conversation.organizationId,
    conversationId: conversation.id,
    direction: "out",
    type: "text",
    text,
    status: "sent",
    aiGenerated: true,
  });
  await db
    .update(schema.conversation)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.conversation.id, conversation.id));
}

export async function applyHandoff(
  conversationId: string,
  organizationId: string,
  reason: "cliente" | "modelo" | "error" | "ventana"
): Promise<void> {
  const db = getDb();
  const updated = await db
    .update(schema.conversation)
    .set({ handoffAt: new Date(), handoffReason: reason, updatedAt: new Date() })
    .where(eq(schema.conversation.id, conversationId))
    .returning();
  if (!updated[0]) return;
  publish(organizationId, {
    type: "conversation.updated",
    data: {
      conversation: { id: conversationId, handoffReason: reason },
    },
  });
}

async function moveLeadToStage(
  organizationId: string,
  contactId: string,
  stageId: string
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.lead)
    .set({ stageId, updatedAt: new Date(), lastActivityAt: new Date() })
    .where(eq(schema.lead.contactId, contactId));
}

/**
 * Mueve el lead a la etapa `scheduled` ("Agendado") al confirmarse la reunión.
 * Silencioso a propósito: si el operador borró o renombró la etapa, el
 * agendamiento NO se cae — la reunión ya está creada, el tablero es secundario.
 */
async function moveLeadToScheduledStage(
  organizationId: string,
  contactId: string
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.pipelineStage.id })
    .from(schema.pipelineStage)
    .where(
      and(
        eq(schema.pipelineStage.organizationId, organizationId),
        eq(schema.pipelineStage.kind, "scheduled")
      )
    )
    .orderBy(asc(schema.pipelineStage.position))
    .limit(1);
  const stage = rows[0];
  if (!stage) return false;
  await moveLeadToStage(organizationId, contactId, stage.id);
  return true;
}

async function appendLeadNote(
  organizationId: string,
  contactId: string,
  note: string
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.contact.id, notes: schema.contact.notes })
    .from(schema.contact)
    .where(eq(schema.contact.id, contactId))
    .limit(1);
  const contact = rows[0];
  if (!contact) return;
  const stamped = `[IA] ${note}`;
  await db
    .update(schema.contact)
    .set({
      notes: contact.notes ? `${contact.notes}\n${stamped}` : stamped,
      updatedAt: new Date(),
    })
    .where(eq(schema.contact.id, contact.id));
}
