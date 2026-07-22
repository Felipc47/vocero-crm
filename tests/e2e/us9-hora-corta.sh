#!/bin/bash
# Self-test de COMPORTAMIENTO — el cliente confirma el horario con una
# respuesta CORTA ("11 am"). Reproduce el bug reportado el 2026-07-21:
# el agente pedía repetir la hora una y otra vez en vez de agendar.
set -uo pipefail

BASE="http://localhost:3000"
JAR="${TMPDIR:-/tmp}/seomos-e2e-hora.txt"
rm -f "$JAR"
EMAIL="hora-$(date +%s)@test.local"
WABA="waba_test_1"; PHONE="phone_test_1"; TOKEN="EAAtest-valido"
CLIENTE="573004445566"
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

say() { # say <texto>
  curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
    -d "{\"phoneNumberId\":\"$PHONE\",\"from\":\"$CLIENTE\",\"name\":\"Cliente Corto\",\"text\":$1}" > /dev/null
}
ultimaSalida() {
  curl -s -b "$JAR" "$BASE/api/conversations/$CONV/messages" \
    | tr '{' '\n' | grep '"direction":"out"' | tail -1
}

echo "── 0. Registro, WhatsApp, agente y Calendar (mocks)"
curl -s -c "$JAR" -X POST "$BASE/api/auth/sign-up/email" -H 'content-type: application/json' \
  -d "{\"name\":\"Tester\",\"email\":\"$EMAIL\",\"password\":\"Password123!\"}" > /dev/null
curl -s -b "$JAR" -c "$JAR" -X PUT "$BASE/api/settings/whatsapp" -H 'content-type: application/json' \
  -d "{\"wabaId\":\"$WABA\",\"phoneNumberId\":\"$PHONE\",\"token\":\"$TOKEN\"}" > /dev/null
curl -s -b "$JAR" -X PUT "$BASE/api/agent/profile" -H 'content-type: application/json' \
  -d '{"enabled":true,"name":"Ana"}' > /dev/null
curl -s -b "$JAR" -c "$JAR" -L "$BASE/api/google/oauth/start" > /dev/null
GC=$(curl -s -b "$JAR" "$BASE/api/settings/calendar")
check "calendario conectado" "$(has "$GC" 'connected')" "$GC"

# Calca la conversación real: primero el interés (sin correo), luego el correo
# a secas, y SOLO al final la hora corta. Si el primer mensaje trae el correo,
# el agente agenda de una vez y el bug ni siquiera se alcanza.
echo "── 1. El cliente pide una reunión (aún sin correo)"
say '"Hola, quiero crear mi tienda en línea. ¿Podemos tener una reunión esta semana?"'
for i in $(seq 1 20); do
  CONV=$(curl -s -b "$JAR" "$BASE/api/conversations" | sed -n 's/.*"id":"\(cv_[^"]*\)".*/\1/p' | head -1)
  [ -n "$CONV" ] && break; sleep 1
done
sleep 5
check "la conversación existe" "$([ -n "$CONV" ] && echo true || echo false)" "conv=$CONV"

echo "── 2. Manda el correo solo, como en el caso real"
say '"cliente@corto.co"'
sleep 6
PREV=$(ultimaSalida)
check "todavía no ha agendado nada" \
  "$([ "$(echo "$PREV" | grep -c 'Agendé')" -eq 0 ] && echo true || echo false)" "$PREV"

echo "── 3. EL BUG: responde solo «11 am» para elegir horario"
say '"11 am"'
OUT=""
for i in $(seq 1 30); do
  OUT=$(ultimaSalida)
  [ "$(echo "$OUT" | grep -c 'Agendé')" -gt 0 ] && break; sleep 1
done
check "NO vuelve a pedir que confirme la hora" \
  "$([ "$(echo "$OUT" | grep -c 'Antes de agendar')" -eq 0 ] && echo true || echo false)" "$OUT"
check "confirma la reunión agendada" "$(has "$OUT" 'Agend')" "$OUT"
check "a las 11:00 (la hora que pidió el cliente)" "$(has "$OUT" '11:00')" "$OUT"

EV=$(curl -s "$BASE/api/dev/google-mock/outbox")
check "el evento se creó de verdad en el calendario" \
  "$([ "$(echo "$EV" | grep -c '"events":\[\]')" -eq 0 ] && echo true || echo false)" "$EV"

echo "── 4. El guard sigue vivo: un número que NO es hora no agenda"
N_ANTES=$(curl -s "$BASE/api/dev/google-mock/outbox" | grep -o '"id"' | wc -l | tr -d ' ')
say '"tengo 11 empleados"'
sleep 8
N_DESPUES=$(curl -s "$BASE/api/dev/google-mock/outbox" | grep -o '"id"' | wc -l | tr -d ' ')
check "«tengo 11 empleados» NO crea otra reunión" \
  "$([ "$N_ANTES" = "$N_DESPUES" ] && echo true || echo false)" "antes=$N_ANTES después=$N_DESPUES"

echo
echo "═══ RESULTADO: $PASS ok · $FAIL fallos ═══"
[ "$FAIL" -eq 0 ]
