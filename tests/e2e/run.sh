#!/usr/bin/env bash
# =============================================================================
# On-demand check of Poznote: builds an image from the working tree (uncommitted
# changes included), starts it on empty in-memory data, runs the PHP tests, the
# functional and visual suites, then reads the PHP log and the feature coverage.
#
#   tests/e2e/run.sh                   everything, in Chromium
#   tests/e2e/run.sh --jobs 3          everything, spread over 3 instances at once
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
IMAGE="poznote-e2e:local"
PHP_IMAGE="$(grep -m1 '^FROM php:' "$ROOT/Dockerfile" | sed -E 's/^FROM (php:[0-9]+\.[0-9]+).*/\1-cli/')"
RESULTS="$HERE/.results"

PROJECTS=(--project=chromium)
VISUAL=1
UPDATE=()
GREP=()
SERVE=0
JOBS="${POZNOTE_E2E_JOBS:-1}"
while [ $# -gt 0 ]; do
    case "$1" in
        --all-browsers) PROJECTS=(--project=chromium --project=firefox) ;;
        --no-visual) VISUAL=0 ;;
        --update-visual) UPDATE=(--update-snapshots) ;;
        --grep) GREP=(--grep "$2"); shift ;;
        --jobs) JOBS="$2"; shift ;;
        --serve) SERVE=1 ;;
        -h|--help) sed -n 3,15p "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
    esac
    shift
done
case "$JOBS" in ''|*[!0-9]*|0) echo "--jobs takes a number from 1" >&2; exit 2 ;; esac

FAILED=()
step() { printf '\n\033[1m=== %s\033[0m\n' "$1"; }
# Instance n is on port PORT+n, its MCP server on PORT+n+1000
port_of() { echo $((PORT + $1)); }
name_of() { echo "poznote-e2e-$(port_of "$1")"; }
stop_instances() {
    for ((n = 0; n < JOBS; n++)); do docker rm -f "$(name_of "$n")" "$(name_of "$n")-mcp" >/dev/null 2>&1; done
}

step "Image from the working tree"
if ! docker build -q --target default --build-arg APP_VERSION="$(cat "$ROOT/src/version.txt")" -t "$IMAGE" "$ROOT" >/dev/null; then
    echo "The image does not build." >&2
    exit 1
fi
echo "built ($(cat "$ROOT/src/version.txt"))"
MCP_BUILT=0
docker build -q -t "$IMAGE-mcp" "$ROOT/mcp-server" >/dev/null && MCP_BUILT=1
[ "$MCP_BUILT" = 1 ] || { echo "The MCP image does not build." >&2; FAILED+=("MCP image"); }

