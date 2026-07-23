#!/bin/bash
# Self-test de COMPORTAMIENTO: enviar y recibir adjuntos (PDF, Word, imagen…)
# en la bandeja. Corre contra `pnpm dev` con wa-mock.
set -uo pipefail

BASE="http://localhost:3000"
JAR="${TMPDIR:-/tmp}/seomos-e2e-adj.txt"
rm -f "$JAR"
EMAIL="adj-$(date +%s)@test.local"
WABA="waba_test_1"; PHONE="phone_test_1"; TOKEN="EAAtest-valido"
CLIENTE="573007776655"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="${TMPDIR:-/tmp}"

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

# Archivos de prueba
printf '%%PDF-1.4 cotizacion de prueba seomos' > "$TMP/cotizacion.pdf"
printf 'informe de obra' > "$TMP/informe.docx"
python3 -c "
import base64
open('$TMP/foto.png','wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='))
"
dd if=/dev/zero of="$TMP/grande.png" bs=1048576 count=6 2>/dev/null

echo "── 0. Registro y conexión del número (mock)"
curl -s -c "$JAR" -X POST "$BASE/api/auth/sign-up/email" -H 'content-type: application/json' \
  -d "{\"name\":\"Tester\",\"email\":\"$EMAIL\",\"password\":\"Password123!\"}" > /dev/null
curl -s -b "$JAR" -c "$JAR" -X PUT "$BASE/api/settings/whatsapp" -H 'content-type: application/json' \
  -d "{\"wabaId\":\"$WABA\",\"phoneNumberId\":\"$PHONE\",\"token\":\"$TOKEN\"}" > /dev/null
ok "entorno listo"

echo "── 1. RECIBIR: entra un PDF del cliente con nombre de archivo"
MEDIA=$(curl -s -X POST "$BASE/api/dev/wa-mock/media" -H 'content-type: application/json' \
  -d '{"text":"contenido pdf entrante","mime":"application/pdf"}' | sed -n 's/.*"mediaId":"\([^"]*\)".*/\1/p')
curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
  -d "{\"phoneNumberId\":\"$PHONE\",\"from\":\"$CLIENTE\",\"name\":\"Cliente Adjuntos\",\"type\":\"document\",\"mediaId\":\"$MEDIA\",\"mediaMime\":\"application/pdf\",\"mediaFilename\":\"planos-cocina.pdf\",\"text\":\"aquí los planos\"}" > /dev/null
sleep 2
CONV=$(curl -s -b "$JAR" "$BASE/api/conversations" | sed -n 's/.*"id":"\(cv_[^"]*\)".*/\1/p' | head -1)
MSGS=$(curl -s -b "$JAR" "$BASE/api/conversations/$CONV/messages")
check "el DTO trae el nombre del archivo" "$(has "$MSGS" 'planos-cocina.pdf')" "$MSGS"
DOC_IN=$(echo "$MSGS" | tr '{' '\n' | grep '"type":"document"' | sed -n 's/.*"id":"\(msg_[^"]*\)".*/\1/p' | head -1)
H=$(curl -s -o /dev/null -w "%{http_code}|%{content_type}" -b "$JAR" \
  "$BASE/api/conversations/$CONV/messages/$DOC_IN/media?download=1" -D "$TMP/adj-headers.txt")
check "descarga 200 como application/pdf" \
  "$([ "$H" = "200|application/pdf" ] && echo true || echo false)" "$H"
check "con content-disposition y su nombre" \
  "$(has "$(cat "$TMP/adj-headers.txt")" 'attachment; filename="planos-cocina.pdf"')" "$(cat "$TMP/adj-headers.txt")"

echo "── 2. ENVIAR: un PDF con pie de texto"
R=$(curl -s -b "$JAR" -X POST "$BASE/api/conversations/$CONV/messages/attachment" \
  -F "file=@$TMP/cotizacion.pdf;type=application/pdf" -F "caption=te paso la cotización")
