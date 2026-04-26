#!/usr/bin/env bash
# =============================================================================
# Poznote REST API Test Script
# Tests all API v1 endpoints and reports PASS/FAIL for each one.
#
# Usage:
#   ./tools/test-api.sh [OPTIONS]
#
# Options:
#   -H HOST       Base URL, e.g. http://localhost:8040  (default: http://localhost:8040)
#   -u USER       Admin username                        (default: admin)
#   -p PASS       Admin password                        (default: admin)
#   -U USER_ID    User ID to use for data endpoints     (default: 1)
#   -s            Skip slow/destructive tests (backup creation, empty trash…)
#   -v            Verbose: also print response bodies
#   -h            Show this help
#
# Examples:
#   ./tools/test-api.sh
#   ./tools/test-api.sh -H http://myserver:8040 -u admin -p secret -U 1
#   ./tools/test-api.sh -v -s
# =============================================================================

# ── Configuration ───────────────────────────────────────────────────────────
BASE_URL="http://localhost:8040"
ADMIN_USER="admin"
ADMIN_PASS="admin"
USER_ID="1"
SKIP_DESTRUCTIVE=false
VERBOSE=false
AUTH_MODE="basic"
AUTH_LABEL="HTTP Basic"
EFFECTIVE_USER_ID="1"
IS_ADMIN_AUTH=true
BEARER_TOKEN=""

while getopts "H:u:p:U:svh" opt; do
  case $opt in
    H) BASE_URL="$OPTARG" ;;
    u) ADMIN_USER="$OPTARG" ;;
    p) ADMIN_PASS="$OPTARG" ;;
    U) USER_ID="$OPTARG" ;;
    s) SKIP_DESTRUCTIVE=true ;;
    v) VERBOSE=true ;;
    h) sed -n '3,22p' "$0"; exit 0 ;;
    *) echo "Unknown option. Use -h for help." >&2; exit 1 ;;
  esac
done

API="${BASE_URL}/api/v1"
AUTH=()
USER_H=()
DATA_H=()

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

PASS=0; FAIL=0; SKIP=0
LAST_BODY=""

cleanup_tempfiles() {
  rm -f /tmp/_apibody /tmp/_api_attach.txt /tmp/_ur_backup.zip
}

trap cleanup_tempfiles EXIT

section() { echo; echo -e "${CYAN}${BOLD}══ $1 ══${RESET}"; }

# expect_status LABEL EXPECTED curl-args…  (exact HTTP code match)
expect_status() {
  local label="$1" expected="$2"; shift 2
  local code
  code=$(curl -s -o /tmp/_apibody -w "%{http_code}" \
    --connect-timeout 5 --max-time 30 "$@" 2>/dev/null) || code="000"
  LAST_BODY=$(cat /tmp/_apibody 2>/dev/null || true)
  if [[ "$code" == "$expected" ]]; then
    echo -e "  ${GREEN}PASS${RESET}  [${code}]  ${label}"
    (( PASS++ )) || true
    $VERBOSE && [[ -n "$LAST_BODY" ]] && echo "         $(printf '%s' "$LAST_BODY" | head -c 300)"
    return 0
  else
    echo -e "  ${RED}FAIL${RESET}  [${code}]  ${label}  (expected ${expected})"
    (( FAIL++ )) || true
    $VERBOSE && [[ -n "$LAST_BODY" ]] && echo "         $(printf '%s' "$LAST_BODY" | head -c 300)"
    return 1
  fi
}

# expect_2xx LABEL curl-args…  (accept any 2xx response)
expect_2xx() {
  local label="$1"; shift
  local code
  code=$(curl -s -o /tmp/_apibody -w "%{http_code}" \
    --connect-timeout 5 --max-time 30 "$@" 2>/dev/null) || code="000"
  LAST_BODY=$(cat /tmp/_apibody 2>/dev/null || true)
  if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    echo -e "  ${GREEN}PASS${RESET}  [${code}]  ${label}"
    (( PASS++ )) || true
    $VERBOSE && [[ -n "$LAST_BODY" ]] && echo "         $(printf '%s' "$LAST_BODY" | head -c 300)"
    return 0
  else
    echo -e "  ${RED}FAIL${RESET}  [${code}]  ${label}  (expected 2xx)"
    (( FAIL++ )) || true
    $VERBOSE && [[ -n "$LAST_BODY" ]] && echo "         $(printf '%s' "$LAST_BODY" | head -c 300)"
    return 1
  fi
}

