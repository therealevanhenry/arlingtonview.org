#!/usr/bin/env bash
# Classify lychee's exit code. Prints clean, broken, or crashed.
#
# Usage: scripts/lychee-outcome.sh <exit-code>
# lychee's documented exit codes (README, "Exit codes", lychee v0.24.2 as installed by lychee-action@v2):
#   0 success; 1 missing inputs or unexpected runtime failure or configuration error;
#   2 link check failures; 3 errors in the config file.
# So 0 is clean, 2 is broken links, and anything else (including a non-number) is a crash or
# configuration error, which must not be reported as broken links.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: lychee-outcome.sh <exit-code>" >&2
  exit 2
fi
case "$1" in
  0) echo clean ;;
  2) echo broken ;;
  *) echo crashed ;;
esac
