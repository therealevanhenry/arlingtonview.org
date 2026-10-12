#!/usr/bin/env bash
# Build the site twice offline and fail unless both builds have the same scripts/dist-hash.sh digest.
#
# Usage: scripts/check-reproducible.sh
# Both builds write to dist/ (Astro cannot write a build across filesystems, so a temp --outDir is not
# an option) and dist/ is left as the second OFFLINE build; nothing is restored. Run a normal build after.
set -euo pipefail

root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd -- "$root"

log=$(mktemp)
trap 'rm -f -- "$log"' EXIT

digests=()
for n in 1 2; do
  OFFLINE=1 npx astro build > "$log" 2>&1 || {
    cat -- "$log" >&2
    echo "check-reproducible: build $n failed" >&2
    exit 1
  }
  digests+=("$(scripts/dist-hash.sh)")
done

if [ "${digests[0]}" != "${digests[1]}" ]; then
  echo "check-reproducible: builds differ: ${digests[0]} vs ${digests[1]}" >&2
  exit 1
fi
echo "reproducible: ${digests[0]}"
