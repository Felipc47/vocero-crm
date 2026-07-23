# US14 — Anclar y archivar chats en la bandeja

**Objetivo**: el operador organiza su bandeja anclando hasta 3 chats (siempre
arriba) y archivando los que no quiere ver (sección «Archivadas»).

## Guion automatizado

```bash
# Requiere `pnpm dev` corriendo con la BD local (:5433). Resetea la BD.
bash tests/e2e/us14-anclar-archivar.sh
```

Cubre por API: anclar 3, rechazo del 4º (422 `pin_limit`), desanclar libera
cupo, archivar desancla, desarchivar, anclar un archivado lo desarchiva, y los
caminos infelices (id inexistente → 404, body inválido → 422 `invalid_body`).

## Verificación manual en la UI (`/inbox`)

1. Pasa el cursor por una fila → aparece el chevrón de opciones; ancla 3 chats.
   Suben al tope con icono de pin, en el orden en que se anclaron.
2. Intenta anclar un 4º → toast «Solo puedes anclar hasta 3 chats».
3. Archiva un chat anclado → desaparece de «Todas», pierde el ancla y el chip
   «Archivadas» lo cuenta.
4. En «Archivadas» el menú solo ofrece «Desarchivar»; al usarlo el chat vuelve
   a «Todas».

## Reglas de producto

- Máximo **3 anclados** por organización (validado en servidor, no solo en UI).
- **Archivar desancla**: las ancladas viven solo en la bandeja principal.
- **Anclar un archivado lo desarchiva** (vuelve a la bandeja, anclado).
- Un mensaje entrante **no desarchiva** el chat: sigue en «Archivadas» con su
  contador de no leídos.
- «Todas» y «No leídas» excluyen archivados; la búsqueda respeta la sección
  activa.