skip_test() { echo -e "  ${YELLOW}SKIP${RESET}        $1"; (( SKIP++ )) || true; }

json_field() { printf '%s' "$2" | grep -oP "\"$1\"\s*:\s*\K[^\s,\}\]]+" | head -1 | tr -d '"'; }

reset_counters() {
  PASS=0
  FAIL=0
  SKIP=0
  LAST_BODY=""
}

setup_basic_auth() {
  AUTH_MODE="basic"
  AUTH_LABEL="HTTP Basic"
  EFFECTIVE_USER_ID="$USER_ID"
  IS_ADMIN_AUTH=true
  AUTH=(-u "${ADMIN_USER}:${ADMIN_PASS}")
  USER_H=(-H "X-User-ID: ${EFFECTIVE_USER_ID}")
  DATA_H=("${USER_H[@]}" -H "Content-Type: application/json")
}

setup_bearer_auth() {
  local token="$1"
  local code body token_user_id token_is_admin

  AUTH_MODE="bearer"
  AUTH_LABEL="OIDC Bearer"
  EFFECTIVE_USER_ID=""
  IS_ADMIN_AUTH=false
  AUTH=(-H "Authorization: Bearer ${token}")
  USER_H=()
  DATA_H=(-H "Content-Type: application/json")

  code=$(curl -s -o /tmp/_apibody -w "%{http_code}" \
    --connect-timeout 5 --max-time 30 "${AUTH[@]}" "${API}/users/me" 2>/dev/null) || code="000"
  body=$(cat /tmp/_apibody 2>/dev/null || true)

  if [[ "$code" != "200" ]]; then
    echo -e "  ${RED}FAIL${RESET}  [${code}]  Bearer setup: GET /users/me  (expected 200)"
    $VERBOSE && [[ -n "$body" ]] && echo "         $(printf '%s' "$body" | head -c 300)"
    return 1
  fi

  token_user_id=$(json_field "id" "$body")
  if ! [[ "$token_user_id" =~ ^[0-9]+$ ]]; then
    echo -e "  ${RED}FAIL${RESET}        Bearer setup: could not parse user ID from /users/me"
    $VERBOSE && [[ -n "$body" ]] && echo "         $(printf '%s' "$body" | head -c 300)"
    return 1
  fi

  token_is_admin=$(json_field "is_admin" "$body")
  if [[ "$token_is_admin" == "true" ]]; then
    IS_ADMIN_AUTH=true
    EFFECTIVE_USER_ID="$USER_ID"
  else
    EFFECTIVE_USER_ID="$token_user_id"
    if [[ "$USER_ID" != "$token_user_id" ]]; then
      echo -e "  ${YELLOW}INFO${RESET}        Non-admin Bearer token detected – using token-linked user ID ${token_user_id} instead of requested ${USER_ID}"
    fi
  fi

  USER_H=(-H "X-User-ID: ${EFFECTIVE_USER_ID}")
  DATA_H=("${USER_H[@]}" -H "Content-Type: application/json")
  return 0
}

silent_delete() {
  curl -s -o /dev/null "${AUTH[@]}" "${DATA_H[@]}" -X DELETE "$1" 2>/dev/null || true
}

