# 004 — Agendamiento en Google Calendar + Ingesta de Meta Lead Ads

**Autorizado por el dueño (2026-07-17).** Requirió la enmienda 1.3.0 de la
constitución (Google Calendar API como tercera dependencia opcional de runtime).
Decisiones del dueño: integración de Calendar por API (no enlace prellenado);
al llegar un lead de Meta se crea el contacto Y se le envía la plantilla de
saludo automáticamente; sus Instant Forms piden teléfono y correo.

## A. Agendamiento de reuniones (Google Calendar)

### Comportamiento observable

- **Conexión**: en Ajustes → Calendario, el propietario conecta una cuenta de
  Google con OAuth ("Conectar Google Calendar"). La pantalla muestra el estado
  (cuenta conectada / sin conectar), permite desconectar, y edita la lista de
  **invitados internos** (correos del comercial y el CEO) que se añaden a toda
  reunión.
- **Agendar manual**: en el slide-over de un lead hay un botón "Agendar
  reunión" que abre un formulario (título, fecha/hora, duración, correo del
  prospecto — prellenado si existe). Al guardar: se crea el evento en el
  calendario conectado con Google Meet, invitando a prospecto + invitados
  internos; Google envía las invitaciones (`sendUpdates=all`). El CRM muestra
  toast de éxito y guarda una nota `[Reunión] <fecha> — <link Meet>` en el
  contacto.
- **Agendar por el agente IA**: cuando un prospecto acepta una "sesión de
  diagnóstico", el agente pide correo y horario en la conversación, y agenda
  con la acción `agendar_reunion`. El prospecto recibe la invitación por
  correo y la confirmación por WhatsApp (mensaje del agente con fecha y link).
  El contacto guarda el correo capturado.
- **Sin conexión configurada**: el botón manual explica cómo conectar; la
  acción del agente NO se ofrece al LLM (no puede intentarla); nada más se ve
  afectado.

### Criterios de aceptación

1. Con Google conectado (mock), agendar desde el slide-over crea el evento con
   los 3+ invitados y Meet; la nota queda en el contacto; toast visible.
2. En una conversación simulada, el agente captura correo + horario y ejecuta
   `agendar_reunion`; el evento (mock) registra los invitados; el agente
   confirma por WhatsApp con la fecha.
3. Con Google desconectado o el refresh token inválido: la UI degrada con
   mensaje claro; el turno del agente NUNCA se cae (responde que un humano
   confirmará la reunión y escala — handoff).
4. El refresh token se guarda cifrado (AES-256-GCM); jamás aparece en
   cliente/logs.

## B. Ingesta de Meta Lead Ads

### Comportamiento observable

- **Webhook**: endpoint público de leadgen (patrón del webhook de WhatsApp:
  segmento secreto en la URL + verify token GET + firma `x-hub-signature-256`
  si hay `META_APP_SECRET`). Recibe eventos `object=page`,
  `field=leadgen`.
- **Ingesta**: por cada `leadgen_id` NUEVO (idempotente — repetido no duplica)
  el CRM recupera el lead vía Graph API (`field_data`), crea/actualiza el
  contacto (nombre, teléfono normalizado, **email**) con la campaña/formulario
  en las notas (`[Meta Ads] Campaña: … · Form: …`), lo pone en la etapa
  "Nuevo" del pipeline, y emite SSE (aparece en vivo en Bandeja/Pipeline).
- **Saludo automático**: si hay una **plantilla de saludo** configurada
  (Ajustes → Plantillas: selector "Plantilla para leads de Meta") y aprobada,
  se le envía con `{{1}}` = primer nombre; la conversación queda esperando la
  respuesta para que el agente IA continúe. Sin plantilla configurada: el lead
  entra igual y la conversación queda en Bandeja sin mensaje (aviso en el
  registro de la instancia).
- **Contacto existente** (mismo teléfono): no se duplica; se anexa la campaña
  a las notas y NO se reenvía el saludo.

### Criterios de aceptación

1. POST del mock de leadgen → contacto con nombre/tel/email + nota de campaña
   + lead en "Nuevo" + plantilla enviada (visible en el hilo) — todo en vivo
   sin recargar.
2. El mismo evento repetido 3 veces → un solo contacto, un solo saludo.
3. Lead con teléfono ya existente → sin duplicado, sin segundo saludo, nota
   anexada.
4. Graph API caído al recuperar el lead → el webhook responde 200 (Meta no
   debe reintentarlo infinito), el fallo queda registrado y el barrido puede
   reintentarlo (o queda en log claro).
5. Payload malformado → 200 sin efectos (Zod valida, nada explota).

## Fuera de alcance

- App Review de Meta (permiso `leads_retrieval`) — proceso del panel de Meta;
  se entrega guía (skill `whatsapp-meta-app-review` como referencia).
- Sincronización bidireccional de calendario (solo creación de eventos).
- Recordatorios de reunión por WhatsApp (candidato a 005).

## Verificación

Gate técnico completo + self-test E2E local (PG embebido + Playwright + mocks
wa/ai/leadgen/google) cubriendo los criterios 1-5 de B y 1-4 de A, con los
caminos infelices listados.
