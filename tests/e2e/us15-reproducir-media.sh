#!/bin/bash
# Self-test de COMPORTAMIENTO: reproducir notas de voz y ver imágenes bajo
# demanda (el binario solo baja cuando el usuario lo pide). Corre contra
# `pnpm dev` con wa-mock.
set -uo pipefail

BASE="http://localhost:3000"
JAR="${TMPDIR:-/tmp}/seomos-e2e-media2.txt"
rm -f "$JAR"
EMAIL="play-$(date +%s)@test.local"
WABA="waba_test_1"; PHONE="phone_test_1"; TOKEN="EAAtest-valido"
CLIENTE="573009998877"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"

echo "── Reset de BD y mocks"
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d vocero -q \
  -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
(cd "$REPO" && pnpm db:migrate > /dev/null 2>&1)

PASS=0; FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad() { echo "  ❌ $1"; echo "     └─ $2"; FAIL=$((FAIL+1)); }
check() { if [ "$2" = "true" ]; then ok "$1"; else bad "$1" "$3"; fi }

# Adjuntos con bytes REALES: un WAV de 0.3 s y un PNG de 1x1.
WAV_B64=$(python3 - <<'EOF'
import base64, io, math, struct, wave
buf = io.BytesIO()
w = wave.open(buf, "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
w.writeframes(b"".join(struct.pack("<h", int(12000*math.sin(2*math.pi*440*i/8000))) for i in range(2400)))
w.close(); print(base64.b64encode(buf.getvalue()).decode())
EOF
)
PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

media_id() { # base64 mime
  curl -s -X POST "$BASE/api/dev/wa-mock/media" -H 'content-type: application/json' \
    -d "{\"base64\":\"$1\",\"mime\":\"$2\"}" | sed -n 's/.*"mediaId":"\([^"]*\)".*/\1/p'
}
send_media() { # tipo mediaId mime [caption-json]
  curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
    -d "{\"phoneNumberId\":\"$PHONE\",\"from\":\"$CLIENTE\",\"name\":\"Cliente Media\",\"type\":\"$1\",\"mediaId\":\"$2\",\"mediaMime\":\"$3\"${4:+,\"text\":$4}}" > /dev/null
}

echo "── 0. Registro y conexión del número (mock)"
curl -s -c "$JAR" -X POST "$BASE/api/auth/sign-up/email" -H 'content-type: application/json' \
  -d "{\"name\":\"Tester\",\"email\":\"$EMAIL\",\"password\":\"Password123!\"}" > /dev/null
curl -s -b "$JAR" -c "$JAR" -X PUT "$BASE/api/settings/whatsapp" -H 'content-type: application/json' \
  -d "{\"wabaId\":\"$WABA\",\"phoneNumberId\":\"$PHONE\",\"token\":\"$TOKEN\"}" > /dev/null
ok "entorno listo"

echo "── 1. Entra una nota de voz y una imagen con pie de foto"
AUDIO=$(media_id "$WAV_B64" "audio/wav")
IMG=$(media_id "$PNG_B64" "image/png")
send_media audio "$AUDIO" "audio/wav"
send_media image "$IMG" "image/png" '"mi cocina actual"'
sleep 2
CONV=$(curl -s -b "$JAR" "$BASE/api/conversations" | sed -n 's/.*"id":"\(cv_[^"]*\)".*/\1/p' | head -1)
MSGS=$(curl -s -b "$JAR" "$BASE/api/conversations/$CONV/messages")
check "el DTO expone hasMedia y mediaMime" \
  "$([ "$(echo "$MSGS" | grep -o '"hasMedia":true' | wc -l | tr -d ' ')" -ge 2 ] && echo true || echo false)" "$MSGS"
AUDIO_MSG=$(echo "$MSGS" | tr '{' '\n' | grep '"type":"audio"' | sed -n 's/.*"id":"\(msg_[^"]*\)".*/\1/p' | head -1)
IMG_MSG=$(echo "$MSGS" | tr '{' '\n' | grep '"type":"image"' | sed -n 's/.*"id":"\(msg_[^"]*\)".*/\1/p' | head -1)
check "ambos mensajes existen" \
  "$([ -n "$AUDIO_MSG" ] && [ -n "$IMG_MSG" ] && echo true || echo false)" "audio=$AUDIO_MSG img=$IMG_MSG"

echo "── 2. La nota de voz se sirve bajo demanda con su mime"
H=$(curl -s -o /tmp/seomos-audio.bin -w "%{http_code} %{content_type}" -b "$JAR" \
  "$BASE/api/conversations/$CONV/messages/$AUDIO_MSG/media")
check "200 con content-type audio/wav" \
  "$([ "$H" = "200 audio/wav" ] && echo true || echo false)" "$H"
WANT=$(echo "$WAV_B64" | base64 -d | wc -c | tr -d ' ')
GOT=$(wc -c < /tmp/seomos-audio.bin | tr -d ' ')
check "los bytes llegan completos ($WANT)" \
  "$([ "$GOT" = "$WANT" ] && echo true || echo false)" "recibidos: $GOT"

echo "── 3. La imagen se sirve bajo demanda con su mime"
H=$(curl -s -o /tmp/seomos-img.bin -w "%{http_code} %{content_type}" -b "$JAR" \
  "$BASE/api/conversations/$CONV/messages/$IMG_MSG/media")
check "200 con content-type image/png" \
  "$([ "$H" = "200 image/png" ] && echo true || echo false)" "$H"
check "es un PNG de verdad (firma mágica)" \
  "$([ "$(head -c 4 /tmp/seomos-img.bin | tail -c 3)" = "PNG" ] && echo true || echo false)" "$(head -c 8 /tmp/seomos-img.bin | xxd | head -1)"

echo "── 4. Caminos infelices"
TXT_MSG=$(curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
  -d "{\"phoneNumberId\":\"$PHONE\",\"from\":\"$CLIENTE\",\"type\":\"text\",\"text\":\"hola\"}" > /dev/null; sleep 1; \
  curl -s -b "$JAR" "$BASE/api/conversations/$CONV/messages" | tr '{' '\n' | grep '"type":"text"' | sed -n 's/.*"id":"\(msg_[^"]*\)".*/\1/p' | head -1)
R=$(curl -s -b "$JAR" "$BASE/api/conversations/$CONV/messages/$TXT_MSG/media")
check "mensaje sin adjunto → no_media" \
  "$([ "$(echo "$R" | grep -c 'no_media')" -gt 0 ] && echo true || echo false)" "$R"

send_media audio "mediamock_caducado" "audio/ogg"
sleep 1
GONE=$(curl -s -b "$JAR" "$BASE/api/conversations/$CONV/messages" | tr '{' '\n' | grep 'mediamock_caducado\|"type":"audio"' | sed -n 's/.*"id":"\(msg_[^"]*\)".*/\1/p' | tail -1)
R=$(curl -s -b "$JAR" "$BASE/api/conversations/$CONV/messages/$GONE/media")
check "adjunto caducado en Meta → media_unavailable (degrada sin colgarse)" \
  "$([ "$(echo "$R" | grep -c 'media_unavailable')" -gt 0 ] && echo true || echo false)" "$R"

R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/conversations/$CONV/messages/$AUDIO_MSG/media")
check "sin sesión → 401" "$([ "$R" = "401" ] && echo true || echo false)" "HTTP $R"

R=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/conversations/$CONV/messages/msg_noexiste/media")
check "mensaje inexistente → 404" "$([ "$R" = "404" ] && echo true || echo false)" "HTTP $R"

echo
echo "═══ RESULTADO: $PASS ok · $FAIL fallos ═══"
[ "$FAIL" -eq 0 ]
