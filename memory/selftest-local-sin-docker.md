# Self-test local sin Docker (Mac sin Docker/Postgres)

En la máquina de desarrollo no hay Docker ni Postgres instalados. Para el
self-test E2E del quickstart (001) funciona este arreglo efímero, sin instalar
nada global:

1. En un directorio temporal: `npm i embedded-postgres playwright-core`.
2. Arrancar PG embebido en el puerto **5433** (no 5432) con user/pass
   `postgres/postgres` y crear la BD `vocero`.
3. `.env` → `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/vocero`
   + las vars de mocks del quickstart (`WA_MOCK_ENABLED`, `META_GRAPH_BASE_URL`
   y `OPENROUTER_BASE_URL` apuntando a los mocks locales, token `test-token`).
4. `pnpm db:migrate && pnpm dev`, conducir con `playwright-core` +
   `channel: "chrome"` (Chrome del sistema — evita descargar Chromium).

Gotchas del E2E en dev:
- Next dev compila rutas on-demand: SIEMPRE esperar un selector del contenido
  real (no un timeout fijo) antes de capturar, o salen páginas a medio cargar
  y el sub-nav sin estado activo.
- El botón "Cargar datos de demostración" solo aparece tras el estado
  "Cargando…" de la bandeja; esperar el empty state antes de buscarlo.
- El Laboratorio corre completo contra el ai-mock (~1 min, reporte con score).
