# 003 — Rediseño visual "SEOMOS CRM"

**Fuente de verdad visual**: proyecto claude.ai/design `aced874f-1a1c-46e3-9769-7744230fbee1`
(archivo `SEOMOS CRM.dc.html`; copia local usada durante la implementación en el
scratchpad de la sesión). Los tokens de `globals.css` ya coinciden con el diseño;
este rediseño ajusta la CAPA DE COMPONENTES para igualar el mock, conservando
TODA la funcionalidad existente (SSE, API routes, dnd-kit, multi-tenancy, guards).

## Decisiones de alcance

- **Sin migración de BD.** El mock muestra campos Empresa / Servicio de interés /
  Campaña del lead que no existen en el modelo (`contact` = name/phone/notes).
  Quedan FUERA de alcance; el slide-over muestra teléfono + notas (las notas `[IA]`
  ya capturan empresa/interés, como muestra el propio mock).
- **Colores de etapa derivados** (sin columna nueva): helper `stageColor()` —
  `kind won → #3EA672`, `kind lost → #B0564C`, etapas open por posición:
  `#5B6B8C` (Nuevo), `#E8A13D` (En conversación), `var(--accent)` (Interesado),
  extras con paleta rotativa `#4A7C6A #8B6B8C #C08A3E #5B6B8C #7C7A4A`.
- **La pestaña Ajustes → Perfil se conserva** aunque el mock no la muestre
  (funcionalidad existente).
- **El panel derecho fijo del inbox (320px) se reemplaza por un slide-over de
  440px** con overlay (patrón del mock), conservando IA-toggle, handoff,
  stepper, notas, reiniciar y borrar; se agrega modo edición (nombre/notas) y
  footer Editar / Chat / Eliminar.
- `window.confirm` → modal de confirmación del mock (`ConfirmDialog`); avisos →
  toast global inferior del mock.
- Burbujas salientes del chat: verde WhatsApp (`--bubble-out: #DCF3E4` claro /
  `#243024` oscuro) en lugar del naranja tintado.

## Delta por vista (vs. mock)

| Vista | Cambios |
|---|---|
| Sidebar | Item activo: naranja sólido + texto blanco + sombra de acento (hoy: soft). Badge activo `bg-white/25`. |
| Bandeja | Lista 360→400px; filas redondeadas 13px sin separadores, activa `accent-tint` + barra inset; tag de etapa con color real (`bg color+1F`); tabs activas negras (`--text` sobre `--bg`); header hilo con botón "Ver detalles →" que abre el slide-over; composer contenedor 14px `surface-2` + botón 42px. |
| Pipeline | Header: título Poppins 22 + búsqueda + Gestionar etapas; columnas 300px transparentes con dot de color + contador píldora; tarjetas 13px con avatar de color, "Actividad:" y botón WhatsApp verde; columna final "Nueva etapa" (dashed → formulario inline); drop target `accent 0F` + borde dashed. |
| Contactos | Switch estilizado "Ver archivados"; tarjetas 14px (avatar 46, nombre Poppins 16, teléfono bold · nota); tag de etapa por contacto (join en API de solo lectura); acciones Editar (naranja) / Chat / Archivar / Eliminar (rojo suave) + ConfirmDialog. |
| Agente | Header con ícono naranja + switch del mock (52×30); tarjetas estilo mock. Conserva bloque de texto libre del KB. |
| Laboratorio | Header con ícono + subtítulo; historial con píldora de score; 3 tiles grandes (Poppins 32, verde/ámbar/naranja); casos como acordeón del mock. |
| Ajustes | Sub-nav 210px, item activo naranja sólido; retoques de estilo en las 5 pestañas (WhatsApp ya coincide en estructura). |

## Verificación (Definición de Hecho)

`pnpm typecheck && pnpm lint && pnpm build && pnpm test`, luego self-test E2E con
mocks (`WA_MOCK_ENABLED=true`) conduciendo cada vista con Playwright y capturas
comparadas contra el mock; camino infeliz: ventana 24h cerrada, cancelar/confirmar
el borrado, conversación sin seleccionar.
