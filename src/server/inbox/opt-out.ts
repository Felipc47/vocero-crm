/**
 * Detección de solicitudes de BAJA en mensajes entrantes (006).
 *
 * La política de Meta obliga a respetar la petición de dejar de recibir
 * mensajes. Marcar la baja por error es caro (el negocio pierde un cliente
 * en silencio), así que el detector es DELIBERADAMENTE conservador: solo
 * frases inequívocas. Palabras sueltas ambiguas en español —«baja», «para»,
 * «no»— jamás bastan por sí solas.
 */

/** Frases que expresan la baja sin ambigüedad posible. */
const PHRASES: RegExp[] = [
  // Español
  /\bno\s+(?:me\s+)?(?:escriban|escribas|escriba|contacten|contacte|manden|env[íi]en)\b/,
  // Ojo: «no quiero recibir …» necesita un objeto que hable de mensajería —
  // «no quiero recibir la factura en papel» NO es una baja.
  /\bno\s+quiero\s+recibir\s+(?:mas\b|nada\b|mensajes|publicidad|promociones|ofertas|informacion|sus\b|correos)/,
  /\bno\s+quiero\s+(?:mas\s+mensajes|que\s+me\s+escriban|que\s+me\s+contacten)/,
  /\bno\s+me\s+(?:vuelvan|vuelvas)\s+a\s+(?:escribir|contactar|llamar)/,
  /\b(?:d[ae]r|d[áa]|dame|quiero|quisiera|deseo)\s*(?:me\s+)?de\s+baja\b/,
  /\bdarme\s+de\s+baja\b/,
  /\bme\s+doy\s+de\s+baja\b/,
  /\bd[ée]jenme\s+(?:en\s+paz|tranquilo|tranquila)\b/,
  /\bdejen\s+de\s+(?:escribirme|enviarme|mandarme|molestar)/,
  /\bdeja\s+de\s+(?:escribirme|enviarme|mandarme|molestar)/,
  /\belimin(?:en|a|ar)\s+(?:mi|el)\s+(?:n[úu]mero|contacto|dato)/,
  /\bborr(?:en|a|ar)\s+(?:mi|el)\s+(?:n[úu]mero|contacto|dato)/,
  /\bcancelar\s+(?:la\s+)?suscripci[óo]n\b/,
  /\bno\s+deseo\s+recibir\s+(?:mas\b|nada\b|mensajes|publicidad|promociones|ofertas|informacion|sus\b|correos)/,
  // Inglés
  /\bunsubscribe\b/,
  /\bstop\s+(?:messag|sending|texting|contacting)/,
  /\bdo\s*n[o']?t\s+(?:message|text|contact|write)\s+me\b/,
  /\bremove\s+me\s+from\b/,
  /\bopt\s*[-\s]?out\b/,
];

/**
 * Palabras que valen SOLAS únicamente si son todo el mensaje. «STOP» es la
 * convención universal de baja; suelto dentro de una frase no significa nada.
 */
const STANDALONE = new Set(["stop", "unsubscribe", "baja", "cancelar"]);

/** Normaliza para comparar: minúsculas, sin acentos ni puntuación de sobra. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¡!¿?.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Devuelve el texto que motivó la baja, o `null` si el mensaje no la pide.
 * Solo se evalúan mensajes de texto: un audio o una imagen nunca dan de baja.
 */
export function detectOptOut(text: string | null | undefined): string | null {
  if (!text) return null;
  const normalized = normalize(text);
  if (!normalized) return null;

  // Mensaje que es EXACTAMENTE una palabra clave de baja.
  if (STANDALONE.has(normalized)) return text.trim().slice(0, 200);

  // El acento se eliminó al normalizar, así que los patrones con í/á/é
  // igualan por su alternativa sin tilde.
  for (const phrase of PHRASES) {
    if (phrase.test(normalized)) return text.trim().slice(0, 200);
  }
  return null;
}
