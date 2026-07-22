#!/bin/bash
# Self-test de COMPORTAMIENTO — Cumplimiento de la política de Meta (006):
# baja (opt-out), tope por tier y consentimiento (opt-in).
# Corre contra `pnpm dev` con wa-mock.
set -uo pipefail

BASE="http://localhost:3000"
JAR="${TMPDIR:-/tmp}/seomos-e2e-cumplimiento.txt"
rm -f "$JAR"
EMAIL="cumpl-$(date +%s)@test.local"
WABA="waba_test_1"; PHONE="phone_test_1"; TOKEN="EAAtest-valido"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"

echo "── Reset de BD y mocks"
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d vocero -q \
  -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
(cd "$REPO" && pnpm db:migrate > /dev/null 2>&1)
curl -s -X DELETE "$BASE/api/dev/wa-mock/outbox" > /dev/null
curl -s -X POST "$BASE/api/dev/wa-mock/tier" -H 'content-type: application/json' -d '{"tier":"TIER_1K"}' > /dev/null

PASS=0; FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad() { echo "  ❌ $1"; echo "     └─ $2"; FAIL=$((FAIL+1)); }
check() { if [ "$2" = "true" ]; then ok "$1"; else bad "$1" "$3"; fi }
has() { [ "$(echo "$1" | grep -c "$2")" -gt 0 ] && echo true || echo false; }
n_out() { curl -s "$BASE/api/dev/wa-mock/outbox" | tr '{' '\n' | grep -c '"phoneNumberId"'; }
say() {
  curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
    -d "{\"phoneNumberId\":\"$PHONE\",\"from\":\"$1\",\"name\":\"$2\",\"text\":$3}" > /dev/null
}
preview() {
  curl -s -b "$JAR" -X POST "$BASE/api/campaigns/preview" -H 'content-type: application/json' \
    -d "{\"audience\":{\"mode\":\"all\"},\"templateId\":\"$1\"}"
}
wait_status() {
  for _ in $(seq 1 40); do
    ST=$(curl -s -b "$JAR" "$BASE/api/campaigns/$1" | sed -n 's/.*"status":"\([a-z]*\)".*/\1/p' | head -1)
    [ "$ST" = "$2" ] && return 0
    sleep 1
  done
  return 1
}

echo "── 0. Registro, número y plantillas (una MARKETING y una UTILITY)"
curl -s -c "$JAR" -X POST "$BASE/api/auth/sign-up/email" -H 'content-type: application/json' \
  -d "{\"name\":\"Tester\",\"email\":\"$EMAIL\",\"password\":\"Password123!\"}" > /dev/null
curl -s -b "$JAR" -c "$JAR" -X PUT "$BASE/api/settings/whatsapp" -H 'content-type: application/json' \
  -d "{\"wabaId\":\"$WABA\",\"phoneNumberId\":\"$PHONE\",\"token\":\"$TOKEN\"}" > /dev/null
MK=$(curl -s -b "$JAR" -X POST "$BASE/api/templates" -H 'content-type: application/json' \
  -d '{"name":"promo","language":"es_CO","category":"MARKETING","body":"Hola {{1}}, promoción."}')
