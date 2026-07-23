#!/bin/bash
# Self-test de COMPORTAMIENTO: superadmin crea empresas con su propio espacio
# aislado y su admin. Corre contra `pnpm dev` con wa-mock.
set -uo pipefail

BASE="http://localhost:3000"
JAR_A="${TMPDIR:-/tmp}/seomos-e2e-super.txt"   # superadmin (empresa A)
JAR_B="${TMPDIR:-/tmp}/seomos-e2e-adminb.txt"  # admin de la empresa B
rm -f "$JAR_A" "$JAR_B"
TS=$(date +%s)
SUPER_EMAIL="super-$TS@test.local"
ADMINB_EMAIL="bertha-$TS@test.local"
ADMINB_PASS="Temporal123!"
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

echo "── 0. El primer registro queda como superadmin"
curl -s -c "$JAR_A" -X POST "$BASE/api/auth/sign-up/email" -H 'content-type: application/json' \
  -d "{\"name\":\"Juan Super\",\"email\":\"$SUPER_EMAIL\",\"password\":\"Password123!\"}" > /dev/null
R=$(curl -s -b "$JAR_A" "$BASE/api/admin/companies")
check "el fundador puede listar empresas (superadmin)" "$(has "$R" 'companies')" "$R"
check "existe su propia organización" "$(has "$R" 'Negocio de Juan Super')" "$R"

echo "── 1. Crear la empresa B con su admin"
R=$(curl -s -b "$JAR_A" -X POST "$BASE/api/admin/companies" -H 'content-type: application/json' \
  -d "{\"companyName\":\"Ferretería El Tornillo\",\"adminName\":\"Bertha Ríos\",\"adminEmail\":\"$ADMINB_EMAIL\",\"adminPassword\":\"$ADMINB_PASS\"}")
check "creada (201 con resumen)" "$(has "$R" 'Ferretería El Tornillo')" "$R"
R=$(curl -s -b "$JAR_A" "$BASE/api/admin/companies")
check "la lista ahora trae 2 empresas" \
  "$([ "$(echo "$R" | grep -o '"id":"' | wc -l | tr -d ' ')" -eq 2 ] && echo true || echo false)" "$R"
check "con el correo de su admin" "$(has "$R" "$ADMINB_EMAIL")" "$R"

echo "── 2. El admin B entra y tiene su espacio vacío y aislado"
curl -s -c "$JAR_B" -X POST "$BASE/api/auth/sign-in/email" -H 'content-type: application/json' \
  -d "{\"email\":\"$ADMINB_EMAIL\",\"password\":\"$ADMINB_PASS\"}" > /dev/null
R=$(curl -s -b "$JAR_B" "$BASE/api/conversations")
check "bandeja de B vacía" "$(has "$R" '"conversations":\[\]')" "$R"
R=$(curl -s -b "$JAR_B" "$BASE/api/settings/team")
check "B es owner de SU equipo (1 miembro)" \
  "$([ "$(echo "$R" | grep -o '"role":"owner"' | wc -l | tr -d ' ')" -eq 1 ] && [ "$(has "$R" 'Bertha')" = "true" ] && echo true || echo false)" "$R"
R=$(curl -s -b "$JAR_B" "$BASE/api/pipeline/board" 2>/dev/null || echo "")
check "su pipeline nació sembrado" "$(has "$R" 'Nuevo')" "$R"
R=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR_B" "$BASE/api/admin/companies")
check "B NO puede administrar empresas → 403" "$([ "$R" = "403" ] && echo true || echo false)" "HTTP $R"

echo "── 3. Aislamiento de datos: cada empresa su WhatsApp y sus chats"
curl -s -b "$JAR_A" -X PUT "$BASE/api/settings/whatsapp" -H 'content-type: application/json' \
  -d '{"wabaId":"waba_A","phoneNumberId":"phone_A","token":"EAAtest-valido"}' > /dev/null
curl -s -b "$JAR_B" -X PUT "$BASE/api/settings/whatsapp" -H 'content-type: application/json' \
  -d '{"wabaId":"waba_B","phoneNumberId":"phone_B","token":"EAAtest-valido"}' > /dev/null
curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
  -d '{"phoneNumberId":"phone_A","from":"5730011111","name":"Cliente De A","type":"text","text":"hola A"}' > /dev/null
curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
  -d '{"phoneNumberId":"phone_B","from":"5730022222","name":"Cliente De B","type":"text","text":"hola B"}' > /dev/null
sleep 2
RA=$(curl -s -b "$JAR_A" "$BASE/api/conversations")
RB=$(curl -s -b "$JAR_B" "$BASE/api/conversations")
check "A ve a su cliente" "$(has "$RA" 'Cliente De A')" "$RA"
check "A NO ve al cliente de B" "$([ "$(echo "$RA" | grep -c 'Cliente De B')" -eq 0 ] && echo true || echo false)" "$RA"
check "B ve a su cliente" "$(has "$RB" 'Cliente De B')" "$RB"
check "B NO ve al cliente de A" "$([ "$(echo "$RB" | grep -c 'Cliente De A')" -eq 0 ] && echo true || echo false)" "$RB"

echo "── 4. B configura su bot y su equipo (su espacio, sus reglas)"
curl -s -b "$JAR_B" -X PUT "$BASE/api/agent/profile" -H 'content-type: application/json' \
  -d '{"enabled":true,"name":"Toña"}' > /dev/null
R=$(curl -s -b "$JAR_B" "$BASE/api/agent/profile")
check "B enciende su agente" "$(has "$R" 'Toña')" "$R"
R=$(curl -s -b "$JAR_B" -X POST "$BASE/api/settings/team" -H 'content-type: application/json' \
  -d "{\"name\":\"Vendedor B\",\"email\":\"vendedor-$TS@test.local\",\"password\":\"Password123!\"}")
check "B crea una cuenta de su equipo" "$(has "$R" 'ok')" "$R"
R=$(curl -s -b "$JAR_A" "$BASE/api/agent/profile")
check "el agente de A sigue con su propia config (no Toña)" \
  "$([ "$(echo "$R" | grep -c 'Toña')" -eq 0 ] && echo true || echo false)" "$R"

echo "── 5. Caminos infelices"
R=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/sign-up/email" -H 'content-type: application/json' \
  -d "{\"name\":\"Colado\",\"email\":\"colado-$TS@test.local\",\"password\":\"Password123!\"}")
check "el registro público sigue cerrado → 403" "$([ "$R" = "403" ] && echo true || echo false)" "HTTP $R"
R=$(curl -s -b "$JAR_A" -X POST "$BASE/api/admin/companies" -H 'content-type: application/json' \
  -d "{\"companyName\":\"Duplicada\",\"adminName\":\"Otra\",\"adminEmail\":\"$ADMINB_EMAIL\",\"adminPassword\":\"Password123!\"}")
check "correo de admin repetido → duplicate" "$(has "$R" 'duplicate')" "$R"
R=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR_B" -X POST "$BASE/api/admin/companies" -H 'content-type: application/json' \
  -d '{"companyName":"Pirata","adminName":"X","adminEmail":"x@x.co","adminPassword":"Password123!"}')
check "un admin normal no crea empresas → 403" "$([ "$R" = "403" ] && echo true || echo false)" "HTTP $R"

echo
echo "═══ RESULTADO: $PASS ok · $FAIL fallos ═══"
[ "$FAIL" -eq 0 ]
