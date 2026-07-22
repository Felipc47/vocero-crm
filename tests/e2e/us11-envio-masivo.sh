#!/bin/bash
# Self-test de COMPORTAMIENTO — Envío masivo (005).
# Corre contra `pnpm dev` con wa-mock (META_GRAPH_BASE_URL → /api/dev/wa-mock/graph).
set -uo pipefail

BASE="http://localhost:3000"
JAR="${TMPDIR:-/tmp}/seomos-e2e-masivo.txt"
rm -f "$JAR"
EMAIL="masivo-$(date +%s)@test.local"
WABA="waba_test_1"; PHONE="phone_test_1"; TOKEN="EAAtest-valido"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"

echo "── Reset de BD y mocks"
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d vocero -q \
  -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
(cd "$REPO" && pnpm db:migrate > /dev/null 2>&1)
curl -s -X DELETE "$BASE/api/dev/wa-mock/outbox" > /dev/null

PASS=0; FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad() { echo "  ❌ $1"; echo "     └─ $2"; FAIL=$((FAIL+1)); }
check() { if [ "$2" = "true" ]; then ok "$1"; else bad "$1" "$3"; fi }
has() { [ "$(echo "$1" | grep -c "$2")" -gt 0 ] && echo true || echo false; }
# Una entrada del outbox por mensaje: se cuenta por phoneNumberId (el campo
# `type` aparece dos veces por entrada — en la entrada y dentro del payload).
n_out() { curl -s "$BASE/api/dev/wa-mock/outbox" | tr '{' '\n' | grep -c '"phoneNumberId"'; }

# Espera a que la campaña $1 alcance el estado $2 (máx. 40 s).
wait_status() {
  for _ in $(seq 1 40); do
    ST=$(curl -s -b "$JAR" "$BASE/api/campaigns/$1" | sed -n 's/.*"status":"\([a-z]*\)".*/\1/p' | head -1)
    [ "$ST" = "$2" ] && return 0
    sleep 1
  done
  return 1
}
detalle() { curl -s -b "$JAR" "$BASE/api/campaigns/$1"; }

# Desde 006, las plantillas de MARKETING exigen consentimiento y estos
# contactos son de alta manual. Este guion prueba el ENVÍO, no la política
# (eso es us12), así que se registra el permiso de todos.
consentir_todos() {
  for ID in $(curl -s -b "$JAR" "$BASE/api/contacts" | tr '{' '\n' \
      | sed -n 's/.*"id":"\(ct_[^"]*\)".*/\1/p'); do
    curl -s -b "$JAR" -X PATCH "$BASE/api/contacts/$ID" \
      -H 'content-type: application/json' -d '{"consentGranted":true}' > /dev/null
  done
}

echo "── 0. Registro y conexión del número (mock)"
curl -s -c "$JAR" -X POST "$BASE/api/auth/sign-up/email" -H 'content-type: application/json' \
  -d "{\"name\":\"Tester\",\"email\":\"$EMAIL\",\"password\":\"Password123!\"}" > /dev/null
CONN=$(curl -s -b "$JAR" -c "$JAR" -X PUT "$BASE/api/settings/whatsapp" -H 'content-type: application/json' \
  -d "{\"wabaId\":\"$WABA\",\"phoneNumberId\":\"$PHONE\",\"token\":\"$TOKEN\"}")
check "número conectado" "$(has "$CONN" '"ok":true')" "$CONN"

echo "── 1. Plantilla con {{1}}, aprobada por Meta"
CREATE=$(curl -s -b "$JAR" -X POST "$BASE/api/templates" -H 'content-type: application/json' \
  -d '{"name":"promo_julio","language":"es_CO","category":"MARKETING","body":"Hola {{1}}, tenemos una promoción para ti."}')
