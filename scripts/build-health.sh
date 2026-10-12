#!/usr/bin/env bash
# Report the health of a build from its captured log. Called by .github/workflows/deploy.yml.
#
# Usage: scripts/build-health.sh <build-log>
#
# src/lib/data.ts prints exactly one line per build, after the calendar and Drive loaders finish:
#   [site-data] health: ok                       everything loaded
#   [site-data] health: ok (offline)             OFFLINE=1: nothing was fetched, on purpose
#   [site-data] health: unconfigured (<what>)    no Drive key, or a blank ID; nothing failed
#   [site-data] health: degraded (<reasons>)     Google was asked and something did not load
# This script reads that line and nothing else. The [drive] and [calendar] warnings beside it are for
# people. Astro's progress output can leave the line in the middle of another, so it is found anywhere
# on a line, but nothing may follow it.
#
# Exit 0: ok or unconfigured. Prints "ok", "ok (offline)", or "unconfigured: <what>".
# Exit 1: degraded. Prints "degraded: <reasons>".
# Exit 2: bad usage, or the line is absent, appears more than once, or is not one of the four forms.
#         The workflow treats this as a failed run: a build that says nothing is not a healthy build.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: build-health.sh <build-log>" >&2
  exit 2
fi
log=$1
if [ ! -f "$log" ]; then
  echo "build-health: no such file: $log" >&2
  exit 2
fi

marker='[site-data] health: '
# -a: a stray NUL byte must not make grep treat the log as binary and report nothing.
count=$({ grep -aoF -- "$marker" "$log" || true; } | wc -l)
count=$((count))
if [ "$count" -ne 1 ]; then
  echo "build-health: expected exactly one \"${marker}\" line in the build log, found ${count}" >&2
  exit 2
fi

line=$(grep -aF -- "$marker" "$log" | tr -d '\000\r')
status=${line#*"$marker"}

if [ "$status" = "ok" ] || [ "$status" = "ok (offline)" ]; then
  printf '%s\n' "$status"
elif [[ "$status" =~ ^unconfigured\ \(([^()]+)\)$ ]]; then
  printf 'unconfigured: %s\n' "${BASH_REMATCH[1]}"
elif [[ "$status" =~ ^degraded\ \(([^()]+)\)$ ]]; then
  printf 'degraded: %s\n' "${BASH_REMATCH[1]}"
  exit 1
else
  echo "build-health: unrecognized health line: ${marker}${status}" >&2
  exit 2
fi
