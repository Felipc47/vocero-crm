#!/bin/bash
# Self-test de COMPORTAMIENTO: roles por empresa, límite de equipo (6),
# aprobación de plantillas con notificaciones, y permisos por rol.
set -uo pipefail

BASE="http://localhost:3000"
J_SUPER="${TMPDIR:-/tmp}/s20-super.txt"; J_ADMIN="${TMPDIR:-/tmp}/s20-admin.txt"
J_COM="${TMPDIR:-/tmp}/s20-com.txt";     J_EDIT="${TMPDIR:-/tmp}/s20-edit.txt"
rm -f "$J_SUPER" "$J_ADMIN" "$J_COM" "$J_EDIT"
TS=$(date +%s)
REPO="$(cd "$(dirname "$0")/../.." && pwd)"

echo "── Reset de BD y mocks"
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d vocero -q \
  -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
(cd "$REPO" && pnpm db:migrate > /dev/null 2>&1)

PASS=0; FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad() { echo "  ❌ $1"; echo "     └─ $2"; FAIL=$((FAIL+1)); }
check() { if [ "$2" = "true" ]; then ok "$1"; else bad "$1" "$3"; fi }
has() { [ "$(echo "$1" | grep -c "$2")" -gt 0 ] && echo true || echo false; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

echo "── 0. Superadmin + empresa B (admin Bertha)"
curl -s -c "$J_SUPER" -X POST "$BASE/api/auth/sign-up/email" -H 'content-type: application/json' \
  -d "{\"name\":\"Juan Super\",\"email\":\"super-$TS@test.local\",\"password\":\"Password123!\"}" > /dev/null
curl -s -b "$J_SUPER" -X POST "$BASE/api/admin/companies" -H 'content-type: application/json' \
  -d "{\"companyName\":\"Constructora Delta\",\"adminName\":\"Bertha Ríos\",\"adminEmail\":\"bertha-$TS@test.local\",\"adminPassword\":\"Password123!\"}" > /dev/null
curl -s -c "$J_ADMIN" -X POST "$BASE/api/auth/sign-in/email" -H 'content-type: application/json' \
  -d "{\"email\":\"bertha-$TS@test.local\",\"password\":\"Password123!\"}" > /dev/null
ok "entorno listo"

echo "── 1. Roles al crear cuentas y límite de 6"
R=$(curl -s -b "$J_ADMIN" -X POST "$BASE/api/settings/team" -H 'content-type: application/json' \
  -d "{\"name\":\"Carla Comercial\",\"email\":\"carla-$TS@test.local\",\"password\":\"Password123!\",\"role\":\"commercial\"}")
check "admin crea comercial" "$(has "$R" 'ok')" "$R"
R=$(curl -s -b "$J_ADMIN" -X POST "$BASE/api/settings/team" -H 'content-type: application/json' \
  -d "{\"name\":\"Edgar Editor\",\"email\":\"edgar-$TS@test.local\",\"password\":\"Password123!\",\"role\":\"agent_editor\"}")
check "admin crea editor de agente" "$(has "$R" 'ok')" "$R"
for i in 4 5 6; do
  curl -s -b "$J_ADMIN" -X POST "$BASE/api/settings/team" -H 'content-type: application/json' \
    -d "{\"name\":\"Extra $i\",\"email\":\"extra$i-$TS@test.local\",\"password\":\"Password123!\",\"role\":\"commercial\"}" > /dev/null
done
R=$(curl -s -b "$J_ADMIN" "$BASE/api/settings/team")
check "el equipo llegó a 6 (incluido el admin) con tope visible" \
  "$([ "$(echo "$R" | grep -o '"email"' | wc -l | tr -d ' ')" -eq 6 ] && [ "$(has "$R" '"limit":6')" = "true" ] && echo true || echo false)" "$R"
R=$(curl -s -b "$J_ADMIN" -X POST "$BASE/api/settings/team" -H 'content-type: application/json' \
  -d "{\"name\":\"Séptimo\",\"email\":\"septimo-$TS@test.local\",\"password\":\"Password123!\",\"role\":\"commercial\"}")
check "el 7º se rechaza → team_limit" "$(has "$R" 'team_limit')" "$R"
R=$(curl -s -b "$J_SUPER" "$BASE/api/settings/team")
check "la empresa del superadmin NO tiene tope (limit:null)" "$(has "$R" '"limit":null')" "$R"

echo "── 2. Asignar roles (admin y superadmin) + guardas"
MEMBER=$(curl -s -b "$J_ADMIN" "$BASE/api/settings/team" | tr '{' '\n' | grep "carla-$TS" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
R=$(curl -s -b "$J_ADMIN" -X PATCH "$BASE/api/settings/team/$MEMBER" -H 'content-type: application/json' \
  -d '{"role":"agent_editor"}')
check "el admin cambia el rol de Carla" "$(has "$R" 'ok')" "$R"
curl -s -b "$J_ADMIN" -X PATCH "$BASE/api/settings/team/$MEMBER" -H 'content-type: application/json' \
  -d '{"role":"commercial"}' > /dev/null
BERTHA=$(curl -s -b "$J_ADMIN" "$BASE/api/settings/team" | tr '{' '\n' | grep "bertha-$TS" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
R=$(curl -s -b "$J_ADMIN" -X PATCH "$BASE/api/settings/team/$BERTHA" -H 'content-type: application/json' \
  -d '{"role":"commercial"}')
check "degradar al último admin se rechaza → last_admin" "$(has "$R" 'last_admin')" "$R"
ORG_B=$(curl -s -b "$J_SUPER" "$BASE/api/admin/companies" | tr '{' '\n' | grep 'Constructora Delta' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
R=$(curl -s -b "$J_SUPER" "$BASE/api/admin/companies/$ORG_B/members")
check "el superadmin ve el equipo de cualquier empresa" "$(has "$R" 'Carla')" "$R"
R=$(curl -s -b "$J_SUPER" -X PATCH "$BASE/api/admin/companies/$ORG_B/members" -H 'content-type: application/json' \
  -d "{\"memberId\":\"$MEMBER\",\"role\":\"commercial\"}")
check "y asigna roles cross-org" "$(has "$R" 'ok')" "$R"

echo "── 3. Permisos del comercial"
curl -s -c "$J_COM" -X POST "$BASE/api/auth/sign-in/email" -H 'content-type: application/json' \
  -d "{\"email\":\"carla-$TS@test.local\",\"password\":\"Password123!\"}" > /dev/null
check "bandeja → 200" "$([ "$(code -b "$J_COM" "$BASE/api/conversations")" = "200" ] && echo true || echo false)" "conversations"
check "agente → 403" "$([ "$(code -b "$J_COM" "$BASE/api/agent/profile")" = "403" ] && echo true || echo false)" "agent"
check "conexión WhatsApp → 403" "$([ "$(code -b "$J_COM" -X PUT "$BASE/api/settings/whatsapp" -H 'content-type: application/json' -d '{"wabaId":"x","phoneNumberId":"y","token":"z"}')" = "403" ] && echo true || echo false)" "whatsapp"
check "calendario → 403" "$([ "$(code -b "$J_COM" "$BASE/api/settings/calendar")" = "403" ] && echo true || echo false)" "calendar"
check "crear cuentas de equipo → 403" "$([ "$(code -b "$J_COM" -X POST "$BASE/api/settings/team" -H 'content-type: application/json' -d '{"name":"x","email":"x@x.co","password":"Password123!"}')" = "403" ] && echo true || echo false)" "team"
SVC=$(curl -s -b "$J_COM" -X POST "$BASE/api/services" -H 'content-type: application/json' \
  -d '{"name":"Remodelaciones"}' | sed -n 's/.*"id":"\(svc_[^"]*\)".*/\1/p')
check "puede crear servicios" "$([ -n "$SVC" ] && echo true || echo false)" "services"
R=$(code -b "$J_COM" -X POST "$BASE/api/services/$SVC/forms" -H 'content-type: application/json' -d '{"formId":"form_123"}')
check "pero vincular formularios → 403" "$([ "$R" = "403" ] && echo true || echo false)" "HTTP $R"

echo "── 4. Permisos del editor de agente"
curl -s -c "$J_EDIT" -X POST "$BASE/api/auth/sign-in/email" -H 'content-type: application/json' \
  -d "{\"email\":\"edgar-$TS@test.local\",\"password\":\"Password123!\"}" > /dev/null
check "agente → 200" "$([ "$(code -b "$J_EDIT" "$BASE/api/agent/profile")" = "200" ] && echo true || echo false)" "agent"
check "crear plantillas → 403" "$([ "$(code -b "$J_EDIT" -X POST "$BASE/api/templates" -H 'content-type: application/json' -d '{"name":"x","language":"es_CO","category":"UTILITY","body":"hola"}')" = "403" ] && echo true || echo false)" "templates"

echo "── 5. Plantillas del comercial: aprobación + notificaciones"
curl -s -b "$J_ADMIN" -X PUT "$BASE/api/settings/whatsapp" -H 'content-type: application/json' \
  -d '{"wabaId":"waba_delta","phoneNumberId":"phone_delta","token":"EAAtest-valido"}' > /dev/null
R=$(curl -s -b "$J_COM" -X POST "$BASE/api/templates" -H 'content-type: application/json' \
  -d '{"name":"promo delta","language":"es_CO","category":"MARKETING","body":"Hola {{1}}, tenemos promo"}')
check "el comercial crea y queda POR APROBAR" "$(has "$R" 'awaiting_approval')" "$R"
TPL=$(echo "$R" | sed -n 's/.*"id":"\(tpl_[^"]*\)".*/\1/p')
MOCK=$(curl -s "$BASE/api/dev/wa-mock/graph/waba_delta/message_templates" -H "Authorization: Bearer EAAtest-valido")
check "y NO llegó a Meta" "$([ "$(echo "$MOCK" | grep -c 'promo_delta')" -eq 0 ] && echo true || echo false)" "$MOCK"
R=$(curl -s -b "$J_ADMIN" "$BASE/api/notifications")
check "el admin recibió la notificación" "$(has "$R" 'Plantilla por aprobar')" "$R"
R=$(curl -s -b "$J_SUPER" "$BASE/api/notifications")
check "el superadmin también" "$(has "$R" 'Plantilla por aprobar')" "$R"
R=$(code -b "$J_COM" -X POST "$BASE/api/templates/$TPL/approve")
check "el comercial NO puede aprobar → 403" "$([ "$R" = "403" ] && echo true || echo false)" "HTTP $R"
R=$(curl -s -b "$J_ADMIN" -X POST "$BASE/api/templates/$TPL/approve")
check "el admin aprueba → pending de Meta" "$(has "$R" '"status":"pending"')" "$R"
MOCK=$(curl -s "$BASE/api/dev/wa-mock/graph/waba_delta/message_templates" -H "Authorization: Bearer EAAtest-valido")
check "ahora SÍ está en Meta" "$(has "$MOCK" 'promo_delta')" "$MOCK"
R=$(curl -s -b "$J_COM" "$BASE/api/notifications")
check "el comercial fue notificado de la aprobación" "$(has "$R" 'Plantilla aprobada')" "$R"

R=$(curl -s -b "$J_COM" -X POST "$BASE/api/templates" -H 'content-type: application/json' \
  -d '{"name":"promo dos","language":"es_CO","category":"MARKETING","body":"Hola de nuevo"}')
TPL2=$(echo "$R" | sed -n 's/.*"id":"\(tpl_[^"]*\)".*/\1/p')
R=$(curl -s -b "$J_ADMIN" -X POST "$BASE/api/templates/$TPL2/reject" -H 'content-type: application/json' \
  -d '{"reason":"muy genérica"}')
check "el admin puede devolverla (draft)" "$(has "$R" '"status":"draft"')" "$R"
R=$(curl -s -b "$J_COM" "$BASE/api/notifications")
check "el comercial fue notificado de la devolución" "$(has "$R" 'muy genérica')" "$R"

echo "── 6. Aprobación cross-org por el superadmin"
R=$(curl -s -b "$J_COM" -X POST "$BASE/api/templates" -H 'content-type: application/json' \
  -d '{"name":"promo tres","language":"es_CO","category":"UTILITY","body":"Su pedido {{1}} va en camino"}')
TPL3=$(echo "$R" | sed -n 's/.*"id":"\(tpl_[^"]*\)".*/\1/p')
R=$(curl -s -b "$J_SUPER" -X POST "$BASE/api/templates/$TPL3/approve")
check "el superadmin aprueba plantillas de cualquier empresa" "$(has "$R" '"status":"pending"')" "$R"

echo
echo "═══ RESULTADO: $PASS ok · $FAIL fallos ═══"
[ "$FAIL" -eq 0 ]
