# US19 — Eliminar empresa con doble confirmación y respaldo de 30 días

**Objetivo**: el superadmin elimina una empresa desde /companies; la acción
exige una segunda confirmación (escribir el nombre exacto) y los datos quedan
de respaldo 30 días, restaurables, antes de la purga definitiva.

## Guion automatizado

```bash
# Requiere `pnpm dev` corriendo con wa-mock y la BD local (:5433). Resetea la BD.
bash tests/e2e/us19-eliminar-empresa.sh
```

Cubre: guardas (la propia organización no se puede eliminar; un admin normal
recibe 403; inexistente 404; doble borrado 409); al eliminar, los usuarios de
la empresa pierden acceso (401) y su webhook deja de procesar (los mensajes se
congelan) pero los datos siguen en la BD; restaurar devuelve acceso y webhook;
al vencer los 30 días (simulado retro-datando `deleted_at`), la purga borra la
organización en cascada y los usuarios huérfanos.

## Comportamiento

- **Borrado suave**: `organization.deleted_at` (migración `0012`). Mientras el
  respaldo vive: sin login (la membresía se resuelve solo sobre orgs vivas),
  sin ingesta ni bot (las credenciales por número ignoran orgs eliminadas), y
  la tarjeta muestra «Eliminada — respaldo hasta el X» con botón Restaurar.
- **Doble confirmación (UI)**: botón eliminar → modal que explica el respaldo
  y exige escribir el nombre EXACTO de la empresa para habilitar el botón.
- **Purga**: perezosa e idempotente (`purgeExpiredCompanies`, sin colas
  externas) — corre al consultar/mutar la lista de empresas. Borra la org
  (cascada a todo su dominio) y los usuarios sin membresía restante (nunca al
  superadmin).
