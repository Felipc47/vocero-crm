#!/bin/bash
# Self-test de COMPORTAMIENTO — el agente NO vuelve a pedir el correo cuando el
# contacto YA lo tiene en su ficha (viene de Meta Lead Ads o se capturó antes).
set -uo pipefail

BASE="http://localhost:3000"
JAR="${TMPDIR:-/tmp}/seomos-e2e-correo.txt"
rm -f "$JAR"
EMAIL="correo-$(date +%s)@test.local"
WABA="waba_test_1"; PHONE="phone_test_1"; TOKEN="EAAtest-valido"
CLIENTE="573007778899"
CORREO_CLIENTE="ceo@seomos.com"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"

echo "── Reset de BD y mocks"
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d vocero -q \
  -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
(cd "$REPO" && pnpm db:migrate > /dev/null 2>&1)
curl -s -X DELETE "$BASE/api/dev/google-mock/outbox" > /dev/null
curl -s -X DELETE "$BASE/api/dev/wa-mock/outbox" > /dev/null

PASS=0; FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad() { echo "  ❌ $1"; echo "     └─ $2"; FAIL=$((FAIL+1)); }
check() { if [ "$2" = "true" ]; then ok "$1"; else bad "$1" "$3"; fi }
has()  { [ "$(echo "$1" | grep -c "$2")" -gt 0 ] && echo true || echo false; }

say() {
  curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
    -d "{\"phoneNumberId\":\"$PHONE\",\"from\":\"$CLIENTE\",\"name\":\"Lead Con Correo\",\"text\":$1}" > /dev/null
}
salidas() {
  curl -s -b "$JAR" "$BASE/api/conversations/$CONV/messages" \
    | tr '{' '\n' | grep '"direction":"out"'
}

echo "── 0. Registro, WhatsApp, agente y Calendar"
curl -s -c "$JAR" -X POST "$BASE/api/auth/sign-up/email" -H 'content-type: application/json' \
  -d "{\"name\":\"Tester\",\"email\":\"$EMAIL\",\"password\":\"Password123!\"}" > /dev/null
curl -s -b "$JAR" -c "$JAR" -X PUT "$BASE/api/settings/whatsapp" -H 'content-type: application/json' \
  -d "{\"wabaId\":\"$WABA\",\"phoneNumberId\":\"$PHONE\",\"token\":\"$TOKEN\"}" > /dev/null
curl -s -b "$JAR" -X PUT "$BASE/api/agent/profile" -H 'content-type: application/json' \
  -d '{"enabled":true,"name":"Ana"}' > /dev/null
curl -s -b "$JAR" -c "$JAR" -L "$BASE/api/google/oauth/start" > /dev/null
GC=$(curl -s -b "$JAR" "$BASE/api/settings/calendar")
check "calendario conectado" "$(has "$GC" 'connected')" "$GC"

echo "── 1. El contacto YA trae correo en su ficha (como un lead de Meta)"
CR=$(curl -s -b "$JAR" -X POST "$BASE/api/contacts" -H 'content-type: application/json' \
  -d "{\"name\":\"Lead Con Correo\",\"phone\":\"$CLIENTE\",\"email\":\"$CORREO_CLIENTE\"}")
check "contacto creado con correo" "$(has "$CR" "$CORREO_CLIENTE")" "$CR"

echo "── 2. Pide una reunión SIN escribir su correo"
say '"Hola, quisiera una reunión para ver lo de mi página web. ¿Cuándo podemos?"'
for i in $(seq 1 20); do
  CONV=$(curl -s -b "$JAR" "$BASE/api/conversations" | sed -n 's/.*"id":"\(cv_[^"]*\)".*/\1/p' | head -1)
  [ -n "$CONV" ] && break; sleep 1
done
OUT=""
for i in $(seq 1 25); do
  OUT=$(salidas)
  [ -n "$OUT" ] && break; sleep 1
done
check "NO le pide el correo otra vez" \
  "$([ "$(echo "$OUT" | grep -ci 'compartes tu correo\|me lo compartes\|necesito tu correo')" -eq 0 ] && echo true || echo false)" "$OUT"

echo "── 3. Elige horario con respuesta corta y se agenda con el correo guardado"
say '"8 am"'
FIN=""
for i in $(seq 1 30); do
  FIN=$(salidas | tail -1)
  [ "$(echo "$FIN" | grep -c 'Agend')" -gt 0 ] && break; sleep 1
done
check "la reunión quedó agendada" "$(has "$FIN" 'Agend')" "$FIN"
check "usó el correo que ya estaba en la ficha" "$(has "$FIN" "$CORREO_CLIENTE")" "$FIN"
EV=$(curl -s "$BASE/api/dev/google-mock/outbox")
check "el invitado del evento es ese correo" "$(has "$EV" "$CORREO_CLIENTE")" "$EV"

echo
echo "═══ RESULTADO: $PASS ok · $FAIL fallos ═══"
[ "$FAIL" -eq 0 ]
