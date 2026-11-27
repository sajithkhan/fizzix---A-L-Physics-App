#!/usr/bin/env bash
# Copies packages/shared/src into supabase/functions/_shared/fizzix-shared.
#
# Edge Functions can only load files inside supabase/functions (that is all the local edge
# runtime mounts and all `supabase functions deploy` bundles). The copy is generated: never
# edit it by hand. CI runs this script and fails if the copy differs from the source.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/packages/shared/src"
DEST="$ROOT/supabase/functions/_shared/fizzix-shared"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/." "$DEST/"
cat > "$DEST/README.md" <<'MD'
# Generated copy of `packages/shared/src`

Do not edit. Run `pnpm sync:shared` after changing `packages/shared`. CI fails when this copy
is out of date. Edge Functions import it as `@fizzix/shared` (see `../../deno.json`).
MD
