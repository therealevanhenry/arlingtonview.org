#!/usr/bin/env bash
# Print one sha256 digest that identifies the content of a built site.
#
# Usage: scripts/dist-hash.sh [dist-dir]     (default: <repo>/dist)
#
# Hashes every regular file under the directory except build-hash.txt at its top level, as
# "<sha256>  <relative path>" lines sorted bytewise (LC_ALL=C), then prints the sha256 of that list.
# Paths are relative to the directory, so the digest does not depend on where the checkout lives,
# on file mtimes, or on the locale.
set -euo pipefail
export LC_ALL=C

root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
dir=${1:-"$root/dist"}

if [ ! -d "$dir" ]; then
  echo "dist-hash: directory not found: $dir (run the build first)" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  shacmd=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  shacmd=(shasum -a 256)
else
  echo "dist-hash: neither sha256sum nor shasum is installed" >&2
  exit 1
fi

cd -- "$dir"
if [ -z "$(find . -type f ! -path ./build-hash.txt -print -quit)" ]; then
  echo "dist-hash: no files under $dir" >&2
  exit 1
fi
list=$(find . -type f ! -path ./build-hash.txt -print0 | sort -z | xargs -0 "${shacmd[@]}")
printf '%s\n' "$list" | "${shacmd[@]}" | cut -d ' ' -f 1
