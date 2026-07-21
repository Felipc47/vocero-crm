/**
 * Traducción de errores de entrega de la Cloud API a español operable.
 * Meta reporta el fallo por webhook con `code` + texto en inglés; aquí se
 * convierte a un mensaje que el operador entienda sin buscar el código.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */

const BY_CODE: Record<number, string> = {
  131049:
    "Meta no lo entregó para no saturar al destinatario (límite de mensajes de marketing que esta persona puede recibir). Suele entrar si reintentas en unos días, o responde cuando el cliente escriba primero.",
  130472:
    "El destinatario forma parte de un experimento de Meta y por ahora no recibe mensajes de marketing.",
  131026:
    "No se pudo entregar: el número no tiene WhatsApp o no acepta mensajes.",
  131047:
    "Pasaron más de 24 horas desde el último mensaje del cliente: solo puede enviarse una plantilla aprobada.",
  131042:
    "Problema de facturación en la cuenta de WhatsApp Business (método de pago faltante o vencido).",
  131048:
    "Envíos pausados: el número alcanzó el límite por reportes de spam.",
  131031:
    "La cuenta de WhatsApp Business está restringida o bloqueada por incumplimiento de políticas.",
  131056:
    "Demasiados mensajes seguidos a este mismo número: espera unos minutos y reintenta.",
  132015: "La plantilla está pausada por baja calidad y no puede enviarse.",
  132016: "La plantilla fue deshabilitada por baja calidad.",
  132001: "La plantilla no existe en el idioma configurado.",
  132007: "El contenido de la plantilla infringe las políticas de WhatsApp.",
  132012:
    "Los parámetros enviados no coinciden con las variables de la plantilla.",
  131021: "El destinatario es el mismo número que envía.",
  131052: "No se pudo descargar el archivo multimedia del mensaje.",
  131053: "No se pudo subir el archivo multimedia del mensaje.",
  131057: "La cuenta está en modo mantenimiento en Meta.",
  131016: "El servicio de Meta no está disponible temporalmente.",
  131000: "Error interno de Meta al procesar el envío.",
  131005: "Acceso denegado: revisa los permisos del token de WhatsApp.",
  131045:
    "Fallo de registro del número: verifica el registro del teléfono en Meta.",
};

/** Reconoce los textos en inglés más comunes para filas ya guardadas. */
const BY_TEXT: [RegExp, number][] = [
  [/healthy ecosystem engagement/i, 131049],
  [/experiment/i, 130472],
  [/undeliverable/i, 131026],
  [/re-?engagement/i, 131047],
  [/payment|eligibility/i, 131042],
  [/spam rate/i, 131048],
  [/account.*(locked|restricted)/i, 131031],
  [/rate limit hit|too many messages/i, 131056],
  [/template.*paused/i, 132015],
  [/template.*disabled/i, 132016],
  [/template does not exist/i, 132001],
  [/maintenance/i, 131057],
  [/service unavailable/i, 131016],
];

/** Mensaje en español para un error del webhook de estados. */
export function describeDeliveryError(
  err: { code?: number; title?: string; message?: string } | undefined
): string {
  if (!err) return "Envío fallido";
  const known = err.code !== undefined ? BY_CODE[err.code] : undefined;
  if (known) return known;
  const raw = err.message ?? err.title;
  if (!raw) return "Envío fallido";
  return err.code !== undefined ? `${raw} (código ${err.code})` : raw;
}

/**
 * Traduce un error ya persistido (posiblemente en inglés, de antes de la
 * traducción en el ingest). Si no se reconoce, se devuelve tal cual.
 */
export function translateStoredError(raw: string): string {
  for (const [pattern, code] of BY_TEXT) {
    const known = BY_CODE[code];
    if (known && pattern.test(raw)) return known;
  }
  return raw;
}
