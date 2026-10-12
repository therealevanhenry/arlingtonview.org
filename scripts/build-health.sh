#!/usr/bin/env bash
# Decide whether a captured build log shows Google being unreachable or misconfigured.
#
# Usage: scripts/build-health.sh <build-log>
# Exit 0: healthy. Exit 1: degraded (the offending lines are printed to stdout). Exit 2: bad usage.
#
# Counts as degraded:
#   [drive] folder "<id>" not listed: <reason>   for any reason except the three below
#       (HTTP <status>, timeout, network error, invalid response, too many pages, unexpected error)
#   [calendar] not loaded: ...                   the calendar fetch failed (see src/lib/data.ts)
# Does not count: "no API key" (secret not configured yet; the site deploys with folder links),
# "no folder ID", and "offline" (OFFLINE=1).
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

drive='\[drive\] folder ".*" not listed: '
benign="${drive}(no API key|no folder ID|offline);"
calendar='\[calendar\] not loaded: '

bad=$({ grep -aE "${drive}|${calendar}" "$log" || true; } | { grep -avE "$benign" || true; })
if [ -n "$bad" ]; then
  printf '%s\n' "$bad"
  exit 1
fi
