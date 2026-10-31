#!/usr/bin/env bash
# =============================================================================
# On-demand check of Poznote: builds an image from the working tree (uncommitted
# changes included), starts it on empty in-memory data, runs the PHP tests, the
# functional and visual suites, then reads the PHP log.
#
#   tests/e2e/run.sh                   everything, in Chromium
#   tests/e2e/run.sh --all-browsers    everything, in Chromium and Firefox
#   tests/e2e/run.sh --no-visual       functional checks only
#   tests/e2e/run.sh --update-visual   accept the current look as the reference
#   tests/e2e/run.sh --grep editor     only the tests whose name matches
#   tests/e2e/run.sh --serve           start the instance and keep it running
#
# Never touches the dev or production instances or their data. See README.md.
# =============================================================================
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PORT="${POZNOTE_E2E_PORT:-8199}"
NAME="poznote-e2e-$PORT"
IMAGE="poznote-e2e:local"
PHP_IMAGE="$(grep -m1 '^FROM php:' "$ROOT/Dockerfile" | sed -E 's/^FROM (php:[0-9]+\.[0-9]+).*/\1-cli/')"
RESULTS="$HERE/.results"

PROJECTS=(--project=chromium)
VISUAL=1
UPDATE=()
GREP=()
SERVE=0
while [ $# -gt 0 ]; do
    case "$1" in
        --all-browsers) PROJECTS=(--project=chromium --project=firefox) ;;
        --no-visual) VISUAL=0 ;;
        --update-visual) UPDATE=(--update-snapshots) ;;
        --grep) GREP=(--grep "$2"); shift ;;
        --serve) SERVE=1 ;;
        -h|--help) sed -n 3,14p "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
    esac
    shift
done

FAILED=()
step() { printf '\n\033[1m=== %s\033[0m\n' "$1"; }
stop_instance() { docker rm -f "$NAME" >/dev/null 2>&1; }

step "Image from the working tree"
if ! docker build -q --target default --build-arg APP_VERSION="$(cat "$ROOT/src/version.txt")" -t "$IMAGE" "$ROOT" >/dev/null; then
    echo "The image does not build." >&2
    exit 1
fi
echo "built ($(cat "$ROOT/src/version.txt"))"

if [ "$SERVE" = 0 ] && [ ${#GREP[@]} = 0 ]; then
    step "PHP syntax and unit tests ($PHP_IMAGE)"
    # On a copy, the unit tests write under src/data
    SCRATCH="$(mktemp -d)"
    tar -C "$ROOT" --exclude=src/data --exclude=node_modules -cf - src tests | tar -xf - -C "$SCRATCH"
    docker run --rm --network none -v "$SCRATCH:/app" -w /app "$PHP_IMAGE" sh -c \
        'find src tests -name "*.php" -print0 | xargs -0 -n1 -P4 php -l >/dev/null && php tests/run.php' 2>&1 | tail -12
    [ "${PIPESTATUS[0]}" = 0 ] || FAILED+=("PHP syntax or unit tests")
fi

step "Throwaway instance on port $PORT"
stop_instance
# tmpfs: nothing to clean up, and the stray src/data of a dev checkout stays hidden
docker run -d --name "$NAME" \
    -e SQLITE_DATABASE=/var/www/html/data/database/poznote.db \
    -p "127.0.0.1:$PORT:80" \
    --tmpfs /var/www/html/data \
    -v "$HERE/support/php-e2e.ini:/usr/local/etc/php/conf.d/zz-e2e.ini:ro" \
    "$IMAGE" >/dev/null || exit 1
trap '[ "$SERVE" = 1 ] || stop_instance' EXIT
for _ in $(seq 1 40); do
    [ "$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$PORT/login.php")" = 200 ] && break
    sleep 0.5
done
docker cp "$HERE/support/mock-server.php" "$NAME:/tmp/mock-server.php" >/dev/null
docker cp "$HERE/support/instance-setup.php" "$NAME:/tmp/instance-setup.php" >/dev/null
docker exec "$NAME" php /tmp/instance-setup.php || exit 1
docker exec "$NAME" chown -R www-data:www-data /var/www/html/data
docker exec -d "$NAME" php -S 127.0.0.1:9912 /tmp/mock-server.php
echo "http://127.0.0.1:$PORT"

if [ "$SERVE" = 1 ]; then
    echo "Left running. Stop it with: docker rm -f $NAME"
    exit 0
fi

step "Functional and visual suites"
cd "$HERE" || exit 1
[ -d node_modules/@playwright/test ] || npm install --no-audit --no-fund --silent || exit 1
npx playwright install chromium firefox >/dev/null 2>&1
SPEC_FILTER=()
[ "$VISUAL" = 1 ] || SPEC_FILTER=(--grep-invert '@visual')
POZNOTE_E2E_URL="http://127.0.0.1:$PORT" POZNOTE_E2E_CONTAINER="$NAME" \
    npx playwright test "${PROJECTS[@]}" ${UPDATE[@]+"${UPDATE[@]}"} ${GREP[@]+"${GREP[@]}"} ${SPEC_FILTER[@]+"${SPEC_FILTER[@]}"}
[ $? = 0 ] || FAILED+=("functional or visual suite")

step "PHP log of the instance"
LOG="$RESULTS/php-errors.txt"
mkdir -p "$RESULTS"
docker logs "$NAME" 2>&1 | grep -E 'PHP (Deprecated|Warning|Notice|Fatal|Parse)|(Deprecated|Warning|Notice|Fatal error|Parse error):' \
    | sed -E 's/^.*(Deprecated|Warning|Notice|Fatal error|Parse error):/\1:/; s/" *$//' | sort | uniq -c | sort -rn > "$LOG"
if [ -s "$LOG" ]; then
    cut -c1-180 "$LOG"
    FAILED+=("PHP errors in the log")
else
    echo "nothing"
fi

step "Result"
if [ ${#FAILED[@]} -gt 0 ]; then
    printf '\033[31mFAILED:\033[0m %s\n' "$(IFS=', '; echo "${FAILED[*]}")"
    echo "Report with screenshots and visual diffs: cd tests/e2e && npx playwright show-report .results/report"
    exit 1
fi
printf '\033[32mAll checks passed.\033[0m\n'
