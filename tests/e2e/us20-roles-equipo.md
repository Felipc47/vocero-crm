# US20 — Roles por empresa, límite de equipo y aprobación de plantillas

**Objetivo**: equipos con roles (`Admin`, `Editor de agente`, `Ejecutivo
comercial y marketing`), tope de 6 usuarios por empresa (la del superadmin no
tiene tope), y plantillas del comercial que pasan por aprobación del admin —
con notificaciones in-app — antes de enviarse a Meta.

## Guion automatizado

```bash
# Requiere `pnpm dev` corriendo con wa-mock y la BD local (:5433). Resetea la BD.
bash tests/e2e/us20-roles-equipo.sh
```

30 verificaciones: límite de 6 (el 7º → `team_limit`; superadmin sin tope),
asignación de roles por el admin y cross-org por el superadmin (`last_admin`
protegido), permisos del comercial (bandeja 200; agente/WhatsApp/calendario/
equipo 403; servicios sí pero vincular formularios 403), permisos del editor
de agente (agente 200, plantillas 403), y el ciclo completo de aprobación
(crea → `awaiting_approval` sin tocar Meta → notificación a admin y superadmin
→ comercial no puede aprobar → admin aprueba → llega a Meta → notificación al
autor; devolución con motivo; aprobación cross-org del superadmin).

## Matriz de permisos (src/lib/permissions.ts)

| Sección | Admin | Editor de agente | Comercial/Marketing |
|---|---|---|---|
| Bandeja | ✔ | ✔ | ✔ |
| Etapas del prospecto (ex Pipeline) | ✔ | — | ✔ |
| Contactos | ✔ | — | ✔ |
| Agente | ✔ | ✔ | — |
| Plantillas | ✔ (aprueba/elimina) | — | ✔ (con aprobación) |
| Envío masivo | ✔ | — | ✔ |
| Servicios | ✔ (+formularios) | — | ✔ (sin formularios) |
| Ajustes: WhatsApp/Calendar/Marca/Equipo | ✔ | — | — |
| Ajustes: Perfil propio | ✔ | ✔ | ✔ |

- Enforcement en **servidor** (403 por rol en cada API) + UI (nav filtrado,
  tabs de Ajustes, redirects server-side). Las cuentas históricas `member`
  equivalen a comercial (migración `0013`).
- Notificaciones: tabla `notification` + SSE `notification.new` + campana en
  la navegación (abrir el panel marca leídas).
