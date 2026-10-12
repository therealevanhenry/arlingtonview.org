#!/usr/bin/env bash
# Decide whether the deploy job should run. Called by .github/workflows/deploy.yml.
#
# Inputs (environment):
#   NEW_HASH          digest of the freshly built site (scripts/dist-hash.sh)
#   DEPLOYED_STATUS   HTTP status of <deployed site>/build-hash.txt, "000" when the request failed
#   DEPLOYED_FILE     path of the downloaded response body (may be empty or absent)
#   DEGRADED          "true" when scripts/build-health.sh found a Google failure
#   ALLOW_DEGRADED    "true" only for a workflow_dispatch run that ticked allow_degraded
#   GITHUB_OUTPUT     where step outputs are appended (stdout when unset, for local runs)
#
# Output: deploy=true|false and reason=<text>. Exit 1 (run fails, nothing deploys) only when the build is
# degraded, would replace a live site that differs, and degraded deploys were not allowed.
set -euo pipefail

: "${NEW_HASH:?NEW_HASH is required}"
: "${DEPLOYED_STATUS:?DEPLOYED_STATUS is required}"
degraded=${DEGRADED:-false}
allow=${ALLOW_DEGRADED:-false}
out=${GITHUB_OUTPUT:-/dev/stdout}

deployed=""
if [ "$DEPLOYED_STATUS" = "200" ] && [ -n "${DEPLOYED_FILE:-}" ] && [ -f "$DEPLOYED_FILE" ]; then
  candidate=$(head -c 200 "$DEPLOYED_FILE" | tr -d '[:space:]')
  if printf '%s' "$candidate" | grep -qE '^[0-9a-f]{64}$'; then deployed=$candidate; fi
fi

emit() {
  { printf 'deploy=%s\n' "$1"; printf 'reason=%s\n' "$2"; } >> "$out"
}

if [ -n "$deployed" ] && [ "$deployed" = "$NEW_HASH" ]; then
  [ "$degraded" = "true" ] && echo "::warning::Google was unreachable or misconfigured during this build, but the site is unchanged."
  echo "Unchanged since the last deploy (${NEW_HASH}); skipping."
  emit false unchanged
elif [ "$degraded" != "true" ]; then
  echo "Site differs from the deployed one (HTTP ${DEPLOYED_STATUS} for build-hash.txt); deploying."
  emit true changed
elif [ "$allow" = "true" ]; then
  echo "::warning::Deploying a degraded build because allow_degraded was set."
  emit true degraded-allowed
elif [ "$DEPLOYED_STATUS" = "404" ]; then
  echo "::warning::Deploying a degraded build because no site is deployed yet (build-hash.txt returned 404)."
  emit true degraded-first-deploy
else
  echo "::error::Google was unreachable or misconfigured during the build; not replacing the live site. Re-run, or run the workflow manually with allow_degraded."
  emit false degraded-blocked
  exit 1
fi
