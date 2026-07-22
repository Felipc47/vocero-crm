#!/bin/bash
# Self-test de COMPORTAMIENTO — etapa "Agendado" + ficha del lead con IA.
# Requiere `pnpm dev` con mocks (wa-mock + ai-mock + google-mock).
set -uo pipefail

BASE="http://localhost:3000"
JAR="${TMPDIR:-/tmp}/seomos-e2e-agendado.txt"
rm -f "$JAR"
EMAIL="lead-$(date +%s)@test.local"
WABA="waba_test_1"; PHONE="phone_test_1"; TOKEN="EAAtest-valido"
CLIENTE="573001112233"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"

echo "── Reset de la BD local (el registro se cierra tras la 1ª organización)"
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d vocero -q \
  -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
(cd "$REPO" && pnpm db:migrate > /dev/null 2>&1)
# Los mocks guardan estado en memoria del proceso: sin limpiarlos, un evento
# de la corrida anterior provoca "slot_taken" al agendar en esta.
curl -s -X DELETE "$BASE/api/dev/google-mock/outbox" > /dev/null
curl -s -X DELETE "$BASE/api/dev/wa-mock/outbox" > /dev/null

PASS=0; FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad() { echo "  ❌ $1"; echo "     └─ $2"; FAIL=$((FAIL+1)); }
check() { if [ "$2" = "true" ]; then ok "$1"; else bad "$1" "$3"; fi }
has()  { [ "$(echo "$1" | grep -c "$2")" -gt 0 ] && echo true || echo false; }

echo "── 0. Registro, número conectado y agente encendido"
curl -s -c "$JAR" -X POST "$BASE/api/auth/sign-up/email" -H 'content-type: application/json' \
  -d "{\"name\":\"Tester\",\"email\":\"$EMAIL\",\"password\":\"Password123!\"}" > /dev/null
curl -s -b "$JAR" -c "$JAR" -X PUT "$BASE/api/settings/whatsapp" -H 'content-type: application/json' \
  -d "{\"wabaId\":\"$WABA\",\"phoneNumberId\":\"$PHONE\",\"token\":\"$TOKEN\"}" > /dev/null
curl -s -b "$JAR" -X PUT "$BASE/api/agent/profile" -H 'content-type: application/json' \
  -d '{"enabled":true,"name":"Ana"}' > /dev/null
AG=$(curl -s -b "$JAR" "$BASE/api/agent/profile")
check "agente encendido" "$(has "$AG" '"enabled":true')" "$AG"

echo "── 1. La etapa «Agendado» existe y es un ancla del sistema"
ST=$(curl -s -b "$JAR" "$BASE/api/pipeline/stages")
check "aparece «Agendado»" "$(has "$ST" 'Agendado')" "$ST"
check "con kind=scheduled (no se borra a mano)" "$(has "$ST" '"kind":"scheduled"')" "$ST"
POS_AG=$(echo "$ST" | sed -n 's/.*"name":"Agendado","position":\([0-9]*\).*/\1/p')
POS_CL=$(echo "$ST" | sed -n 's/.*"name":"Cliente","position":\([0-9]*\).*/\1/p')
check "va antes de «Cliente» en el tablero" \
  "$([ -n "$POS_AG" ] && [ -n "$POS_CL" ] && [ "$POS_AG" -lt "$POS_CL" ] && echo true || echo false)" \
  "Agendado=$POS_AG Cliente=$POS_CL"

echo "── 2. La migración de «Agendado» es re-ejecutable (constitución IV)"
SQL="INSERT INTO pipeline_stage (id, organization_id, name, position, kind)
 SELECT 'stg_' || substr(md5(random()::text || o.id),1,21), o.id, 'Agendado',
   COALESCE((SELECT MAX(s.position)+1 FROM pipeline_stage s WHERE s.organization_id=o.id AND s.kind='open'),0),
   'scheduled'
 FROM organization o
 WHERE NOT EXISTS (SELECT 1 FROM pipeline_stage s WHERE s.organization_id=o.id AND s.kind='scheduled');"
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d vocero -q -c "$SQL" > /dev/null 2>&1
N=$(PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d vocero -tAc \
  "SELECT count(*) FROM pipeline_stage WHERE kind='scheduled';" 2>/dev/null)
check "re-aplicarla NO duplica la etapa" "$([ "$N" = "1" ] && echo true || echo false)" "filas=$N"

echo "── 3. Mensaje entrante del cliente → ficha del lead extraída por IA"
curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
  -d "{\"phoneNumberId\":\"$PHONE\",\"from\":\"$CLIENTE\",\"name\":\"Argemiro H\",\"text\":\"Hola, me llamo Argemiro y tengo la Panadería Trigal. Necesito una página web para vender en línea, con presupuesto de 2 millones. Lo necesito este mes.\"}" > /dev/null
for i in $(seq 1 20); do
  CID=$(curl -s -b "$JAR" "$BASE/api/contacts" | sed -n "s/.*{\"id\":\"\([^\"]*\)\",\"name\":\"Argemiro H\".*/\1/p")
  [ -n "$CID" ] && break; sleep 1
done
DET=""
for i in $(seq 1 25); do
  DET=$(curl -s -b "$JAR" "$BASE/api/contacts/$CID")
  [ "$(echo "$DET" | grep -c '"aiProfile":{')" -gt 0 ] && break; sleep 1
done
check "la ficha se generó sola tras el mensaje" "$(has "$DET" '"aiProfile":{')" "$DET"
check "captó el negocio del cliente" "$(has "$DET" 'Panader')" "$DET"
check "captó cómo se llama" "$(has "$DET" '"contactName":"Argemiro"')" "$DET"
check "captó la necesidad" "$(has "$DET" 'gina web')" "$DET"
check "captó el presupuesto" "$(has "$DET" '2 millones')" "$DET"
check "captó el plazo" "$(has "$DET" 'Este mes')" "$DET"
check "las notas del operador NO se pisaron" \
  "$([ "$(echo "$DET" | grep -c '"notes":null')" -gt 0 ] && echo true || echo false)" "$DET"

echo "── 4. Conectar Google Calendar (mock) y agendar"
curl -s -b "$JAR" -c "$JAR" -L "$BASE/api/google/oauth/start" > /dev/null
GC=$(curl -s -b "$JAR" "$BASE/api/settings/calendar")
check "calendario conectado" "$(has "$GC" 'connected')" "$GC"

if [ "$(has "$GC" 'connected')" = "true" ]; then
  curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
    -d "{\"phoneNumberId\":\"$PHONE\",\"from\":\"$CLIENTE\",\"text\":\"Quiero agendar una reunión, mi correo es argemiro@trigal.co\"}" > /dev/null
  sleep 3
  CONFIRM=$(curl -s -b "$JAR" "$BASE/api/conversations" | head -c 400)
  for i in $(seq 1 25); do
    DET=$(curl -s -b "$JAR" "$BASE/api/contacts/$CID")
    [ "$(echo "$DET" | grep -c 'Agendado')" -gt 0 ] && break; sleep 1
  done
  check "el lead pasó a la etapa «Agendado»" "$(has "$DET" 'Agendado')" "$DET"
fi

echo
echo "═══ RESULTADO: $PASS ok · $FAIL fallos ═══"
[ "$FAIL" -eq 0 ]
