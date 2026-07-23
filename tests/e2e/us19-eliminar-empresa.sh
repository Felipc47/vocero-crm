#!/bin/bash
# Self-test de COMPORTAMIENTO: eliminar una empresa (doble confirmación en UI),
# respaldo de 30 días con restauración, y purga definitiva al vencer.
set -uo pipefail

BASE="http://localhost:3000"
JAR_A="${TMPDIR:-/tmp}/seomos-e2e-del-super.txt"
JAR_B="${TMPDIR:-/tmp}/seomos-e2e-del-admin.txt"
rm -f "$JAR_A" "$JAR_B"
TS=$(date +%s)
ADMINB_EMAIL="rosa-$TS@test.local"
ADMINB_PASS="Temporal123!"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SQL() { PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d vocero -tA -c "$1"; }

echo "── Reset de BD y mocks"
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d vocero -q \
  -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
(cd "$REPO" && pnpm db:migrate > /dev/null 2>&1)

PASS=0; FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad() { echo "  ❌ $1"; echo "     └─ $2"; FAIL=$((FAIL+1)); }
check() { if [ "$2" = "true" ]; then ok "$1"; else bad "$1" "$3"; fi }
has() { [ "$(echo "$1" | grep -c "$2")" -gt 0 ] && echo true || echo false; }

echo "── 0. Superadmin + empresa B con actividad real"
curl -s -c "$JAR_A" -X POST "$BASE/api/auth/sign-up/email" -H 'content-type: application/json' \
  -d "{\"name\":\"Juan Super\",\"email\":\"super-$TS@test.local\",\"password\":\"Password123!\"}" > /dev/null
curl -s -b "$JAR_A" -X POST "$BASE/api/admin/companies" -H 'content-type: application/json' \
  -d "{\"companyName\":\"Panadería La Espiga\",\"adminName\":\"Rosa Núñez\",\"adminEmail\":\"$ADMINB_EMAIL\",\"adminPassword\":\"$ADMINB_PASS\"}" > /dev/null
curl -s -c "$JAR_B" -X POST "$BASE/api/auth/sign-in/email" -H 'content-type: application/json' \
  -d "{\"email\":\"$ADMINB_EMAIL\",\"password\":\"$ADMINB_PASS\"}" > /dev/null
curl -s -b "$JAR_B" -X PUT "$BASE/api/settings/whatsapp" -H 'content-type: application/json' \
  -d '{"wabaId":"waba_esp","phoneNumberId":"phone_esp","token":"EAAtest-valido"}' > /dev/null
curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
  -d '{"phoneNumberId":"phone_esp","from":"5730099887","name":"Cliente Pan","type":"text","text":"hola pan"}' > /dev/null
sleep 2
ORG_B=$(SQL "SELECT id FROM organization WHERE name = 'Panadería La Espiga'")
MSGS_BEFORE=$(SQL "SELECT count(*) FROM message WHERE organization_id = '$ORG_B'")
check "empresa B viva con mensajes" "$([ "$MSGS_BEFORE" -ge 1 ] && echo true || echo false)" "msgs=$MSGS_BEFORE"

echo "── 1. Guardas del borrado"
OWN=$(SQL "SELECT id FROM organization WHERE name LIKE 'Negocio de%'")
R=$(curl -s -b "$JAR_A" -X DELETE "$BASE/api/admin/companies/$OWN")
check "no se puede eliminar la propia organización" "$(has "$R" 'own_organization')" "$R"
R=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR_B" -X DELETE "$BASE/api/admin/companies/$ORG_B")
check "un admin normal no puede eliminar → 403" "$([ "$R" = "403" ] && echo true || echo false)" "HTTP $R"
R=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR_A" -X DELETE "$BASE/api/admin/companies/org_noexiste")
check "empresa inexistente → 404" "$([ "$R" = "404" ] && echo true || echo false)" "HTTP $R"

