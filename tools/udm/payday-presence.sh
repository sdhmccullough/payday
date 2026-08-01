#!/bin/sh
# PayDay presence poller for UniFi Dream Machine (Pro / SE / Pro Max).
#
# Watches the UniFi client list for one phone's MAC and reports raw
# arrival/departure timestamps to the PayDay database. It can ONLY write
# presence timestamps (enforced by database security rules) — never pay,
# history, or member data. All interpretation happens in the app.
#
# Usage:
#   payday-presence.sh login   one-time: sign the sensor account in
#                              (stores only the refresh token, never the password)
#   payday-presence.sh poll    single cycle, for testing (add sh -x for detail)
#   payday-presence.sh run     foreground loop (launched by on_boot.d shim)
#
# Full setup guide: SETUP-UNIFI.md in the PayDay repo.

set -u

STATE_DIR="${PAYDAY_STATE_DIR:-/data/payday}"
CONFIG="$STATE_DIR/config"
LOG="$STATE_DIR/presence.log"
RT_FILE="$STATE_DIR/refresh_token"
IDT_FILE="$STATE_DIR/id_token"
IDT_TIME_FILE="$STATE_DIR/id_token_time"
LAST_PRESENT_FILE="$STATE_DIR/last_present"

mkdir -p "$STATE_DIR"

if [ ! -f "$CONFIG" ]; then
  echo "Missing $CONFIG — copy tools/udm/config.example there and edit it." >&2
  exit 1
fi
# shellcheck disable=SC1090
. "$CONFIG"

: "${NANNY_MAC:?NANNY_MAC not set in $CONFIG}"
: "${HID:?HID not set in $CONFIG}"
: "${SITE_ID:?SITE_ID not set in $CONFIG}"
: "${UNIFI_KEY:?UNIFI_KEY not set in $CONFIG}"
: "${FB_KEY:?FB_KEY not set in $CONFIG}"
DB="${DB:-https://payday-daf05-default-rtdb.firebaseio.com}"
CONSOLE_URL="${CONSOLE_URL:-https://127.0.0.1}"
POLL_SECS="${POLL_SECS:-180}"
QUIET_START="${QUIET_START:-0500}"   # no reporting before (HHMM)
QUIET_END="${QUIET_END:-2300}"      # or after
ABSENT_RESET_SECS="${ABSENT_RESET_SECS:-14400}"  # 4 h absence = new arrival

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"
  # Keep the log under ~1 MB.
  if [ "$(wc -c < "$LOG" 2>/dev/null || echo 0)" -gt 1048576 ]; then
    tail -c 262144 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
}

json_str() { # json_str FIELD  — extract "FIELD":"value" from stdin
  sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
}

# ---- Firebase auth --------------------------------------------------------

login() {
  printf 'Sensor account email: '
  read -r email
  printf 'Sensor account password (input hidden): '
  stty -echo 2>/dev/null || true
  read -r password
  stty echo 2>/dev/null || true
  echo
  resp=$(curl -s -X POST \
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FB_KEY" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$password\",\"returnSecureToken\":true}")
  password=''
  rt=$(echo "$resp" | json_str refreshToken)
  uid=$(echo "$resp" | json_str localId)
  if [ -z "$rt" ]; then
    echo "Sign-in FAILED. Response:" >&2
    echo "$resp" >&2
    exit 1
  fi
  umask 077
  printf '%s' "$rt" > "$RT_FILE"
  rm -f "$IDT_FILE" "$IDT_TIME_FILE"
  echo "Signed in. Sensor UID (paste this into PayDay Settings > Presence sensor):"
  echo "  $uid"
}

ensure_token() {
  now=$(date +%s)
  if [ -f "$IDT_FILE" ] && [ -f "$IDT_TIME_FILE" ]; then
    age=$((now - $(cat "$IDT_TIME_FILE")))
    [ "$age" -lt 3000 ] && { ID_TOKEN=$(cat "$IDT_FILE"); return 0; }
  fi
  [ -f "$RT_FILE" ] || { log "ERROR no refresh token — run: payday-presence.sh login"; return 1; }
  resp=$(curl -s -X POST "https://securetoken.googleapis.com/v1/token?key=$FB_KEY" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d "grant_type=refresh_token&refresh_token=$(cat "$RT_FILE")")
  ID_TOKEN=$(echo "$resp" | json_str id_token)
  new_rt=$(echo "$resp" | json_str refresh_token)
  if [ -z "$ID_TOKEN" ]; then
    log "ERROR token refresh failed: $(echo "$resp" | head -c 200)"
    return 1
  fi
  umask 077
  printf '%s' "$ID_TOKEN" > "$IDT_FILE"
  printf '%s' "$now" > "$IDT_TIME_FILE"
  [ -n "$new_rt" ] && printf '%s' "$new_rt" > "$RT_FILE"
  return 0
}

# ---- UniFi ---------------------------------------------------------------

phone_present() {
  clients=$(curl -sk -m 15 -H "X-API-KEY: $UNIFI_KEY" -H 'Accept: application/json' \
    "$CONSOLE_URL/proxy/network/integration/v1/sites/$SITE_ID/clients?limit=200")
  if [ -z "$clients" ]; then
    log "WARN empty response from UniFi API"
    return 2
  fi
  echo "$clients" | grep -qi "$NANNY_MAC"
}

# ---- poll cycle ----------------------------------------------------------

poll() {
  hhmm=$(date +%H%M)
  if [ "$hhmm" -lt "$QUIET_START" ] || [ "$hhmm" -ge "$QUIET_END" ]; then
    return 0
  fi
  ensure_token || return 1

  now_s=$(date +%s)
  now_ms="${now_s}000"
  today=$(date +%Y-%m-%d)

  phone_present
  case $? in
    0) present=1 ;;
    1) present=0 ;;
    *) return 1 ;;  # API error — skip cycle, do not fabricate absence
  esac

  if [ "$present" -eq 1 ]; then
    body="\"lastSeenAt\":$now_ms,\"updatedAt\":$now_ms"
    last_present=$(cat "$LAST_PRESENT_FILE" 2>/dev/null || echo 0)
    if [ $((now_s - last_present)) -ge "$ABSENT_RESET_SECS" ]; then
      # New arrival — stamp firstSeenAt only if today doesn't have one yet.
      existing=$(curl -s -m 15 \
        "$DB/households/$HID/presence/$today/firstSeenAt.json?auth=$ID_TOKEN")
      if [ "$existing" = "null" ]; then
        body="\"firstSeenAt\":$now_ms,$body"
        log "ARRIVAL detected"
      fi
    fi
    printf '%s' "$now_s" > "$LAST_PRESENT_FILE"
  else
    body="\"updatedAt\":$now_ms"   # heartbeat proves the sensor is alive
  fi

  result=$(curl -s -m 15 -X PATCH \
    "$DB/households/$HID/presence/$today.json?auth=$ID_TOKEN" \
    -H 'Content-Type: application/json' -d "{$body}")
  case "$result" in
    *error*) log "ERROR write rejected: $(echo "$result" | head -c 200)" ;;
    *) [ "$present" -eq 1 ] && log "present — reported" || true ;;
  esac
}

# ---- entry ---------------------------------------------------------------

case "${1:-}" in
  login) login ;;
  poll) poll ;;
  run)
    log "poller starting (poll every ${POLL_SECS}s)"
    while :; do
      poll || true
      sleep "$POLL_SECS"
    done
    ;;
  *)
    echo "Usage: $0 {login|poll|run}" >&2
    exit 1
    ;;
esac