TPL_MK=$(echo "$MK" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
UT=$(curl -s -b "$JAR" -X POST "$BASE/api/templates" -H 'content-type: application/json' \
  -d '{"name":"aviso","language":"es_CO","category":"UTILITY","body":"Hola {{1}}, aviso."}')
TPL_UT=$(echo "$UT" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
for N in promo aviso; do
  curl -s -X POST "$BASE/api/dev/wa-mock/template-status" -H 'content-type: application/json' \
    -d "{\"wabaId\":\"$WABA\",\"name\":\"$N\",\"language\":\"es_CO\",\"event\":\"APPROVED\"}" > /dev/null
done
curl -s -b "$JAR" -X POST "$BASE/api/templates/sync" > /dev/null
ok "entorno listo"

echo "── 1. Origen del consentimiento según cómo llega el contacto"
say "573001110001" "Cliente Entrante" '"Hola, quiero información"'
sleep 2
curl -s -b "$JAR" -X POST "$BASE/api/contacts" -H 'content-type: application/json' \
  -d '{"name":"Cliente Manual","phone":"573001110002"}' > /dev/null
CT=$(curl -s -b "$JAR" "$BASE/api/contacts")
check "quien ESCRIBIÓ queda como inbound_message" "$(has "$CT" '"consentSource":"inbound_message"')" "$CT"
check "el alta MANUAL queda como manual" "$(has "$CT" '"consentSource":"manual"')" "$CT"

echo "── 2. MARKETING excluye a quien no tiene consentimiento"
PV=$(preview "$TPL_MK")
check "la previsualización marca la plantilla como marketing" "$(has "$PV" '"isMarketing":true')" "$PV"
check "1 contacto queda fuera por consentimiento" "$(has "$PV" '"withoutConsent":1')" "$PV"
check "y solo 1 es elegible" "$(has "$PV" '"eligible":1')" "$PV"

echo "── 3. UTILITY no restringe por consentimiento"
PVU=$(preview "$TPL_UT")
check "utility no excluye a nadie" "$(has "$PVU" '"withoutConsent":0')" "$PVU"

echo "── 4. Crear campaña MARKETING: solo llega a quien dio permiso"
C1=$(curl -s -b "$JAR" -X POST "$BASE/api/campaigns" -H 'content-type: application/json' \
  -d "{\"name\":\"Promo\",\"templateId\":\"$TPL_MK\",\"variableMode\":\"contact_name\",\"audience\":{\"mode\":\"all\"}}")
C1_ID=$(echo "$C1" | sed -n 's/.*"id":"\(cmp_[^"]*\)".*/\1/p')
check "la campaña se crea con 1 destinatario" "$(has "$C1" '"pending":1')" "$C1"

echo "── 5. El operador confirma el permiso del contacto manual"
CT_MANUAL=$(curl -s -b "$JAR" "$BASE/api/contacts" | tr '{' '\n' | grep 'Cliente Manual' | sed -n 's/.*"id":"\(ct_[^"]*\)".*/\1/p')
curl -s -b "$JAR" -X PATCH "$BASE/api/contacts/$CT_MANUAL" -H 'content-type: application/json' \
  -d '{"consentGranted":true}' > /dev/null
PV2=$(preview "$TPL_MK")
check "tras confirmarlo, ya nadie queda fuera" "$(has "$PV2" '"withoutConsent":0')" "$PV2"
check "y hay 2 elegibles" "$(has "$PV2" '"eligible":2')" "$PV2"

echo "── 6. BAJA automática: el contacto pide no recibir más"
say "573001110001" "Cliente Entrante" '"No me escriban más por favor"'
sleep 3
CT2=$(curl -s -b "$JAR" "$BASE/api/contacts")
check "el contacto queda dado de baja" "$(has "$CT2" '"optedOutAt":"2')" "$CT2"
check "se guarda la frase que lo motivó" "$(has "$CT2" 'No me escriban')" "$CT2"
PV3=$(preview "$TPL_MK")
check "la audiencia lo excluye (queda 1)" "$(has "$PV3" '"total":1')" "$PV3"

echo "── 7. La baja gana incluso en selección MANUAL del contacto"
CT_BAJA=$(echo "$CT2" | tr '{' '\n' | grep 'Cliente Entrante' | sed -n 's/.*"id":"\(ct_[^"]*\)".*/\1/p')
PVM=$(curl -s -b "$JAR" -X POST "$BASE/api/campaigns/preview" -H 'content-type: application/json' \
  -d "{\"audience\":{\"mode\":\"manual\",\"contactIds\":[\"$CT_BAJA\"]}}")
check "elegirlo a mano NO lo mete en la campaña" "$(has "$PVM" '"total":0')" "$PVM"

echo "── 8. Conversación normal NO da de baja (falso positivo)"
say "573001110003" "Cliente Normal" '"¿Hacen envíos a Baja California?"'
sleep 3
CT3=$(curl -s -b "$JAR" "$BASE/api/contacts")
NORMAL=$(echo "$CT3" | tr '{' '\n' | grep 'Cliente Normal')
check "sigue activo pese a decir «baja» en la frase" \
  "$([ "$(echo "$NORMAL" | grep -c '"optedOutAt":null')" -gt 0 ] && echo true || echo false)" "$NORMAL"

echo "── 9. La baja SOLO se retira a mano"
curl -s -b "$JAR" -X PATCH "$BASE/api/contacts/$CT_BAJA" -H 'content-type: application/json' \
  -d '{"optedOut":false}' > /dev/null
PV4=$(preview "$TPL_MK")
check "al retirarla vuelve a entrar en campañas" "$(has "$PV4" '"total":3')" "$PV4"
say "573001110001" "Cliente Entrante" '"No me escriban más"'
sleep 3
say "573001110001" "Cliente Entrante" '"Hola, cambié de opinión, cuéntenme"'
sleep 3
PV5=$(preview "$TPL_MK")
check "volver a escribir NO reactiva solo la baja" "$(has "$PV5" '"total":2')" "$PV5"

echo "── 10. Tope por tier: aviso cuando la audiencia lo supera"
curl -s -X POST "$BASE/api/dev/wa-mock/tier" -H 'content-type: application/json' -d '{"tier":"TIER_250"}' > /dev/null
PVT=$(preview "$TPL_UT")
check "lee el escalón del número" "$(has "$PVT" '"tier":"TIER_250"')" "$PVT"
check "con 2 contactos NO avisa (cabe de sobra)" "$(has "$PVT" '"exceeds":false')" "$PVT"
curl -s -X POST "$BASE/api/dev/wa-mock/tier" -H 'content-type: application/json' -d '{"tier":"TIER_1"}' > /dev/null
PVT2=$(preview "$TPL_UT")
check "con un tope de 1 SÍ avisa que se excede" "$(has "$PVT2" '"exceeds":true')" "$PVT2"
check "y dice cuántos sobran" "$(has "$PVT2" '"overflow":1')" "$PVT2"
curl -s -X POST "$BASE/api/dev/wa-mock/tier" -H 'content-type: application/json' -d '{"tier":"TIER_1K"}' > /dev/null

echo "── 11. Camino infeliz: Meta responde «límite de spam» → la campaña se PAUSA"
OUT_ANTES=$(n_out)
C2=$(curl -s -b "$JAR" -X POST "$BASE/api/campaigns" -H 'content-type: application/json' \
  -d "{\"name\":\"Aviso\",\"templateId\":\"$TPL_UT\",\"variableMode\":\"contact_name\",\"audience\":{\"mode\":\"all\"}}")
C2_ID=$(echo "$C2" | sed -n 's/.*"id":"\(cmp_[^"]*\)".*/\1/p')
curl -s -X POST "$BASE/api/dev/wa-mock/fail-next" -H 'content-type: application/json' \
  -d '{"count":1,"mode":"limit"}' > /dev/null
curl -s -b "$JAR" -X POST "$BASE/api/campaigns/$C2_ID/start" > /dev/null
wait_status "$C2_ID" "paused"
DET=$(curl -s -b "$JAR" "$BASE/api/campaigns/$C2_ID")
check "se pausa en vez de quemar la lista" "$(has "$DET" '"status":"paused"')" "$DET"
check "nadie queda marcado como fallido" "$(has "$DET" '"failed":0')" "$DET"

echo "── 12. Camino infeliz: campaña MARKETING sin nadie con consentimiento"
curl -s -b "$JAR" -X PATCH "$BASE/api/contacts/$CT_MANUAL" -H 'content-type: application/json' \
  -d '{"consentGranted":false}' > /dev/null
say "573001110004" "Solo Importado" '"hola"' # crea contacto entrante (con consentimiento)
sleep 2
NOCONS=$(curl -s -b "$JAR" -X POST "$BASE/api/campaigns" -H 'content-type: application/json' \
  -d "{\"name\":\"Sin permiso\",\"templateId\":\"$TPL_MK\",\"variableMode\":\"contact_name\",\"audience\":{\"mode\":\"manual\",\"contactIds\":[\"$CT_MANUAL\"]}}")
check "rechaza la campaña explicando el motivo" "$(has "$NOCONS" 'consentimiento')" "$NOCONS"
FORZADA=$(curl -s -b "$JAR" -X POST "$BASE/api/campaigns" -H 'content-type: application/json' \
  -d "{\"name\":\"Con confirmación\",\"templateId\":\"$TPL_MK\",\"variableMode\":\"contact_name\",\"audience\":{\"mode\":\"manual\",\"contactIds\":[\"$CT_MANUAL\"]},\"includeWithoutConsent\":true}")
check "el operador puede incluirlo confirmando el permiso" "$(has "$FORZADA" '"pending":1')" "$FORZADA"

echo
echo "═══ RESULTADO: $PASS ok · $FAIL fallos ═══"
[ "$FAIL" -eq 0 ]
