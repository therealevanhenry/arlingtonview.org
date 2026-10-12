#!/usr/bin/env bash
# Is the commit this run was started for still the tip of main? Called by .github/workflows/deploy.yml.
#
# Usage: scripts/tip-check.sh        (run inside a checkout whose `origin` is the repository)
# Inputs (environment): GITHUB_SHA (the commit of this run), GITHUB_OUTPUT (stdout when unset).
#
# Output: current=true when origin's refs/heads/main is GITHUB_SHA, otherwise current=false with a
# notice annotation. Exit 0 in both cases: a run for an older commit (a manual re-run of an old run, or
# a run overtaken by a newer push) is skipped, not failed, because a run for the newer commit exists
# or will. Without this a re-run of last month's run would publish last month's code.
# Exit 2 when the tip cannot be read: not knowing is not "current".
set -euo pipefail

: "${GITHUB_SHA:?GITHUB_SHA is required}"
out=${GITHUB_OUTPUT:-/dev/stdout}

listing=$(git ls-remote origin refs/heads/main) || {
  echo "::error::tip-check: could not read refs/heads/main from origin."
  exit 2
}
tip=$(printf '%s\n' "$listing" | head -n 1 | cut -f 1)
if ! printf '%s' "$tip" | grep -qE '^[0-9a-f]{40}([0-9a-f]{24})?$'; then
  echo "::error::tip-check: origin has no refs/heads/main (got \"${tip}\")."
  exit 2
fi

if [ "$tip" = "$GITHUB_SHA" ]; then
  echo "This run's commit (${GITHUB_SHA}) is the tip of main."
  echo "current=true" >> "$out"
else
  echo "::notice::Skipping: this run is for ${GITHUB_SHA}, but main is now at ${tip}. Nothing is built or deployed from an older commit; the run for the newer commit does that."
  echo "current=false" >> "$out"
fi