print_run_header() {
  echo -e "${BOLD}Poznote API Test Suite${RESET}"
  echo "  Target  : ${BASE_URL}"
  echo "  Auth    : ${AUTH_LABEL}"
  if [[ "$AUTH_MODE" == "basic" ]]; then
    echo "  Admin   : ${ADMIN_USER}"
  else
    if $IS_ADMIN_AUTH; then
      echo "  Token   : admin-linked"
    else
      echo "  Token   : user-linked"
    fi
  fi
  echo "  User-ID : ${EFFECTIVE_USER_ID}"
  echo "  Date    : $(date '+%Y-%m-%d %H:%M:%S')"
}

print_summary() {
  echo
  echo -e "${BOLD}══════════════════════════════════════${RESET}"
  echo -e "${BOLD}  Results (${AUTH_LABEL})${RESET}"
  printf "  ${GREEN}PASS${RESET}  : %d\n" "$PASS"
  printf "  ${RED}FAIL${RESET}  : %d\n" "$FAIL"
  printf "  ${YELLOW}SKIP${RESET}  : %d\n" "$SKIP"
  printf "  Total : %d\n" "$((PASS + FAIL + SKIP))"
  echo -e "${BOLD}══════════════════════════════════════${RESET}"
}

prompt_for_bearer_token() {
  if [[ ! -t 0 ]]; then
    return 1
  fi

  echo
  read -r -p "Enter an OIDC Bearer token to rerun the suite (leave empty to skip): " BEARER_TOKEN
  [[ -n "$BEARER_TOKEN" ]]
}

