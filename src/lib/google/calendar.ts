import { getEnv } from "@/lib/env";
import { GoogleApiError } from "./client";

/** Evento creado en Google Calendar (subconjunto que usa el CRM). */
export type CalendarEvent = {
  id: string;
  htmlLink: string;
  meetLink: string | null;
  start: string;
  end: string;
};

/**
 * Crea un evento en el calendario primario de la cuenta conectada, con Google
 * Meet e invitaciones por correo a todos los asistentes (`sendUpdates=all`).
 */
export async function createCalendarEvent(input: {
  accessToken: string;
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  attendees: string[];
}): Promise<CalendarEvent> {
  const env = getEnv();
  const url =
    `${env.GOOGLE_API_BASE_URL}/calendar/v3/calendars/primary/events` +
    `?sendUpdates=all&conferenceDataVersion=1`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.startIso },
      end: { dateTime: input.endIso },
      attendees: input.attendees.map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: `seomos-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    id?: string;
    htmlLink?: string;
    hangoutLink?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    error?: { message?: string; status?: string };
  } | null;
  if (!res.ok || !data?.id) {
    throw new GoogleApiError(
      data?.error?.message ?? `Calendar respondió HTTP ${res.status}`,
      res.status,
      data?.error?.status ?? null
    );
  }
  return {
    id: data.id,
    htmlLink: data.htmlLink ?? "",
    meetLink: data.hangoutLink ?? null,
    start: data.start?.dateTime ?? input.startIso,
    end: data.end?.dateTime ?? input.endIso,
  };
}