if [ "$SERVE" = 0 ] && [ ${#GREP[@]} = 0 ]; then
    step "PHP syntax and unit tests ($PHP_IMAGE)"
    # On a copy, the unit tests write under src/data
    SCRATCH="$(mktemp -d)"
    tar -C "$ROOT" --exclude=src/data --exclude=node_modules -cf - src tests | tar -xf - -C "$SCRATCH"
    docker run --rm --network none -v "$SCRATCH:/app" -w /app "$PHP_IMAGE" sh -c \
        'find src tests -name "*.php" -print0 | xargs -0 -n1 -P4 php -l >/dev/null && php tests/run.php' 2>&1 | tail -12
    [ "${PIPESTATUS[0]}" = 0 ] || FAILED+=("PHP syntax or unit tests")
fi

# One throwaway instance, with the mock services and the MCP server next to it
start_instance() {
    local port name
    port="$(port_of "$1")"
    name="$(name_of "$1")"
    docker rm -f "$name" "$name-mcp" >/dev/null 2>&1
    # tmpfs: nothing to clean up, and the stray src/data of a dev checkout stays hidden
    docker run -d --name "$name" \
        -e SQLITE_DATABASE=/var/www/html/data/database/poznote.db \
        -e POZNOTE_OIDC_CLIENT_ID=e2e-client \
        -p "127.0.0.1:$port:80" \
        -p "127.0.0.1:$((port + 1000)):8045" \
        --tmpfs /var/www/html/data \
        -v "$HERE/support/php-e2e.ini:/usr/local/etc/php/conf.d/zz-e2e.ini:ro" \
        -v "$HERE/support/hit-log.php:/usr/local/etc/php/e2e-hit-log.php:ro" \
        "$IMAGE" >/dev/null || return 1
    for _ in $(seq 1 40); do
        [ "$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$port/login.php")" = 200 ] && break
        sleep 0.5
    done
    docker cp "$HERE/support/mock-server.php" "$name:/tmp/mock-server.php" >/dev/null
    docker cp "$HERE/support/instance-setup.php" "$name:/tmp/instance-setup.php" >/dev/null
    docker exec "$name" php /tmp/instance-setup.php >/dev/null || return 1
    docker exec "$name" chown -R www-data:www-data /var/www/html/data
    docker exec -d "$name" php -S 127.0.0.1:9912 /tmp/mock-server.php
    echo "http://127.0.0.1:$port"

    [ "$MCP_BUILT" = 1 ] || return 0
    # Shares the network of the instance, whose port it is published on. The service
    # token is handed over by hand, because the two do not share a data directory here
    curl -s -o /dev/null -H 'Authorization: Bearer none' "http://127.0.0.1:$port/api/v1/system/version"
    docker run -d --name "$name-mcp" --network "container:$name" \
        -e POZNOTE_API_URL=http://127.0.0.1:80/api/v1 -e POZNOTE_USER_ID=1 \
        -e POZNOTE_SERVICE_TOKEN_FILE=/tmp/mcp-token \
        -e "E2E_TOKEN=$(docker exec "$name" cat /var/www/html/data/.mcp_token)" \
        --entrypoint sh "$IMAGE-mcp" -c 'printf %s "$E2E_TOKEN" > /tmp/mcp-token; exec poznote-mcp serve --host=0.0.0.0 --port=8045' >/dev/null
    for _ in $(seq 1 40); do
        [ "$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$((port + 1000))/mcp")" != 000 ] && break
        sleep 0.5
    done
    echo "http://127.0.0.1:$((port + 1000))/mcp (MCP)"
}

step "Throwaway instance$([ "$JOBS" -gt 1 ] && echo "s") on port $(port_of 0)$([ "$JOBS" -gt 1 ] && echo " to $(port_of $((JOBS - 1)))")"
trap '[ "$SERVE" = 1 ] || stop_instances' EXIT
for ((n = 0; n < JOBS; n++)); do
    start_instance "$n" || { echo "Instance $n does not start." >&2; exit 1; }
done

if [ "$SERVE" = 1 ]; then
    echo "Left running. Stop with: docker rm -f $(for ((n = 0; n < JOBS; n++)); do printf '%s %s-mcp ' "$(name_of "$n")" "$(name_of "$n")"; done)"
    exit 0
fi

step "Functional and visual suites"
cd "$HERE" || exit 1
[ -d node_modules/@playwright/test ] || npm install --no-audit --no-fund --silent || exit 1
npx playwright install chromium firefox >/dev/null 2>&1
mkdir -p "$RESULTS"
SPEC_FILTER=()
[ "$VISUAL" = 1 ] || SPEC_FILTER=(--grep-invert '@visual')
export PLAYWRIGHT_LIST_OMIT_TAGS=1
STARTED=$SECONDS
if [ "$JOBS" = 1 ]; then
    POZNOTE_E2E_URL="http://127.0.0.1:$(port_of 0)" POZNOTE_E2E_CONTAINER="$(name_of 0)" \
        npx playwright test "${PROJECTS[@]}" ${UPDATE[@]+"${UPDATE[@]}"} ${GREP[@]+"${GREP[@]}"} ${SPEC_FILTER[@]+"${SPEC_FILTER[@]}"}
    [ $? = 0 ] || FAILED+=("functional or visual suite")
else
    # Each instance gets a share of the spec files, balanced by their size; every
    # job writes a blob, merged at the end into one report and one results.json
    rm -rf "$RESULTS/blobs" "$RESULTS"/job-*.log
    mapfile -t BUCKETS < <(node -e '
        const fs = require("node:fs");
        const jobs = Number(process.argv[1]);
        const files = fs.readdirSync("specs").filter((f) => f.endsWith(".spec.js"))
            .map((f) => ({ f: `specs/${f}`, w: fs.readFileSync(`specs/${f}`, "utf8").split("\n").length }))
            .sort((a, b) => b.w - a.w);
        const buckets = Array.from({ length: jobs }, () => ({ w: 0, files: [] }));
        for (const file of files) { const lightest = buckets.reduce((a, b) => (b.w < a.w ? b : a)); lightest.w += file.w; lightest.files.push(file.f); }
        for (const bucket of buckets) console.log(bucket.files.join(" "));
    ' "$JOBS")
    PIDS=()
    for ((n = 0; n < JOBS; n++)); do
        [ -n "${BUCKETS[$n]:-}" ] || continue
        echo "job $n on $(name_of "$n"): ${BUCKETS[$n]//specs\//}"
        # shellcheck disable=SC2086
        POZNOTE_E2E_URL="http://127.0.0.1:$(port_of "$n")" POZNOTE_E2E_CONTAINER="$(name_of "$n")" \
            PLAYWRIGHT_BLOB_OUTPUT_FILE="$RESULTS/blobs/job-$n.zip" \
            npx playwright test ${BUCKETS[$n]} "${PROJECTS[@]}" ${UPDATE[@]+"${UPDATE[@]}"} ${GREP[@]+"${GREP[@]}"} ${SPEC_FILTER[@]+"${SPEC_FILTER[@]}"} \
            --reporter=list,blob --output="$RESULTS/artifacts/job-$n" > "$RESULTS/job-$n.log" 2>&1 &
        PIDS+=($!)
    done
    for pid in "${PIDS[@]}"; do wait "$pid" || FAILED+=("functional or visual suite"); done
    for ((n = 0; n < JOBS; n++)); do
        [ -f "$RESULTS/job-$n.log" ] && echo "job $n: $(sed 's/\x1b\[[0-9;]*m//g' "$RESULTS/job-$n.log" | grep -E '^\s+[0-9]+ (passed|failed|flaky|skipped|did not run)' | tr -s ' ' | tr '\n' ' ')"
    done
    rm -rf "$RESULTS/report"
    PLAYWRIGHT_HTML_OUTPUT_DIR="$RESULTS/report" PLAYWRIGHT_HTML_OPEN=never PLAYWRIGHT_JSON_OUTPUT_NAME="$RESULTS/results.json" \
        npx playwright merge-reports --reporter=html,json "$RESULTS/blobs" >/dev/null
    # The failures, as the list reporter of a single run would end with them
    node -e '
        const results = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
        const out = { unexpected: [], flaky: [] };
        const visit = (suite, trail) => {
            for (const spec of suite.specs || []) for (const test of spec.tests) {
                if (out[test.status]) out[test.status].push(`${spec.file}:${spec.line} › ${[...trail, spec.title].join(" › ")}`);
            }
            for (const child of suite.suites || []) visit(child, child.title.endsWith(".js") ? trail : [...trail, child.title]);
        };
        for (const suite of results.suites) visit(suite, []);
        for (const [kind, list] of Object.entries(out)) if (list.length) console.log(`\n${list.length} ${kind === "unexpected" ? "failed" : "flaky"}:\n  ${list.join("\n  ")}`);
    ' "$RESULTS/results.json"
fi
echo "suites took $(( (SECONDS - STARTED) / 60 )) min"

step "PHP log of the instance$([ "$JOBS" -gt 1 ] && echo "s")"
LOG="$RESULTS/php-errors.txt"
for ((n = 0; n < JOBS; n++)); do docker logs "$(name_of "$n")" 2>&1; done \
    | grep -E 'PHP (Deprecated|Warning|Notice|Fatal|Parse)|(Deprecated|Warning|Notice|Fatal error|Parse error):' \
    | sed -E 's/^.*(Deprecated|Warning|Notice|Fatal error|Parse error):/\1:/; s/" *$//' | sort | uniq -c | sort -rn > "$LOG"
if [ -s "$LOG" ]; then
    cut -c1-180 "$LOG"
    FAILED+=("PHP errors in the log")
else
    echo "nothing"
fi

step "Feature coverage"
: > "$RESULTS/hits.log"
for ((n = 0; n < JOBS; n++)); do docker exec "$(name_of "$n")" cat /tmp/poznote-e2e-hits.log >> "$RESULTS/hits.log" 2>/dev/null; done
if [ ${#GREP[@]} = 0 ]; then
    node lib/coverage.js --hits "$RESULTS/hits.log" --results "$RESULTS/results.json" || FAILED+=("feature coverage")
else
    echo "skipped, --grep runs part of the suite"
fi

step "Result"
if [ ${#FAILED[@]} -gt 0 ]; then
    printf '\033[31mFAILED:\033[0m %s\n' "$(printf '%s\n' "${FAILED[@]}" | sort -u | paste -sd, - | sed 's/,/, /g')"
    echo "Report with screenshots and visual diffs: cd tests/e2e && npx playwright show-report .results/report"
    exit 1
fi
printf '\033[32mAll checks passed.\033[0m\n'