echo "── 2. Eliminar B: acceso y webhook se congelan, datos quedan de respaldo"
R=$(curl -s -b "$JAR_A" -X DELETE "$BASE/api/admin/companies/$ORG_B")
check "eliminada con fecha de purga (+30 días)" "$(has "$R" 'purgeAt')" "$R"
R=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR_B" "$BASE/api/conversations")
check "el admin de B pierde el acceso → 401" "$([ "$R" = "401" ] && echo true || echo false)" "HTTP $R"
curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
  -d '{"phoneNumberId":"phone_esp","from":"5730099887","type":"text","text":"sigo aquí?"}' > /dev/null
sleep 2
MSGS_AFTER=$(SQL "SELECT count(*) FROM message WHERE organization_id = '$ORG_B'")
check "el webhook ya no procesa (mensajes congelados)" \
  "$([ "$MSGS_AFTER" = "$MSGS_BEFORE" ] && echo true || echo false)" "antes=$MSGS_BEFORE después=$MSGS_AFTER"
check "pero los datos siguen en la BD (respaldo)" \
  "$([ "$MSGS_AFTER" -ge 1 ] && echo true || echo false)" "msgs=$MSGS_AFTER"
R=$(curl -s -b "$JAR_A" "$BASE/api/admin/companies")
check "la lista la marca eliminada" "$(has "$R" 'deletedAt":"2')" "$R"
R=$(curl -s -b "$JAR_A" -X DELETE "$BASE/api/admin/companies/$ORG_B")
check "eliminarla dos veces → already_deleted" "$(has "$R" 'already_deleted')" "$R"

echo "── 3. Restaurar dentro de los 30 días: todo vuelve tal cual"
curl -s -b "$JAR_A" -X POST "$BASE/api/admin/companies/$ORG_B/restore" > /dev/null
R=$(curl -s -b "$JAR_B" "$BASE/api/conversations")
check "el admin de B recupera el acceso y sus chats" "$(has "$R" 'Cliente Pan')" "$R"
curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
  -d '{"phoneNumberId":"phone_esp","from":"5730099887","type":"text","text":"volví"}' > /dev/null
sleep 2
MSGS_RESTORED=$(SQL "SELECT count(*) FROM message WHERE organization_id = '$ORG_B'")
check "su webhook vuelve a procesar" \
  "$([ "$MSGS_RESTORED" -gt "$MSGS_AFTER" ] && echo true || echo false)" "antes=$MSGS_AFTER ahora=$MSGS_RESTORED"

echo "── 4. Purga definitiva al vencer los 30 días"
curl -s -b "$JAR_A" -X DELETE "$BASE/api/admin/companies/$ORG_B" > /dev/null
SQL "UPDATE organization SET deleted_at = now() - interval '31 days' WHERE id = '$ORG_B'" > /dev/null
R=$(curl -s -b "$JAR_A" "$BASE/api/admin/companies")
check "tras vencer, ya no aparece en la lista" \
  "$([ "$(echo "$R" | grep -c 'La Espiga')" -eq 0 ] && echo true || echo false)" "$R"
LEFT=$(SQL "SELECT count(*) FROM organization WHERE id = '$ORG_B'")
MSGS_LEFT=$(SQL "SELECT count(*) FROM message WHERE organization_id = '$ORG_B'")
USER_LEFT=$(SQL "SELECT count(*) FROM \"user\" WHERE email = '$ADMINB_EMAIL'")
check "la organización se purgó" "$([ "$LEFT" = "0" ] && echo true || echo false)" "org=$LEFT"
check "sus mensajes también (cascada)" "$([ "$MSGS_LEFT" = "0" ] && echo true || echo false)" "msgs=$MSGS_LEFT"
check "y su usuario huérfano" "$([ "$USER_LEFT" = "0" ] && echo true || echo false)" "user=$USER_LEFT"
R=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR_A" -X POST "$BASE/api/admin/companies/$ORG_B/restore")
check "restaurar algo purgado → 404" "$([ "$R" = "404" ] && echo true || echo false)" "HTTP $R"

echo
echo "═══ RESULTADO: $PASS ok · $FAIL fallos ═══"
[ "$FAIL" -eq 0 ]