run_test_suite() {
  local WS FOLDER_ID SUB_ID FOLDER2_ID MF_NOTE_ID NOTE_ID DUP_ID ATT_ID
  local BACKUP_FILE UR_BACKUP_FILE UPLOADED_FILE TUSER TUSER_ID

  cleanup_tempfiles
  reset_counters
  print_run_header

# ── Health Check (no auth) ──────────────────────────────────────────────────
section "Health Check"
expect_status "GET /api_health.php (no auth)" "200" "${BASE_URL}/api_health.php" || true

# ── System (auth, no X-User-ID needed) ──────────────────────────────────────
section "System"
expect_status "GET /system/version" "200" "${AUTH[@]}" "${API}/system/version" || true
expect_status "GET /system/updates" "200" "${AUTH[@]}" "${API}/system/updates" || true
expect_status "GET /system/i18n?lang=en" "200" "${AUTH[@]}" "${API}/system/i18n?lang=en" || true

# ── Current User ──────────────────────────────────────────────────────────
section "Current User"
expect_status "GET /users/me" "200" "${AUTH[@]}" "${API}/users/me" || true
expect_status "GET /users/me/password-status" "200" \
  "${AUTH[@]}" "${API}/users/me/password-status" || true

if [[ "$AUTH_MODE" == "bearer" ]]; then
  section "Bearer Defaults"
  expect_status "GET /notes (no X-User-ID)" "200" \
    "${AUTH[@]}" "${API}/notes" || true
  expect_status "GET /workspaces (no X-User-ID)" "200" \
    "${AUTH[@]}" "${API}/workspaces" || true
fi

# ── Workspaces ────────────────────────────────────────────────────────────
section "Workspaces"
expect_status "GET /workspaces" "200" "${AUTH[@]}" "${DATA_H[@]}" "${API}/workspaces" || true

WS="api-test-ws-$$"
expect_status "POST /workspaces (create)" "201" \
  "${AUTH[@]}" "${DATA_H[@]}" -X POST \
  -d "{\"name\":\"${WS}\"}" "${API}/workspaces" || true

expect_status "PATCH /workspaces/{name} (rename)" "200" \
  "${AUTH[@]}" "${DATA_H[@]}" -X PATCH \
  -d "{\"new_name\":\"${WS}-r\"}" "${API}/workspaces/${WS}" || true

expect_status "DELETE /workspaces/{name}" "200" \
  "${AUTH[@]}" "${DATA_H[@]}" -X DELETE "${API}/workspaces/${WS}-r" || true

# ── Folders ───────────────────────────────────────────────────────────────
section "Folders"
expect_status "GET /folders" "200" "${AUTH[@]}" "${DATA_H[@]}" "${API}/folders" || true
expect_status "GET /folders/counts" "200" \
  "${AUTH[@]}" "${DATA_H[@]}" "${API}/folders/counts" || true
expect_status "GET /folders/suggested" "200" \
  "${AUTH[@]}" "${DATA_H[@]}" "${API}/folders/suggested" || true

expect_status "POST /folders (create)" "201" \
  "${AUTH[@]}" "${DATA_H[@]}" -X POST \
  -d '{"name":"API Test Folder"}' "${API}/folders" || true
FOLDER_ID=$(json_field "id" "$LAST_BODY")

if [[ "$FOLDER_ID" =~ ^[0-9]+$ ]]; then
  expect_status "GET /folders/{id}" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" "${API}/folders/${FOLDER_ID}" || true
  expect_status "GET /folders/{id}/path" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" "${API}/folders/${FOLDER_ID}/path" || true
  expect_status "GET /folders/{id}/notes (count)" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" "${API}/folders/${FOLDER_ID}/notes" || true
  expect_status "PATCH /folders/{id} (rename)" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" -X PATCH \
    -d '{"name":"API Test Folder Renamed"}' "${API}/folders/${FOLDER_ID}" || true
  expect_status "PUT /folders/{id}/icon" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" -X PUT \
    -d '{"icon":"fa-folder-open"}' "${API}/folders/${FOLDER_ID}/icon" || true

  # Subfolder for move test
  expect_status "POST /folders (subfolder)" "201" \
    "${AUTH[@]}" "${DATA_H[@]}" -X POST \
    -d "{\"name\":\"API Sub Folder\",\"parent_id\":${FOLDER_ID}}" \
    "${API}/folders" || true
  SUB_ID=$(json_field "id" "$LAST_BODY")
  if [[ "$SUB_ID" =~ ^[0-9]+$ ]]; then
    expect_status "POST /folders/{id}/move (to root)" "200" \
      "${AUTH[@]}" "${DATA_H[@]}" -X POST \
      -d '{"parent_id":null}' "${API}/folders/${SUB_ID}/move" || true
    silent_delete "${API}/folders/${SUB_ID}"
  fi

  # move-files: create a second folder as target to avoid self-move 400
  expect_status "POST /folders (target for move-files)" "201" \
    "${AUTH[@]}" "${DATA_H[@]}" -X POST \
    -d '{"name":"API Target Folder"}' "${API}/folders" || true
  FOLDER2_ID=$(json_field "id" "$LAST_BODY")
  if [[ "$FOLDER2_ID" =~ ^[0-9]+$ ]]; then
    # Create a note in source folder so move-files has something to move
    expect_status "POST /notes (for move-files test)" "201" \
      "${AUTH[@]}" "${DATA_H[@]}" -X POST \
      -d "{\"heading\":\"move-files test note\",\"folder_id\":${FOLDER_ID}}" \
      "${API}/notes" || true
    MF_NOTE_ID=$(json_field "id" "$LAST_BODY")
    expect_status "POST /folders/move-files (src→target)" "200" \
      "${AUTH[@]}" "${DATA_H[@]}" -X POST \
      -d "{\"source_folder_id\":${FOLDER_ID},\"target_folder_id\":${FOLDER2_ID}}" \
      "${API}/folders/move-files" || true
    # Clean up the note and second folder
    [[ "$MF_NOTE_ID" =~ ^[0-9]+$ ]] && silent_delete "${API}/notes/${MF_NOTE_ID}"
    silent_delete "${API}/folders/${FOLDER2_ID}"
  fi

  section "Folder Sharing"
  # Share POST returns 201 (new) or 200 (update existing)
  expect_2xx "POST /folders/{id}/share" \
    "${AUTH[@]}" "${DATA_H[@]}" -X POST \
    -d '{"theme":"light","indexable":0}' \
    "${API}/folders/${FOLDER_ID}/share" || true
  expect_status "GET /folders/{id}/share" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" "${API}/folders/${FOLDER_ID}/share" || true
  expect_status "PATCH /folders/{id}/share" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" -X PATCH \
    -d '{"indexable":1}' "${API}/folders/${FOLDER_ID}/share" || true
  expect_status "DELETE /folders/{id}/share (revoke)" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" -X DELETE \
    "${API}/folders/${FOLDER_ID}/share" || true
else
  echo -e "  ${YELLOW}WARN${RESET}  Could not parse folder ID – skipping folder sub-tests"
  FOLDER_ID=""
fi

# ── Notes ─────────────────────────────────────────────────────────────────
section "Notes"
expect_status "GET /notes" "200" "${AUTH[@]}" "${DATA_H[@]}" "${API}/notes" || true
expect_status "GET /notes/with-attachments" "200" \
  "${AUTH[@]}" "${DATA_H[@]}" "${API}/notes/with-attachments" || true
expect_status "GET /notes/search?q=test" "200" \
  "${AUTH[@]}" "${DATA_H[@]}" "${API}/notes/search?q=test" || true

expect_status "POST /notes (create)" "201" \
  "${AUTH[@]}" "${DATA_H[@]}" -X POST \
  -d '{"heading":"API Test Note","content":"<p>Hello from test script</p>","tags":"api-test","type":"note"}' \
  "${API}/notes" || true
NOTE_ID=$(json_field "id" "$LAST_BODY")

if [[ "$NOTE_ID" =~ ^[0-9]+$ ]]; then
  expect_status "GET /notes/{id}" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" "${API}/notes/${NOTE_ID}" || true
  expect_status "GET /notes/resolve?reference=API+Test+Note" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" \
    "${API}/notes/resolve?reference=API+Test+Note" || true
  expect_status "PATCH /notes/{id} (update)" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" -X PATCH \
    -d '{"heading":"API Test Note Updated","content":"<p>Updated</p>"}' \
    "${API}/notes/${NOTE_ID}" || true
  expect_status "PUT /notes/{id}/tags" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" -X PUT \
    -d '{"tags":"api-test,updated"}' "${API}/notes/${NOTE_ID}/tags" || true
  expect_status "POST /notes/{id}/favorite (toggle)" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" -X POST \
    "${API}/notes/${NOTE_ID}/favorite" || true

  if [[ "$FOLDER_ID" =~ ^[0-9]+$ ]]; then
    expect_status "POST /notes/{id}/folder" "200" \
      "${AUTH[@]}" "${DATA_H[@]}" -X POST \
      -d "{\"folder_id\":${FOLDER_ID}}" "${API}/notes/${NOTE_ID}/folder" || true
    expect_status "POST /notes/{id}/remove-folder" "200" \
      "${AUTH[@]}" "${DATA_H[@]}" -X POST \
      "${API}/notes/${NOTE_ID}/remove-folder" || true
  fi

  expect_status "GET /notes/{id}/backlinks" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" "${API}/notes/${NOTE_ID}/backlinks" || true
  expect_status "POST /notes/{id}/duplicate" "201" \
    "${AUTH[@]}" "${DATA_H[@]}" -X POST "${API}/notes/${NOTE_ID}/duplicate" || true
  DUP_ID=$(json_field "id" "$LAST_BODY")
  [[ "$DUP_ID" =~ ^[0-9]+$ ]] && silent_delete "${API}/notes/${DUP_ID}"

  # convert: type "note" (HTML) → markdown requires {"target":"markdown"}
  expect_status "POST /notes/{id}/convert (HTML→markdown)" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" -X POST \
    -d '{"target":"markdown"}' "${API}/notes/${NOTE_ID}/convert" || true

  # ── Note Sharing ────────────────────────────────────────────────────────
  section "Note Sharing"
  # POST returns 201 (new share) or 200 (updating existing share)
  expect_2xx "POST /notes/{id}/share (create)" \
    "${AUTH[@]}" "${DATA_H[@]}" -X POST \
    -d '{"theme":"light","indexable":false}' \
    "${API}/notes/${NOTE_ID}/share" || true
  expect_status "GET /notes/{id}/share" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" "${API}/notes/${NOTE_ID}/share" || true
  expect_status "PATCH /notes/{id}/share (update)" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" -X PATCH \
    -d '{"theme":"dark"}' "${API}/notes/${NOTE_ID}/share" || true
  expect_status "DELETE /notes/{id}/share (revoke)" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" -X DELETE \
    "${API}/notes/${NOTE_ID}/share" || true

  # ── Attachments ──────────────────────────────────────────────────────────
  section "Attachments"
  expect_status "GET /notes/{id}/attachments (list)" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" "${API}/notes/${NOTE_ID}/attachments" || true

  printf 'API test attachment content' > /tmp/_api_attach.txt
  # Upload returns 201; attachment_id is a hex string
  expect_status "POST /notes/{id}/attachments (upload)" "201" \
    "${AUTH[@]}" "${USER_H[@]}" \
    -X POST -F "file=@/tmp/_api_attach.txt" \
    "${API}/notes/${NOTE_ID}/attachments" || true
  rm -f /tmp/_api_attach.txt
  ATT_ID=$(json_field "attachment_id" "$LAST_BODY")

  if [[ -n "$ATT_ID" && "$ATT_ID" != "null" ]]; then
    expect_status "GET /notes/{id}/attachments/{attId} (download)" "200" \
      "${AUTH[@]}" "${DATA_H[@]}" \
      "${API}/notes/${NOTE_ID}/attachments/${ATT_ID}" || true
    expect_status "DELETE /notes/{id}/attachments/{attId}" "200" \
      "${AUTH[@]}" "${DATA_H[@]}" -X DELETE \
      "${API}/notes/${NOTE_ID}/attachments/${ATT_ID}" || true
  else
    echo -e "  ${YELLOW}WARN${RESET}  Could not parse attachment ID – skipping download/delete"
  fi

  # ── Trash ──────────────────────────────────────────────────────────────
  section "Trash"
  expect_status "GET /trash" "200" "${AUTH[@]}" "${DATA_H[@]}" "${API}/trash" || true
  expect_status "DELETE /notes/{id} (move to trash)" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" -X DELETE "${API}/notes/${NOTE_ID}" || true
  expect_status "POST /notes/{id}/restore (from trash)" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" -X POST "${API}/notes/${NOTE_ID}/restore" || true
  expect_status "DELETE /notes/{id} (to trash again)" "200" \
    "${AUTH[@]}" "${DATA_H[@]}" -X DELETE "${API}/notes/${NOTE_ID}" || true

  if $SKIP_DESTRUCTIVE; then
    skip_test "DELETE /trash/{id} (permanent) — skipped with -s"
    silent_delete "${API}/trash/${NOTE_ID}"
  else
    expect_status "DELETE /trash/{id} (permanent delete)" "200" \
      "${AUTH[@]}" "${DATA_H[@]}" -X DELETE "${API}/trash/${NOTE_ID}" || true
  fi
else
  echo -e "  ${YELLOW}WARN${RESET}  Could not parse note ID – skipping note sub-tests"
  NOTE_ID=""
fi

# ── Shared Notes (no X-User-ID needed) ───────────────────────────────────
section "Shared Notes"
expect_status "GET /shared" "200" "${AUTH[@]}" "${API}/shared" || true
expect_status "GET /shared/with-me" "200" "${AUTH[@]}" "${API}/shared/with-me" || true

# ── Tags ─────────────────────────────────────────────────────────────────
section "Tags"
expect_status "GET /tags" "200" "${AUTH[@]}" "${DATA_H[@]}" "${API}/tags" || true

# ── Settings ─────────────────────────────────────────────────────────────
section "Settings"
expect_status "GET /settings/language" "200" \
  "${AUTH[@]}" "${DATA_H[@]}" "${API}/settings/language" || true
expect_status "PUT /settings/language (set to en)" "200" \
  "${AUTH[@]}" "${DATA_H[@]}" -X PUT \
  -d '{"value":"en"}' "${API}/settings/language" || true

# ── Git Sync ─────────────────────────────────────────────────────────────
section "Git Sync"
expect_status "GET /git-sync/status" "200" \
  "${AUTH[@]}" "${DATA_H[@]}" "${API}/git-sync/status" || true
expect_status "GET /git-sync/progress" "200" \
  "${AUTH[@]}" "${DATA_H[@]}" "${API}/git-sync/progress" || true

# ── Backups ───────────────────────────────────────────────────────────────
section "Backups"
expect_status "GET /backups" "200" "${AUTH[@]}" "${DATA_H[@]}" "${API}/backups" || true

if $SKIP_DESTRUCTIVE; then
  skip_test "POST /backups (create) — skipped with -s"
else
  # POST /backups returns 201
  expect_status "POST /backups (create)" "201" \
    "${AUTH[@]}" "${DATA_H[@]}" -X POST "${API}/backups" || true
  BACKUP_FILE=$(json_field "backup_file" "$LAST_BODY")
  if [[ -n "$BACKUP_FILE" && "$BACKUP_FILE" != "null" ]]; then
    # Use range request to avoid downloading the full ZIP
    expect_status "GET /backups/{filename} (download check)" "200" \
      "${AUTH[@]}" "${DATA_H[@]}" -r 0-0 "${API}/backups/${BACKUP_FILE}" || true
    if expect_status "POST /backups/{filename}/restore" "200" \
      "${AUTH[@]}" "${DATA_H[@]}" -X POST \
      "${API}/backups/${BACKUP_FILE}/restore"; then
      if [[ "$LAST_BODY" =~ ^[[:space:]]*\{ ]]; then
        echo -e "  ${GREEN}PASS${RESET}        Restore response is JSON"
        (( PASS++ )) || true
      else
        echo -e "  ${RED}FAIL${RESET}        Restore response is not JSON"
        (( FAIL++ )) || true
        $VERBOSE && [[ -n "$LAST_BODY" ]] && echo "         $(printf '%s' "$LAST_BODY" | head -c 300)"
      fi
    fi
    expect_status "DELETE /backups/{filename}" "200" \
      "${AUTH[@]}" "${DATA_H[@]}" -X DELETE \
      "${API}/backups/${BACKUP_FILE}" || true
  else
    echo -e "  ${YELLOW}WARN${RESET}  Could not parse backup filename – skipping backup sub-tests"
  fi

  # Upload-restore: upload a local ZIP then restore it in two steps
  if $SKIP_DESTRUCTIVE; then
    skip_test "POST /backups/upload (upload ZIP) — skipped with -s"
    skip_test "POST /backups/{filename}/restore (after upload) — skipped with -s"
  else
    # Create a backup to have a ZIP to upload
    expect_status "POST /backups (for upload test)" "201" \
      "${AUTH[@]}" "${DATA_H[@]}" -X POST "${API}/backups" || true
    UR_BACKUP_FILE=$(json_field "backup_file" "$LAST_BODY")
    if [[ -n "$UR_BACKUP_FILE" && "$UR_BACKUP_FILE" != "null" ]]; then
      # Download the backup so we have a local ZIP to upload
      curl -s "${AUTH[@]}" "${DATA_H[@]}" \
        "${API}/backups/${UR_BACKUP_FILE}" -o /tmp/_ur_backup.zip 2>/dev/null || true
      if [[ -s /tmp/_ur_backup.zip ]]; then
        # Step 1: upload
        expect_status "POST /backups/upload (upload ZIP)" "201" \
          "${AUTH[@]}" "${USER_H[@]}" \
          -X POST -F "file=@/tmp/_ur_backup.zip" \
          "${API}/backups/upload" || true
        UPLOADED_FILE=$(json_field "filename" "$LAST_BODY")
        # Step 2: restore the uploaded file
        if [[ -n "$UPLOADED_FILE" && "$UPLOADED_FILE" != "null" ]]; then
          expect_status "POST /backups/{filename}/restore (after upload)" "200" \
            "${AUTH[@]}" "${DATA_H[@]}" -X POST \
            "${API}/backups/${UPLOADED_FILE}/restore" || true
          silent_delete "${API}/backups/${UPLOADED_FILE}"
        fi
      else
        echo -e "  ${YELLOW}WARN${RESET}  Could not download backup ZIP – skipping upload test"
      fi
      rm -f /tmp/_ur_backup.zip
      silent_delete "${API}/backups/${UR_BACKUP_FILE}"
    else
      echo -e "  ${YELLOW}WARN${RESET}  Could not create backup for upload test"
    fi
  fi
fi

# ── Admin ─────────────────────────────────────────────────────────────────
section "Admin"
if [[ "$AUTH_MODE" == "bearer" && "$IS_ADMIN_AUTH" != "true" ]]; then
  skip_test "Admin endpoints — skipped for non-admin Bearer token"
else
  expect_status "GET /admin/users" "200" "${AUTH[@]}" "${API}/admin/users" || true
  expect_status "GET /admin/users/{id}" "200" \
    "${AUTH[@]}" "${API}/admin/users/${USER_ID}" || true
  expect_status "GET /admin/users/{id}/password-status" "200" \
    "${AUTH[@]}" "${API}/admin/users/${USER_ID}/password-status" || true
  expect_status "GET /admin/stats" "200" "${AUTH[@]}" "${API}/admin/stats" || true
  expect_status "GET /users/lookup/{username}" "200" \
    "${AUTH[@]}" "${API}/users/lookup/${ADMIN_USER}" || true

  TUSER="apitestuser$$"
  expect_status "POST /admin/users (create temp)" "201" \
    "${AUTH[@]}" -H "Content-Type: application/json" \
    -X POST -d "{\"username\":\"${TUSER}\"}" "${API}/admin/users" || true
  TUSER_ID=$(json_field "id" "$LAST_BODY")

  if [[ "$TUSER_ID" =~ ^[0-9]+$ ]]; then
    expect_status "PATCH /admin/users/{id} (update)" "200" \
      "${AUTH[@]}" -H "Content-Type: application/json" \
      -X PATCH -d '{"active":true}' "${API}/admin/users/${TUSER_ID}" || true
    expect_status "GET /admin/users/{id} (get temp user)" "200" \
      "${AUTH[@]}" "${API}/admin/users/${TUSER_ID}" || true
    expect_status "POST /admin/users/{id}/reset-password" "200" \
      "${AUTH[@]}" -H "Content-Type: application/json" \
      -X POST -d '{"password":"Temp@Test1234"}' \
      "${API}/admin/users/${TUSER_ID}/reset-password" || true
    expect_status "DELETE /admin/users/{id}" "200" \
      "${AUTH[@]}" -X DELETE "${API}/admin/users/${TUSER_ID}" || true
  else
    echo -e "  ${YELLOW}WARN${RESET}  Could not parse temp user ID – skipping admin user sub-tests"
  fi
fi

# ── Legacy Export Endpoints ───────────────────────────────────────────────
section "Legacy Export Endpoints"
expect_status "GET /api_export_entries.php (all notes ZIP)" "200" \
  "${AUTH[@]}" "${USER_H[@]}" \
  "${BASE_URL}/api_export_entries.php" || true

# ── Cleanup test folder ──────────────────────────────────────────────────
[[ "$FOLDER_ID" =~ ^[0-9]+$ ]] && silent_delete "${API}/folders/${FOLDER_ID}"

  print_summary
  [[ $FAIL -gt 0 ]] && return 1
  return 0
}

main() {
  local overall_status=0

  setup_basic_auth
  run_test_suite || overall_status=1

  if prompt_for_bearer_token; then
    if setup_bearer_auth "$BEARER_TOKEN"; then
      run_test_suite || overall_status=1
    else
      overall_status=1
    fi
  fi

  return $overall_status
}

main
exit $?
