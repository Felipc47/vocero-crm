#!/bin/bash
# Self-test de COMPORTAMIENTO: categoría visible, editar y eliminar plantillas.
# Corre contra `pnpm dev` con wa-mock (META_GRAPH_BASE_URL → /api/dev/wa-mock/graph).
set -uo pipefail

BASE="http://localhost:3000"
JAR="${TMPDIR:-/tmp}/seomos-e2e-cookies.txt"
rm -f "$JAR"
EMAIL="tpl-$(date +%s)@test.local"
WABA="waba_test_1"
PHONE="phone_test_1"
TOKEN="EAAtest-valido"

# El registro público se cierra tras la primera organización (FR-060), así que
# el guion parte de una BD limpia para ser re-ejecutable.
echo "── Reset de la BD local de pruebas"
# Ojo: el journal de drizzle vive en el esquema `drizzle`; sin borrarlo, las
# migraciones se creen aplicadas y la BD queda vacía.
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d vocero -q \
  -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
(cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || echo /Users/juancubillos/seomos-crm)" && pnpm db:migrate > /dev/null 2>&1)

PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; echo "     └─ $2"; FAIL=$((FAIL+1)); }
check() { # check <desc> <condición-verdadera?> <contexto>
  if [ "$2" = "true" ]; then ok "$1"; else bad "$1" "$3"; fi
}

echo "── 0. Registro y conexión del número (mock)"
curl -s -c "$JAR" -X POST "$BASE/api/auth/sign-up/email" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Tester\",\"email\":\"$EMAIL\",\"password\":\"Password123!\"}" > /dev/null
CONN=$(curl -s -b "$JAR" -c "$JAR" -X PUT "$BASE/api/settings/whatsapp" \
  -H 'content-type: application/json' \
  -d "{\"wabaId\":\"$WABA\",\"phoneNumberId\":\"$PHONE\",\"token\":\"$TOKEN\"}")
check "número conectado" \
  "$([ "$(echo "$CONN" | grep -c '"ok":true')" -gt 0 ] && echo true || echo false)" "$CONN"

echo "── 1. Crear plantilla en es_CO (idioma nuevo por defecto)"
CREATE=$(curl -s -b "$JAR" -X POST "$BASE/api/templates" \
  -H 'content-type: application/json' \
  -d '{"name":"saludo_lead","language":"es_CO","category":"UTILITY","body":"Hola {{1}}, ¿retomamos tu cotización?"}')
TPL_ID=$(echo "$CREATE" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
check "creada con language es_CO" \
  "$([ "$(echo "$CREATE" | grep -c '"language":"es_CO"')" -gt 0 ] && echo true || echo false)" "$CREATE"
check "queda pendiente de Meta" \
  "$([ "$(echo "$CREATE" | grep -c '"status":"pending"')" -gt 0 ] && echo true || echo false)" "$CREATE"

echo "── 2. Categoría expuesta por la API (la UI la pinta como badge)"
LIST=$(curl -s -b "$JAR" "$BASE/api/templates")
check "la lista trae category=UTILITY" \
  "$([ "$(echo "$LIST" | grep -c '"category":"UTILITY"')" -gt 0 ] && echo true || echo false)" "$LIST"

echo "── 3. Meta aprueba y RECATEGORIZA a MARKETING; el sync debe reflejarlo"
curl -s -X POST "$BASE/api/dev/wa-mock/template-status" -H 'content-type: application/json' \
  -d "{\"wabaId\":\"$WABA\",\"name\":\"saludo_lead\",\"language\":\"es_CO\",\"event\":\"APPROVED\",\"category\":\"MARKETING\"}" > /dev/null
SYNC=$(curl -s -b "$JAR" -X POST "$BASE/api/templates/sync")
LIST=$(curl -s -b "$JAR" "$BASE/api/templates")
check "tras sincronizar, la categoría real es MARKETING" \
  "$([ "$(echo "$LIST" | grep -c '"category":"MARKETING"')" -gt 0 ] && echo true || echo false)" "$LIST"
check "y queda aprobada" \
  "$([ "$(echo "$LIST" | grep -c '"status":"approved"')" -gt 0 ] && echo true || echo false)" "$SYNC | $LIST"

echo "── 4. Elegirla como saludo automático de leads"
curl -s -b "$JAR" -X PUT "$BASE/api/settings/leadgen" -H 'content-type: application/json' \
  -d "{\"greetingTemplateId\":\"$TPL_ID\"}" > /dev/null
LG=$(curl -s -b "$JAR" "$BASE/api/settings/leadgen")
check "saludo global apunta a la plantilla" \
  "$([ "$(echo "$LG" | grep -c "$TPL_ID")" -gt 0 ] && echo true || echo false)" "$LG"

echo "── 5. EDITAR: cuerpo nuevo + volver a UTILITY"
EDIT=$(curl -s -b "$JAR" -X PATCH "$BASE/api/templates/$TPL_ID" \
  -H 'content-type: application/json' \
  -d '{"body":"Hola {{1}}, seguimos disponibles para tu proyecto.","category":"UTILITY"}')
check "el cuerpo se actualizó" \
  "$([ "$(echo "$EDIT" | grep -c 'seguimos disponibles')" -gt 0 ] && echo true || echo false)" "$EDIT"
check "vuelve a revisión (pending)" \
  "$([ "$(echo "$EDIT" | grep -c '"status":"pending"')" -gt 0 ] && echo true || echo false)" "$EDIT"
MOCK=$(curl -s "$BASE/api/dev/wa-mock/graph/$WABA/message_templates" -H "Authorization: Bearer $TOKEN")
check "el cambio llegó de verdad a Meta (wa-mock)" \
  "$([ "$(echo "$MOCK" | grep -c 'seguimos disponibles')" -gt 0 ] && echo true || echo false)" "$MOCK"

echo "── 6. Camino infeliz: editar una plantilla inexistente"
NOPE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X PATCH "$BASE/api/templates/ct_noexiste" \
  -H 'content-type: application/json' -d '{"body":"x","category":"UTILITY"}')
