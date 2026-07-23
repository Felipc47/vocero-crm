#!/bin/bash
# Self-test de COMPORTAMIENTO: anclar (máx. 3) y archivar chats de la bandeja.
# Corre contra `pnpm dev` con la BD local de pruebas (reset incluido).
set -uo pipefail

BASE="http://localhost:3000"
JAR="${TMPDIR:-/tmp}/seomos-e2e-cookies.txt"
rm -f "$JAR"
EMAIL="pin-$(date +%s)@test.local"

# El registro público se cierra tras la primera organización (FR-060), así que
# el guion parte de una BD limpia para ser re-ejecutable.
echo "── Reset de la BD local de pruebas"
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d vocero -q \
  -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
(cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/juancubillos/seomos-crm)" && pnpm db:migrate > /dev/null 2>&1)

PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; echo "     └─ $2"; FAIL=$((FAIL+1)); }
check() { # check <desc> <condición-verdadera?> <contexto>
  if [ "$2" = "true" ]; then ok "$1"; else bad "$1" "$3"; fi
}
patch() { # patch <id> <json>  → respuesta cruda
  curl -s -b "$JAR" -X PATCH "$BASE/api/conversations/$1" \
    -H 'content-type: application/json' -d "$2"
}

echo "── 0. Registro y datos demo"
curl -s -c "$JAR" -X POST "$BASE/api/auth/sign-up/email" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Tester\",\"email\":\"$EMAIL\",\"password\":\"Password123!\"}" > /dev/null
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/seed/demo" > /dev/null
LIST=$(curl -s -b "$JAR" "$BASE/api/conversations")
IDS=($(echo "$LIST" | grep -o '"id":"cv_[^"]*"' | sed 's/"id":"\(.*\)"/\1/' | head -5))
check "hay al menos 5 conversaciones demo" \
  "$([ "${#IDS[@]}" -ge 5 ] && echo true || echo false)" "$LIST"
check "la lista expone pinnedAt/archivedAt" \
  "$([ "$(echo "$LIST" | grep -c '"pinnedAt"')" -gt 0 ] && echo true || echo false)" "$LIST"

echo "── 1. Anclar 3 chats"
for i in 0 1 2; do
  R=$(patch "${IDS[$i]}" '{"pinned":true}')
  check "chat $((i+1)) anclado" \
    "$([ "$(echo "$R" | grep -c '"pinnedAt":"')" -gt 0 ] && echo true || echo false)" "$R"
done

echo "── 2. Camino infeliz: el cuarto anclado se rechaza (tope 3)"
R=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X PATCH "$BASE/api/conversations/${IDS[3]}" \
  -H 'content-type: application/json' -d '{"pinned":true}')
check "devuelve 422" "$([ "$R" = "422" ] && echo true || echo false)" "HTTP $R"
R=$(patch "${IDS[3]}" '{"pinned":true}')
check "con código pin_limit y mensaje claro" \
  "$([ "$(echo "$R" | grep -c 'pin_limit')" -gt 0 ] && echo true || echo false)" "$R"
LIST=$(curl -s -b "$JAR" "$BASE/api/conversations")
check "siguen exactamente 3 anclados" \
  "$([ "$(echo "$LIST" | grep -o '"pinnedAt":"2' | wc -l | tr -d ' ')" -eq 3 ] && echo true || echo false)" "$LIST"

echo "── 3. Desanclar libera el cupo"
R=$(patch "${IDS[0]}" '{"pinned":false}')
check "desanclado deja pinnedAt null" \
  "$([ "$(echo "$R" | grep -c '"pinnedAt":null')" -gt 0 ] && echo true || echo false)" "$R"
R=$(patch "${IDS[3]}" '{"pinned":true}')
check "ahora sí se ancla el cuarto" \
  "$([ "$(echo "$R" | grep -c '"pinnedAt":"')" -gt 0 ] && echo true || echo false)" "$R"

echo "── 4. Archivar desancla y manda a la sección Archivadas"
R=$(patch "${IDS[3]}" '{"archived":true}')
check "archivado tiene archivedAt" \
  "$([ "$(echo "$R" | grep -c '"archivedAt":"')" -gt 0 ] && echo true || echo false)" "$R"
check "y pierde el ancla (pinnedAt null)" \
  "$([ "$(echo "$R" | grep -c '"pinnedAt":null')" -gt 0 ] && echo true || echo false)" "$R"

echo "── 5. Desarchivar la devuelve a la bandeja"
R=$(patch "${IDS[3]}" '{"archived":false}')
check "archivedAt vuelve a null" \
  "$([ "$(echo "$R" | grep -c '"archivedAt":null')" -gt 0 ] && echo true || echo false)" "$R"

echo "── 6. Anclar un chat archivado lo desarchiva"
patch "${IDS[4]}" '{"archived":true}' > /dev/null
R=$(patch "${IDS[4]}" '{"pinned":true}')
check "queda anclado" \
  "$([ "$(echo "$R" | grep -c '"pinnedAt":"')" -gt 0 ] && echo true || echo false)" "$R"
check "y ya no está archivado" \
  "$([ "$(echo "$R" | grep -c '"archivedAt":null')" -gt 0 ] && echo true || echo false)" "$R"

echo "── 7. Caminos infelices restantes"
R=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X PATCH "$BASE/api/conversations/cv_noexiste" \
  -H 'content-type: application/json' -d '{"pinned":true}')
check "conversación inexistente → 404" "$([ "$R" = "404" ] && echo true || echo false)" "HTTP $R"
# La convención del repo para body inválido es 422 invalid_body (lib/api.ts).
R=$(curl -s -b "$JAR" -X PATCH "$BASE/api/conversations/${IDS[1]}" \
  -H 'content-type: application/json' -d '{"pinned":"si"}')
check "body inválido → invalid_body (no toca el chat)" \
  "$([ "$(echo "$R" | grep -c 'invalid_body')" -gt 0 ] && echo true || echo false)" "$R"

echo
echo "═══ RESULTADO: $PASS ok · $FAIL fallos ═══"
[ "$FAIL" -eq 0 ]
