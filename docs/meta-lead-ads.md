# Meta Lead Ads → CRM (feature 004)

Cuando alguien deja sus datos en un Instant Form de tus campañas de Meta, el
CRM crea el contacto (nombre, teléfono, correo, campaña), lo pone en la
primera etapa del pipeline y le envía la plantilla de saludo por WhatsApp; el
agente IA continúa cuando el lead responde.

## Requisitos en el CRM (ya listos)

- El webhook de la instancia ya acepta eventos `leadgen` (mismo endpoint del
  webhook de WhatsApp — Configuración → WhatsApp → "URL del webhook").
- Ajustes → Plantillas → **"Saludo automático para leads de Meta"**: elige la
  plantilla aprobada que se envía a cada lead nuevo (con `{{1}}` = primer
  nombre). Sin plantilla elegida, el lead entra igual pero sin mensaje.
- Idempotente: Meta puede reenviar el mismo evento y no se duplica nada.

## Configuración en Meta (panel developers.facebook.com)

En la MISMA app que usa WhatsApp ("seomos agencia de marketing"):

1. **Webhooks** → objeto **Page** (no WhatsApp Business Account) →
   **Suscribirse** al campo **`leadgen`**, usando la misma callback URL y el
   mismo verify token del CRM (Configuración → WhatsApp).
2. **Vincular la página de Facebook** que corre las campañas: la app necesita
   estar instalada en la página. En Graph API Explorer o con el token de
   sistema: `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen`.
3. **Permisos del token**: el usuario de sistema que genera el token necesita
   `leads_retrieval` y `pages_manage_metadata` sobre la página.
   - En **modo desarrollo** funciona para administradores de la app (ideal
     para probar con la herramienta de testing de leads:
     developers.facebook.com/tools/lead-ads-testing).
   - Para producción, **App Review** debe aprobar `leads_retrieval` (requiere
     Business Verification). La skill `whatsapp-meta-app-review` del repo
     tiene la guía para preparar esa solicitud.

## Probar sin campañas reales

1. En [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing)
   elige tu página y formulario → **Create lead** → el evento llega al webhook
   y el contacto aparece en la Bandeja con el saludo enviado.
2. Autochequeo local (self-test): `POST /api/dev/leadgen-mock/inbound` con
   mocks activos (`WA_MOCK_ENABLED=true`) simula el flujo entero sin Meta.

## Qué guarda el CRM de cada lead

- Contacto: nombre, teléfono (normalizado), correo del formulario.
- Nota `[Meta Ads] Campaña: … · Anuncio: … · Form: …`.
- Lead en la primera etapa abierta del pipeline ("Nuevo").
- Registro `leadgen_event` (idempotencia). Si el contacto ya existía, se
  anexa la campaña a las notas y NO se reenvía el saludo.