check "el envío responde messageId" "$(has "$R" 'messageId')" "$R"
OUTBOX=$(curl -s "$BASE/api/dev/wa-mock/outbox")
check "Meta (wa-mock) recibió type=document" "$(has "$OUTBOX" '"type":"document"')" "$OUTBOX"
check "con el nombre del archivo" "$(has "$OUTBOX" 'cotizacion.pdf')" "$OUTBOX"
check "y el pie" "$(has "$OUTBOX" 'te paso la cotización')" "$OUTBOX"
MSGS=$(curl -s -b "$JAR" "$BASE/api/conversations/$CONV/messages")
DOC_OUT=$(echo "$MSGS" | tr '{' '\n' | grep '"type":"document"' | grep '"direction":"out"' | sed -n 's/.*"id":"\(msg_[^"]*\)".*/\1/p' | head -1)
BYTES=$(curl -s -b "$JAR" "$BASE/api/conversations/$CONV/messages/$DOC_OUT/media")
check "el PDF enviado se puede re-descargar del hilo (round-trip)" \
  "$(has "$BYTES" 'cotizacion de prueba seomos')" "$BYTES"

echo "── 3. ENVIAR: Word e imagen con pie"
R=$(curl -s -b "$JAR" -X POST "$BASE/api/conversations/$CONV/messages/attachment" \
  -F "file=@$TMP/informe.docx;type=application/vnd.openxmlformats-officedocument.wordprocessingml.document")
check "Word (.docx) aceptado" "$(has "$R" 'messageId')" "$R"
R=$(curl -s -b "$JAR" -X POST "$BASE/api/conversations/$CONV/messages/attachment" \
  -F "file=@$TMP/foto.png;type=image/png" -F "caption=así quedó")
check "imagen PNG aceptada" "$(has "$R" 'messageId')" "$R"
OUTBOX=$(curl -s "$BASE/api/dev/wa-mock/outbox")
check "la imagen viajó con su pie" "$(has "$OUTBOX" 'así quedó')" "$OUTBOX"

echo "── 4. Caminos infelices"
R=$(curl -s -b "$JAR" -X POST "$BASE/api/conversations/$CONV/messages/attachment" \
  -F "file=@$TMP/cotizacion.pdf;type=application/x-msdownload")
check "formato no permitido → unsupported_media" "$(has "$R" 'unsupported_media')" "$R"
R=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/conversations/$CONV/messages/attachment" \
  -F "file=@$TMP/grande.png;type=image/png")
check "imagen de 6 MB (tope 5) → 413" "$([ "$R" = "413" ] && echo true || echo false)" "HTTP $R"

CT=$(curl -s -b "$JAR" -X POST "$BASE/api/contacts" -H 'content-type: application/json' \
  -d '{"name":"Sin Ventana","phone":"573001231234"}' | sed -n 's/.*"id":"\(ct_[^"]*\)".*/\1/p')
CONV2=$(curl -s -b "$JAR" -X POST "$BASE/api/conversations" -H 'content-type: application/json' \
  -d "{\"contactId\":\"$CT\"}" | sed -n 's/.*"id":"\(cv_[^"]*\)".*/\1/p')
R=$(curl -s -b "$JAR" -X POST "$BASE/api/conversations/$CONV2/messages/attachment" \
  -F "file=@$TMP/cotizacion.pdf;type=application/pdf")
check "ventana cerrada → window_closed (los adjuntos son texto libre)" \
  "$(has "$R" 'window_closed')" "$R"
R=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/conversations/$CONV/messages/attachment" \
  -F "file=@$TMP/cotizacion.pdf;type=application/pdf")
check "sin sesión → 401" "$([ "$R" = "401" ] && echo true || echo false)" "HTTP $R"

echo
echo "═══ RESULTADO: $PASS ok · $FAIL fallos ═══"
[ "$FAIL" -eq 0 ]
