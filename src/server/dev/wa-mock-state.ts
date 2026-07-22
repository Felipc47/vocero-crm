/**
 * Estado en memoria del harness wa-mock (solo dev/test). Vive en globalThis
 * porque Next recarga módulos en dev; una instancia = un proceso, así que el
 * outbox en memoria es suficiente para las aserciones del self-test.
 */

export type OutboxEntry = {
  n: number;
  phoneNumberId: string;
  to: string;
  type: string;
  body: unknown;
  at: string;
};

export type MockTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  body: string;
};

type WaMockState = {
  outbox: OutboxEntry[];
  templates: MockTemplate[];
  counter: number;
  /** Envíos que el mock debe RECHAZAR antes de volver a aceptar. Permite
   * ejercer el camino infeliz (destinatario que falla y luego se reintenta)
   * sin depender de la disponibilidad real de Meta. */
  failNextSends: number;
  /** Cómo falla: `delivery` (culpa del destinatario) o `auth` (token caído). */
  failNextMode: "delivery" | "auth";
};

const globalForMock = globalThis as unknown as { __waMockState?: WaMockState };

/** Semilla del contador: los `wamid.mock.*` deben ser únicos ENTRE reinicios
 * del proceso (la BD persiste y dedupe por wa_message_id UNIQUE); arrancar en
 * 0 hacía chocar los ids de corridas anteriores y el self-test fallaba. */
function seedCounter(): number {
  return Date.now();
}

export function getWaMockState(): WaMockState {
  if (!globalForMock.__waMockState) {
    globalForMock.__waMockState = {
      outbox: [],
      templates: [],
      counter: seedCounter(),
      failNextSends: 0,
      failNextMode: "delivery",
    };
  }
  return globalForMock.__waMockState;
}

export function resetWaMockState(): void {
  globalForMock.__waMockState = {
    outbox: [],
    templates: [],
    counter: seedCounter(),
    failNextSends: 0,
    failNextMode: "delivery",
  };
}

export function nextN(): number {
  return ++getWaMockState().counter;
}
