#!/usr/bin/env bash
# Runs all migrations and pgTAP tests against a throwaway local Postgres 16 cluster.
# Use when Docker is not available. CI and normal development use `supabase test db`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')}"
LOG="$DATA/server.log"

if [ "$(id -u)" = "0" ]; then RUN=(runuser -u postgres --); chown postgres "$DATA"; else RUN=(); fi

cleanup() { "${RUN[@]}" "$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

"${RUN[@]}" "$PG_BIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"${RUN[@]}" "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA" -l "$LOG" -w start >/dev/null

PSQL=(psql -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$ROOT/supabase/scripts/local-stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -c "create extension if not exists pgtap with schema extensions;"

FAILED=0
shopt -s nullglob
for t in "$ROOT"/supabase/tests/*.test.sql; do
  OUT="$("${PSQL[@]}" -t -A -c "set search_path = public, extensions;" -f "$t" 2>&1)" || FAILED=1
  echo "$OUT" | grep -E '^(ok|not ok)' | sed "s|^|$(basename "$t"): |" || true
  if echo "$OUT" | grep -qE '^not ok|ERROR|Looks like'; then
    FAILED=1
    echo "$OUT" | grep -E 'not ok|#|ERROR' | head -40 || true
  fi
done

if [ "$FAILED" -ne 0 ]; then echo "DB TESTS FAILED"; exit 1; fi
echo "DB TESTS PASSED"
