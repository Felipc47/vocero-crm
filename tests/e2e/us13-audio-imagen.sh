#!/bin/bash
# Self-test de COMPORTAMIENTO — el agente ENTIENDE audios e imágenes (007).
# Corre contra `pnpm dev` con wa-mock + ai-mock.
set -uo pipefail

BASE="http://localhost:3000"
JAR="${TMPDIR:-/tmp}/seomos-e2e-media.txt"
rm -f "$JAR"
EMAIL="media-$(date +%s)@test.local"
WABA="waba_test_1"; PHONE="phone_test_1"; TOKEN="EAAtest-valido"
CLIENTE="573001112233"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"

echo "── Reset de BD y mocks"
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d vocero -q \
  -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
(cd "$REPO" && pnpm db:migrate > /dev/null 2>&1)
curl -s -X DELETE "$BASE/api/dev/wa-mock/outbox" > /dev/null
curl -s -X POST "$BASE/api/dev/ai-mock/fail-next" -H 'content-type: application/json' \
  -d '{"transcriptions":0,"vision":0}' > /dev/null

PASS=0; FAIL=0
ok()  { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad() { echo "  ❌ $1"; echo "     └─ $2"; FAIL=$((FAIL+1)); }
check() { if [ "$2" = "true" ]; then ok "$1"; else bad "$1" "$3"; fi }
has() { [ "$(echo "$1" | grep -c "$2")" -gt 0 ] && echo true || echo false; }

# Registra un adjunto en el wa-mock y devuelve su media_id.
media_id() {
  curl -s -X POST "$BASE/api/dev/wa-mock/media" -H 'content-type: application/json' \
    -d "{\"text\":$1,\"mime\":\"$2\"}" | sed -n 's/.*"mediaId":"\([^"]*\)".*/\1/p'
}
# Entrega un mensaje entrante con adjunto.
send_media() { # tipo mediaId mime [caption]
  curl -s -X POST "$BASE/api/dev/wa-mock/inbound" -H 'content-type: application/json' \
    -d "{\"phoneNumberId\":\"$PHONE\",\"from\":\"$CLIENTE\",\"name\":\"Cliente Media\",\"type\":\"$1\",\"mediaId\":\"$2\",\"mediaMime\":\"$3\"${4:+,\"text\":$4}}" > /dev/null
}
mensajes() { curl -s -b "$JAR" "$BASE/api/conversations/$CONV/messages"; }
salidas()  { mensajes | tr '{' '\n' | grep '"direction":"out"'; }
esperar_salida() { # espera una salida NUEVA que contenga $1
  for _ in $(seq 1 30); do
    OUT=$(salidas)
    [ "$(echo "$OUT" | grep -c "$1")" -gt 0 ] && return 0
    sleep 1
  done
  return 1
}

echo "── 0. Registro, número y agente encendido"
curl -s -c "$JAR" -X POST "$BASE/api/auth/sign-up/email" -H 'content-type: application/json' \
  -d "{\"name\":\"Tester\",\"email\":\"$EMAIL\",\"password\":\"Password123!\"}" > /dev/null
curl -s -b "$JAR" -c "$JAR" -X PUT "$BASE/api/settings/whatsapp" -H 'content-type: application/json' \
  -d "{\"wabaId\":\"$WABA\",\"phoneNumberId\":\"$PHONE\",\"token\":\"$TOKEN\"}" > /dev/null
curl -s -b "$JAR" -X PUT "$BASE/api/agent/profile" -H 'content-type: application/json' \
  -d '{"enabled":true,"name":"Ana"}' > /dev/null
ok "entorno listo"

echo "── 1. NOTA DE VOZ: se transcribe al entrar"
AUDIO=$(media_id '"Hola, quiero cotizar una página web para mi panadería"' "audio/ogg")
check "el adjunto de audio queda registrado en el mock" \
  "$([ -n "$AUDIO" ] && echo true || echo false)" "mediaId=$AUDIO"
send_media "audio" "$AUDIO" "audio/ogg"
for _ in $(seq 1 20); do
  CONV=$(curl -s -b "$JAR" "$BASE/api/conversations" | sed -n 's/.*"id":"\(cv_[^"]*\)".*/\1/p' | head -1)
  [ -n "$CONV" ] && break; sleep 1
done
MSGS=""
for _ in $(seq 1 25); do
  MSGS=$(mensajes)
  [ "$(echo "$MSGS" | grep -c 'panader')" -gt 0 ] && break; sleep 1
done
check "la transcripción se guarda en el mensaje" "$(has "$MSGS" 'quiero cotizar una página web')" "$MSGS"
check "el mensaje sigue siendo de tipo audio" "$(has "$MSGS" '"type":"audio"')" "$MSGS"

echo "── 2. El AGENTE responde al CONTENIDO del audio (no lo ignora)"
# El ai-mock hace eco del texto del turno; si la transcripción llegó, la
# respuesta cita lo que el cliente dijo en la nota de voz.
esperar_salida "cotizar una página web"
OUT=$(salidas)
check "la respuesta del agente refleja lo dicho en el audio" \
  "$(has "$OUT" 'cotizar una página web')" "$OUT"
check "la respuesta NO arrastra la etiqueta de adjunto" \
  "$([ "$(echo "$OUT" | grep -c 'el cliente envió una nota de voz')" -eq 0 ] && echo true || echo false)" "$OUT"

echo "── 3. IMAGEN: el modelo la recibe de verdad"
IMG=$(media_id '"una factura de servicios por 250 mil pesos"' "image/jpeg")
send_media "image" "$IMG" "image/jpeg" '"¿me ayudan con esto?"'
esperar_salida "Veo en la imagen"
OUT2=$(salidas)
check "el agente describe lo que hay en la imagen" "$(has "$OUT2" 'Veo en la imagen')" "$OUT2"
check "y el contenido es el de la imagen enviada" "$(has "$OUT2" 'factura de servicios')" "$OUT2"
MSGS2=$(mensajes)
check "el pie de foto se guarda como texto del mensaje" "$(has "$MSGS2" 'me ayudan con esto')" "$MSGS2"

echo "── 4. Camino infeliz: el proveedor de transcripción está caído"
curl -s -X POST "$BASE/api/dev/ai-mock/fail-next" -H 'content-type: application/json' \
  -d '{"transcriptions":5}' > /dev/null
AUDIO2=$(media_id '"este audio no se podrá transcribir"' "audio/ogg")
send_media "audio" "$AUDIO2" "audio/ogg"
MSGS3=""
for _ in $(seq 1 25); do
  MSGS3=$(mensajes)
  [ "$(echo "$MSGS3" | grep -c 'no se pudo transcribir')" -gt 0 ] && break; sleep 1
done
check "el mensaje queda con un marcador claro, sin colgarse" \
  "$(has "$MSGS3" 'no se pudo transcribir')" "$MSGS3"
curl -s -X POST "$BASE/api/dev/ai-mock/fail-next" -H 'content-type: application/json' \
  -d '{"transcriptions":0}' > /dev/null

echo "── 5. Camino infeliz: el modelo RECHAZA la imagen → el turno sigue"
curl -s -X POST "$BASE/api/dev/ai-mock/fail-next" -H 'content-type: application/json' \
  -d '{"vision":9}' > /dev/null
ANTES=$(salidas | wc -l | tr -d ' ')
IMG2=$(media_id '"un recibo cualquiera"' "image/jpeg")
send_media "image" "$IMG2" "image/jpeg" '"¿esto sirve?"'
DESPUES="$ANTES"
for _ in $(seq 1 30); do
  DESPUES=$(salidas | wc -l | tr -d ' ')
  [ "$DESPUES" -gt "$ANTES" ] && break; sleep 1
done
check "el agente responde igual, sin escalar por el rechazo" \
  "$([ "$DESPUES" -gt "$ANTES" ] && echo true || echo false)" "antes=$ANTES despues=$DESPUES"
CONVJSON=$(curl -s -b "$JAR" "$BASE/api/conversations")
check "la conversación NO quedó en handoff por error" \
  "$([ "$(echo "$CONVJSON" | grep -c '"handoffReason":"error"')" -eq 0 ] && echo true || echo false)" "$CONVJSON"
curl -s -X POST "$BASE/api/dev/ai-mock/fail-next" -H 'content-type: application/json' \
  -d '{"vision":0}' > /dev/null

echo "── 6. Camino infeliz: media inexistente en Meta"
send_media "image" "mediamock_noexiste" "image/jpeg" '"mira esto"'
sleep 6
MSGS4=$(mensajes)
check "el mensaje se registra igual" "$(has "$MSGS4" 'mira esto')" "$MSGS4"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/health")
check "la app sigue sana" "$([ "$HEALTH" = "200" ] && echo true || echo false)" "HTTP $HEALTH"

echo "── 7. La baja también funciona por nota de voz (006 + 007)"
AUDIO3=$(media_id '"No me escriban más por favor"' "audio/ogg")
send_media "audio" "$AUDIO3" "audio/ogg"
CT=""
for _ in $(seq 1 25); do
  CT=$(curl -s -b "$JAR" "$BASE/api/contacts")
  [ "$(echo "$CT" | grep -c '"optedOutAt":"2')" -gt 0 ] && break; sleep 1
done
check "pedir la baja hablando también da de baja" "$(has "$CT" '"optedOutAt":"2')" "$CT"

echo
echo "═══ RESULTADO: $PASS ok · $FAIL fallos ═══"
[ "$FAIL" -eq 0 ]
