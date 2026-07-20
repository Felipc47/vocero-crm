import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { GoogleApiError, refreshAccessToken } from "@/lib/google/client";
import {
  createCalendarEvent,
  queryFreeBusy,
  type BusyInterval,
  type CalendarEvent,
} from "@/lib/google/calendar";
import { publish } from "@/server/events/bus";
import { getCalendarSettings } from "@/server/org-settings";
import {
  getGoogleConnection,
  markGoogleReconnectRequired,
} from "./credentials";

/**
 * Agendamiento de reuniones (004): orquesta conexión → token → evento con
 * Meet → rastro en el contacto. Lo usan el endpoint manual del slide-over y
 * la acción `schedule_meeting` del agente.
 */

export class ScheduleError extends Error {
  code:
    | "not_connected"
    | "reconnect_required"
    | "contact_not_found"
    | "slot_taken"
    | "google_error";

  constructor(code: ScheduleError["code"], message: string) {
    super(message);
    this.name = "ScheduleError";
    this.code = code;
  }
}

export async function scheduleMeeting(input: {
  organizationId: string;
  contactId: string;
  prospectEmail: string;
  startIso: string;
  durationMin?: number;
  title?: string;
}): Promise<CalendarEvent> {
  const db = getDb();

  const contactRows = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        input.organizationId,
        eq(schema.contact.id, input.contactId)
      )
    )
    .limit(1);
  const contact = contactRows[0];
  if (!contact) {
    throw new ScheduleError("contact_not_found", "Contacto no encontrado");
  }

  const connection = await getGoogleConnection(input.organizationId);
  if (!connection) {
    throw new ScheduleError(
      "not_connected",
      "Google Calendar no está conectado (Ajustes → Calendario)"
    );
  }
  if (connection.status === "reconnect_required") {
    throw new ScheduleError(
      "reconnect_required",
      "La conexión con Google venció: reconecta en Ajustes → Calendario"
    );
  }

  const settings = await getCalendarSettings(input.organizationId);
  const title = input.title?.trim() || settings.defaultTitle;
  const durationMin = input.durationMin ?? settings.defaultDurationMin;
  const start = new Date(input.startIso);
  const end = new Date(start.getTime() + durationMin * 60_000);

  // Invitados: prospecto + internos (sin duplicados, sin la cuenta anfitriona
  // — Google la agrega sola como organizador).
  const attendees = Array.from(
    new Set(
      [input.prospectEmail, ...settings.internalInvitees]
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e && e !== connection.accountEmail.toLowerCase())
    )
  );

  let event: CalendarEvent;
  try {
    const accessToken = await refreshAccessToken(connection.refreshToken);

    // Anti-sobreposición: si el calendario ya tiene algo en [start, end), no
    // se crea el evento. Un fallo transitorio del freeBusy no bloquea el
    // agendamiento; la FALTA DE PERMISO sí (agendar a ciegas produce
    // sobreposiciones — se exige reconectar con la casilla marcada).
    try {
      const busy = await queryFreeBusy({
        accessToken,
        timeMinIso: start.toISOString(),
        timeMaxIso: end.toISOString(),
      });
      if (busy.length > 0) {
        throw new ScheduleError(
          "slot_taken",
          "Ese horario ya tiene una reunión agendada"
        );
      }
    } catch (err) {
      if (err instanceof ScheduleError) throw err;
      if (err instanceof GoogleApiError && err.isScopeError) {
        await markGoogleReconnectRequired(input.organizationId);
        throw new ScheduleError(
          "reconnect_required",
          "La conexión de Google no tiene el permiso de disponibilidad: reconecta en Ajustes → Calendario marcando TODAS las casillas"
        );
      }
      console.warn("[agenda] freeBusy falló; se agenda sin verificar:", err);
    }

    event = await createCalendarEvent({
      accessToken,
      summary: title,
      description: `Agendada desde Seomos CRM para ${contact.name} (${contact.phone}).`,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      attendees,
    });
  } catch (err) {
    if (err instanceof ScheduleError) throw err;
    if (err instanceof GoogleApiError && err.isAuthError) {
      await markGoogleReconnectRequired(input.organizationId);
      throw new ScheduleError(
        "reconnect_required",
        "Google rechazó la conexión: reconecta en Ajustes → Calendario"
      );
    }
    throw new ScheduleError(
      "google_error",
      err instanceof Error ? err.message : "Fallo al crear el evento"
    );
  }

  // Rastro en el contacto: correo capturado + nota de la reunión.
  // Siempre en la zona del negocio (el contenedor corre en UTC).
  const when = start.toLocaleString("es-CO", {
    timeZone: settings.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const meetPart = event.meetLink ? ` — ${event.meetLink}` : "";
  const note = `[Reunión] ${when} · ${title}${meetPart}`;
  await db
    .update(schema.contact)
    .set({
      email: contact.email ?? input.prospectEmail,
      notes: contact.notes ? `${contact.notes}\n${note}` : note,
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.contact.organizationId,
        input.organizationId,
        eq(schema.contact.id, input.contactId)
      )
    );

  // El panel de detalles escucha conversation.updated para refrescarse.
  const conv = await db
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        input.organizationId,
        eq(schema.conversation.contactId, input.contactId)
      )
    )
    .limit(1);
  if (conv[0]) {
    // Marca de reunión agendada: el agente la usa para no re-agendar si el
    // modelo repite schedule_meeting (p. ej. tras un "¡Gracias!").
    await db
      .update(schema.conversation)
      .set({ meetingScheduledFor: start, updatedAt: new Date() })
      .where(eq(schema.conversation.id, conv[0].id));
    publish(input.organizationId, {
      type: "conversation.updated",
      data: { conversation: { id: conv[0].id } },
    });
  }

  return event;
}

/**
 * Franjas ocupadas del calendario conectado en una ventana. Para el agente:
 * los llamadores degradan a lista vacía si Google falla (best-effort).
 */
export async function getBusyIntervals(
  organizationId: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<BusyInterval[]> {
  const connection = await getGoogleConnection(organizationId);
  if (!connection || connection.status !== "connected") return [];
  const accessToken = await refreshAccessToken(connection.refreshToken);
  try {
    return await queryFreeBusy({ accessToken, timeMinIso, timeMaxIso });
  } catch (err) {
    // Sin permiso de disponibilidad el agente opera a ciegas: se marca la
    // conexión para reconectar (Ajustes → Calendario lo muestra) y se apaga
    // el agendamiento hasta que el permiso esté otorgado.
    if (err instanceof GoogleApiError && err.isScopeError) {
      await markGoogleReconnectRequired(organizationId);
      console.error(
        "[agenda] la conexión de Google NO tiene el permiso de disponibilidad (freeBusy). Reconecta en Ajustes → Calendario y MARCA la casilla de disponibilidad en la pantalla de Google."
      );
    }
    throw err;
  }
}
