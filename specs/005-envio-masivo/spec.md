# 005 — Envío masivo (campañas de WhatsApp)

## Objetivo

Una sección propia en la navegación (**Envío masivo**) desde la que el negocio
envía una **plantilla aprobada** a muchos contactos a la vez, con progreso en
vivo, pausa/reanudación y reintento de fallidos — sin poner en riesgo la
calidad del número ante Meta.

## Decisiones del dueño (cerradas)

1. **Audiencia con todas las opciones**: por etapa(s) del pipeline · por
   servicio(s) · selección manual con búsqueda · todos los contactos. Siempre
   excluyendo archivados y deduplicando por contacto.
2. **Solo plantillas aprobadas** (`status = approved`). Nada de texto libre: es
   el único camino legal fuera de la ventana de 24 h. Si la plantilla tiene
   `{{1}}`, el usuario elige entre rellenarla con el **nombre del contacto** o
   con un **valor fijo**.
3. **Ritmo lento y seguro**: ~1 mensaje/segundo, en segundo plano in-process.

## Requisitos funcionales

- **FR-101** El usuario crea una campaña con nombre, plantilla aprobada,
  relleno de `{{1}}` y filtro de audiencia. Antes de crear puede **previsualizar
  el número de destinatarios**.
- **FR-102** Al crear, la audiencia se **materializa** en destinatarios
  (`campaign_recipient`) con estado `pending`. La campaña nace en `draft`.
- **FR-103** Iniciar la campaña la pasa a `running` y despacha en segundo plano
  a ~1 msg/s, reutilizando `sendTemplate`.
- **FR-104** El progreso (enviados / fallidos / total) se publica por SSE
  (`campaign.progress`) y la UI lo refleja sin recargar.
- **FR-105** El usuario puede **pausar** una campaña `running` (el despachador
  se detiene en el siguiente destinatario) y **reanudarla** después.
- **FR-106** El usuario puede **reintentar los fallidos** de una campaña
  terminada: los `failed` vuelven a `pending` y la campaña se reanuda.
- **FR-107** Un destinatario que falla guarda el **motivo** del error y no
  detiene la campaña (el camino infeliz degrada, no se cuelga).
- **FR-108** Cada mensaje enviado aparece en la conversación del contacto en la
  Bandeja, como cualquier otro saliente.

## Reglas no negociables (constitución)

- **Multi-tenancy (III)**: `organization_id NOT NULL` en `campaign` y
  `campaign_recipient`; toda query pasa por `scoped()`.
- **Idempotencia (IV)**: `UNIQUE (campaign_id, contact_id)` — un contacto jamás
  recibe dos veces la misma campaña. El despachador toma solo destinatarios
  `pending` y marca el resultado antes de continuar, así que reanudar nunca
  reenvía lo ya enviado.
- **Sandbox del Laboratorio**: las conversaciones `is_test` JAMÁS entran. Doble
  protección: la audiencia excluye contactos archivados (los del Laboratorio lo
  están) y `sendTemplate` lanza `sandbox_violation` si algo se cuela.

## Criterios de aceptación (verificables en vivo)

1. «Envío masivo» aparece en el panel izquierdo y abre `/campaigns`.
2. Con 3 contactos y una plantilla aprobada, una campaña «todos» crea 3
   destinatarios y, al iniciarla, llegan 3 mensajes al canal (outbox del mock).
3. La plantilla con `{{1}}` en modo «nombre del contacto» llega personalizada.
4. Filtrar por etapa envía solo a los leads de esa etapa.
5. Crear la misma campaña dos veces no duplica destinatarios del mismo contacto.
6. Un destinatario cuyo envío falla queda `failed` con motivo y la campaña
   termina igual; «reintentar fallidos» lo reenvía y queda `sent`.
7. Una plantilla NO aprobada es rechazada al crear la campaña.