check "404 sin colgarse" "$([ "$NOPE" = "404" ] && echo true || echo false)" "HTTP $NOPE"

echo "── 7. ELIMINAR: se va del CRM, de Meta y del saludo global"
DEL=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X DELETE "$BASE/api/templates/$TPL_ID")
check "borrado devuelve 200" "$([ "$DEL" = "200" ] && echo true || echo false)" "HTTP $DEL"
LIST=$(curl -s -b "$JAR" "$BASE/api/templates")
check "ya no aparece en el CRM" \
  "$([ "$(echo "$LIST" | grep -c 'saludo_lead')" -eq 0 ] && echo true || echo false)" "$LIST"
MOCK=$(curl -s "$BASE/api/dev/wa-mock/graph/$WABA/message_templates" -H "Authorization: Bearer $TOKEN")
check "ya no existe en Meta (wa-mock)" \
  "$([ "$(echo "$MOCK" | grep -c 'saludo_lead')" -eq 0 ] && echo true || echo false)" "$MOCK"
LG=$(curl -s -b "$JAR" "$BASE/api/settings/leadgen")
check "el saludo global quedó limpio (sin referencia rota)" \
  "$([ "$(echo "$LG" | grep -c 'null')" -gt 0 ] && echo true || echo false)" "$LG"

echo "── 8. Camino infeliz: borrar dos veces"
DEL2=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X DELETE "$BASE/api/templates/$TPL_ID")
check "404 la segunda vez" "$([ "$DEL2" = "404" ] && echo true || echo false)" "HTTP $DEL2"

echo "── 9. Borrado tolerante: plantilla que ya no está en Meta"
C2=$(curl -s -b "$JAR" -X POST "$BASE/api/templates" -H 'content-type: application/json' \
  -d '{"name":"huerfana","language":"es_CO","category":"UTILITY","body":"Hola"}')
ID2=$(echo "$C2" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
HSM=$(curl -s "$BASE/api/dev/wa-mock/graph/$WABA/message_templates" -H "Authorization: Bearer $TOKEN" \
  | sed -n 's/.*{"id":"\(tplmock_[0-9]*\)","name":"huerfana".*/\1/p')
curl -s -X DELETE "$BASE/api/dev/wa-mock/graph/$WABA/message_templates?name=huerfana&hsm_id=$HSM" \
  -H "Authorization: Bearer $TOKEN" > /dev/null
D3=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X DELETE "$BASE/api/templates/$ID2")
check "se limpia igual en el CRM (200, no queda huérfana)" \
  "$([ "$D3" = "200" ] && echo true || echo false)" "HTTP $D3"

echo
echo "═══ RESULTADO: $PASS ok · $FAIL fallos ═══"
[ "$FAIL" -eq 0 ]
