# 006 — Cumplimiento de la política de Meta en el envío masivo

## Objetivo

El envío masivo (005) cumplía la parte técnica —solo plantillas aprobadas,
ritmo lento— pero permitía violar la **política** de Meta: no registraba el
consentimiento ni respetaba las bajas. Esta spec cierra ese hueco.

## Prioridad (orden de implementación pedido por el dueño)

1. **Opt-out** — el que más protege el número.
2. **Tope por tier** — evita quemar la lista contra el límite de Meta.
3. **Opt-in** — registro del consentimiento.

## Requisitos funcionales

### Baja (opt-out)

- **FR-201** `contact.opted_out_at` + `opted_out_reason`. Un contacto dado de
  baja queda **excluido de toda audiencia**, en los cuatro modos —incluida la
  selección manual: el operador no puede saltarse una baja marcándolo a mano.
- **FR-202** Detección automática en mensajes ENTRANTES de texto, con frases
  inequívocas en español e inglés. **Conservadora por diseño**: las palabras
  sueltas ambiguas («baja», «para», «cancelar») solo valen si son el mensaje
  completo. Cubierta por `tests/unit/opt-out.test.ts`.
- **FR-203** La baja **solo se retira a mano** desde la ficha. Que el contacto
  vuelva a escribir NO la reactiva.
- **FR-204** Badge «Baja» visible en la lista y en la ficha, con la frase que
  la motivó.

### Límite de mensajería (tier)

- **FR-205** Se lee `messaging_limit_tier` del número vía Graph. Si falla, se
  degrada en silencio: un aviso ausente nunca impide enviar.
- **FR-206** La previsualización avisa si la audiencia supera el tope de
  conversaciones nuevas por 24 h, diciendo cuántas caben y cuántas sobran. Es
  un **aviso**, no un bloqueo.
- **FR-207** Si Meta responde con un error que afecta a TODA la campaña
  (límite de spam, cuenta restringida, sin facturación, plantilla pausada por
  calidad, mantenimiento, límite de tasa), la campaña se **pausa** con el
  motivo en vez de marcar fallidos a todos los pendientes.

### Consentimiento (opt-in)

- **FR-208** `contact.consent_source` ∈ {meta_lead_ads, inbound_message,
  manual, imported}, asignado automáticamente en cada punto de alta.
- **FR-209** Consentimiento implícito: Lead Ads y quien escribió al negocio.
  Los demás requieren confirmación manual (`consent_granted_at`) desde la
  ficha — es el ~5% que llega por otros medios.
- **FR-210** Las campañas con plantilla **MARKETING** excluyen por defecto a
  quien no tenga consentimiento, diciendo cuántos quedan fuera, con opción
  explícita de incluirlos bajo confirmación del operador. Las **UTILITY** no
  se restringen así.

## Criterios de aceptación (verificados en vivo)

Guion `tests/e2e/us12-cumplimiento-meta.sh` — 25 comprobaciones, todas verdes:
origen del consentimiento por vía de alta · exclusión MARKETING vs UTILITY ·
baja automática y su frase · la baja gana sobre la selección manual · frase
normal que menciona «baja» NO da de baja · la baja no se reactiva sola ·
lectura del tier y aviso de exceso · pausa ante el límite de spam · campaña
sin nadie con consentimiento rechazada y luego forzada por el operador.

## Nota de alcance

Queda FUERA de esta spec el pie de «cómo darse de baja» dentro del cuerpo de
las plantillas: el texto lo aprueba Meta y se edita en la sección Plantillas,
no es algo que el CRM deba inyectar.