TPL_ID=$(echo "$CREATE" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
BORRADOR=$(curl -s -b "$JAR" -X POST "$BASE/api/templates" -H 'content-type: application/json' \
  -d '{"name":"sin_aprobar","language":"es_CO","category":"UTILITY","body":"Hola"}')
TPL_NO=$(echo "$BORRADOR" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
curl -s -X POST "$BASE/api/dev/wa-mock/template-status" -H 'content-type: application/json' \
  -d "{\"wabaId\":\"$WABA\",\"name\":\"promo_julio\",\"language\":\"es_CO\",\"event\":\"APPROVED\"}" > /dev/null
curl -s -b "$JAR" -X POST "$BASE/api/templates/sync" > /dev/null
LIST=$(curl -s -b "$JAR" "$BASE/api/templates")
check "la plantilla quedó aprobada" "$(has "$LIST" '"status":"approved"')" "$LIST"

echo "── 2. Tres contactos"
for i in 1 2 3; do
  curl -s -b "$JAR" -X POST "$BASE/api/contacts" -H 'content-type: application/json' \
    -d "{\"name\":\"Cliente $i\",\"phone\":\"57300111000$i\"}" > /dev/null
done
consentir_todos
CT=$(curl -s -b "$JAR" "$BASE/api/contacts")
check "3 contactos creados" "$([ "$(echo "$CT" | tr '{' '\n' | grep -c '"phone":"5730011100')" -eq 3 ] && echo true || echo false)" "$CT"

echo "── 3. Previsualizar el alcance antes de crear"
PV=$(curl -s -b "$JAR" -X POST "$BASE/api/campaigns/preview" -H 'content-type: application/json' \
  -d '{"audience":{"mode":"all"}}')
check "la previsualización dice 3 destinatarios" "$(has "$PV" '"total":3')" "$PV"

echo "── 4. Crear la campaña (todos los contactos, {{1}} = nombre)"
CMP=$(curl -s -b "$JAR" -X POST "$BASE/api/campaigns" -H 'content-type: application/json' \
  -d "{\"name\":\"Promo julio\",\"templateId\":\"$TPL_ID\",\"variableMode\":\"contact_name\",\"audience\":{\"mode\":\"all\"}}")
CMP_ID=$(echo "$CMP" | sed -n 's/.*"id":"\(cmp_[^"]*\)".*/\1/p')
check "campaña creada con 3 en cola" "$(has "$CMP" '"pending":3')" "$CMP"

echo "── 5. Enviar y esperar a que termine"
curl -s -b "$JAR" -X POST "$BASE/api/campaigns/$CMP_ID/start" > /dev/null
wait_status "$CMP_ID" "done"
DET=$(detalle "$CMP_ID")
check "la campaña terminó" "$(has "$DET" '"status":"done"')" "$DET"
check "3 enviados, 0 fallidos" "$(has "$DET" '"sent":3')" "$DET"
check "salieron 3 plantillas al canal" "$([ "$(n_out)" -eq 3 ] && echo true || echo false)" "outbox=$(n_out)"
OUT=$(curl -s "$BASE/api/dev/wa-mock/outbox")
check "personalizó {{1}} con el nombre del contacto" "$(has "$OUT" '"text":"Cliente 2"')" "$OUT"

echo "── 6. Idempotencia: reiniciar una campaña terminada no reenvía"
RE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/campaigns/$CMP_ID/start")
check "reiniciar responde 400 (ya terminó)" "$([ "$RE" = "400" ] && echo true || echo false)" "HTTP $RE"
check "el outbox sigue en 3 (sin duplicados)" "$([ "$(n_out)" -eq 3 ] && echo true || echo false)" "outbox=$(n_out)"

echo "── 7. Segmentar por etapa del pipeline"
# Los 3 contactos ya tienen lead (los creó el CRM). Se mueve UNO a la última
# etapa y se comprueba que la campaña por etapa apunta solo a ese.
STAGES=$(curl -s -b "$JAR" "$BASE/api/pipeline/stages")
STAGE_ULT=$(echo "$STAGES" | sed -n 's/.*"id":"\(stg_[^"]*\)".*/\1/p' | tail -1)
BOARD=$(curl -s -b "$JAR" "$BASE/api/pipeline/board")
LEAD_ID=$(echo "$BOARD" | sed -n 's/.*"id":"\(ld_[^"]*\)".*/\1/p' | head -1)
curl -s -b "$JAR" -X PATCH "$BASE/api/pipeline/leads/$LEAD_ID" -H 'content-type: application/json' \
  -d "{\"stageId\":\"$STAGE_ULT\",\"position\":0}" > /dev/null
PV2=$(curl -s -b "$JAR" -X POST "$BASE/api/campaigns/preview" -H 'content-type: application/json' \
  -d "{\"audience\":{\"mode\":\"stages\",\"stageIds\":[\"$STAGE_ULT\"]}}")
check "la etapa acota la audiencia a 1 contacto" "$(has "$PV2" '"total":1')" "$PV2"
PV3=$(curl -s -b "$JAR" -X POST "$BASE/api/campaigns/preview" -H 'content-type: application/json' \
  -d '{"audience":{"mode":"manual","contactIds":["ct_noexiste"]}}')
check "un contacto inexistente no cuela destinatarios fantasma" "$(has "$PV3" '"total":0')" "$PV3"

echo "── 7b. La sección existe en la app y en el panel izquierdo"
PAGE=$(curl -s -b "$JAR" "$BASE/campaigns")
check "la página /campaigns carga" "$(has "$PAGE" 'Envío masivo')" "$(echo "$PAGE" | head -c 200)"
NAV=$(curl -s -b "$JAR" "$BASE/inbox")
check "el nav enlaza a /campaigns" "$(has "$NAV" '/campaigns')" "$(echo "$NAV" | head -c 200)"

echo "── 8. Camino infeliz A: plantilla NO aprobada"
NOAP=$(curl -s -b "$JAR" -X POST "$BASE/api/campaigns" -H 'content-type: application/json' \
  -d "{\"name\":\"Ilegal\",\"templateId\":\"$TPL_NO\",\"variableMode\":\"none\",\"audience\":{\"mode\":\"all\"}}")
check "rechaza plantillas sin aprobar" "$(has "$NOAP" 'aprobadas')" "$NOAP"

echo "── 9. Camino infeliz B: un destinatario falla, la campaña NO se cuelga"
curl -s -b "$JAR" -X POST "$BASE/api/contacts" -H 'content-type: application/json' \
  -d '{"name":"Cliente Caido","phone":"573009998877"}' > /dev/null
consentir_todos
CMP2=$(curl -s -b "$JAR" -X POST "$BASE/api/campaigns" -H 'content-type: application/json' \
  -d "{\"name\":\"Promo con fallo\",\"templateId\":\"$TPL_ID\",\"variableMode\":\"contact_name\",\"audience\":{\"mode\":\"all\"}}")
CMP2_ID=$(echo "$CMP2" | sed -n 's/.*"id":"\(cmp_[^"]*\)".*/\1/p')
curl -s -X POST "$BASE/api/dev/wa-mock/fail-next" -H 'content-type: application/json' -d '{"count":1}' > /dev/null
curl -s -b "$JAR" -X POST "$BASE/api/campaigns/$CMP2_ID/start" > /dev/null
wait_status "$CMP2_ID" "done"
DET2=$(detalle "$CMP2_ID")
check "termina igual pese al fallo" "$(has "$DET2" '"status":"done"')" "$DET2"
check "registra 1 destinatario fallido" "$(has "$DET2" '"failed":1')" "$DET2"
check "guarda el motivo del fallo" "$(has "$DET2" 'undeliverable')" "$DET2"

echo "── 10. Reintentar los fallidos"
RT=$(curl -s -b "$JAR" -X POST "$BASE/api/campaigns/$CMP2_ID/retry")
check "el reintento devuelve los fallidos a la cola" "$(has "$RT" '"retried":1')" "$RT"
wait_status "$CMP2_ID" "done"
DET3=$(detalle "$CMP2_ID")
check "tras reintentar no queda ninguno fallido" "$(has "$DET3" '"failed":0')" "$DET3"
check "y todos quedaron enviados" "$(has "$DET3" '"pending":0')" "$DET3"

echo "── 11. Camino infeliz D: token caído → la campaña se PAUSA (no quema la lista)"
for i in 5 6; do
  curl -s -b "$JAR" -X POST "$BASE/api/contacts" -H 'content-type: application/json' \
    -d "{\"name\":\"Cliente $i\",\"phone\":\"57300111000$i\"}" > /dev/null
done
consentir_todos
CMP3=$(curl -s -b "$JAR" -X POST "$BASE/api/campaigns" -H 'content-type: application/json' \
  -d "{\"name\":\"Promo token\",\"templateId\":\"$TPL_ID\",\"variableMode\":\"contact_name\",\"audience\":{\"mode\":\"all\"}}")
CMP3_ID=$(echo "$CMP3" | sed -n 's/.*"id":"\(cmp_[^"]*\)".*/\1/p')
OUT_ANTES=$(n_out)
# El token cae justo al empezar el despacho (fallo del canal, no del contacto).
curl -s -X POST "$BASE/api/dev/wa-mock/fail-next" -H 'content-type: application/json' \
  -d '{"count":1,"mode":"auth"}' > /dev/null
curl -s -b "$JAR" -X POST "$BASE/api/campaigns/$CMP3_ID/start" > /dev/null
wait_status "$CMP3_ID" "paused"
DET4=$(detalle "$CMP3_ID")
check "la campaña se pausa ante el token caído" "$(has "$DET4" '"status":"paused"')" "$DET4"
check "no marca a todos como fallidos" "$([ "$(echo "$DET4" | grep -c '"failed":0')" -gt 0 ] && echo true || echo false)" "$DET4"
check "no gastó envíos extra" "$([ "$(n_out)" -eq "$OUT_ANTES" ] && echo true || echo false)" "antes=$OUT_ANTES ahora=$(n_out)"

echo "── 12. Camino infeliz C: campaña inexistente"
NF=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/campaigns/cmp_noexiste")
check "404 sin colgarse" "$([ "$NF" = "404" ] && echo true || echo false)" "HTTP $NF"

echo
echo "═══ RESULTADO: $PASS ok · $FAIL fallos ═══"
[ "$FAIL" -eq 0 ]
