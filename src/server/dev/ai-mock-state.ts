/**
 * Estado en memoria del ai-mock (solo dev/test): permite forzar los caminos
 * infelices del proveedor de IA desde el guion de self-test.
 */

type AiMockState = {
  /** Transcripciones que deben fallar antes de volver a funcionar. */
  failNextTranscriptions: number;
  /** Turnos de chat CON IMAGEN que el "modelo" debe rechazar. */
  failNextVision: number;
};

const globalForAiMock = globalThis as unknown as {
  __aiMockState?: AiMockState;
};

export function getAiMockState(): AiMockState {
  if (!globalForAiMock.__aiMockState) {
    globalForAiMock.__aiMockState = {
      failNextTranscriptions: 0,
      failNextVision: 0,
    };
  }
  return globalForAiMock.__aiMockState;
}
