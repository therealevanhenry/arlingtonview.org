#!/usr/bin/env bash
# Decide whether the deploy job should run. Called by .github/workflows/deploy.yml.
#
# Inputs (environment):
#   NEW_HASH          digest of the freshly built site (scripts/dist-hash.sh)
#   DEPLOYED_STATUS   HTTP status of <deployed site>/build-hash.txt, "000" when the request failed
#   DEPLOYED_FILE     path of the downloaded response body (may be empty or absent)
#   DEGRADED          exactly "true" (scripts/build-health.sh found a Google failure) or "false"
#   ALLOW_DEGRADED    "true" only for a workflow_dispatch run that ticked allow_degraded
#   GITHUB_OUTPUT     where step outputs are appended (stdout when unset, for local runs)
#
# Output: deploy=true|false and reason=<text>. A degraded build is always red (exit 1, deploy=false) unless
# ALLOW_DEGRADED is "true" (deploy if changed, skip if unchanged, warning either way) or nothing is
# deployed yet (HTTP 404: deploy with a warning). Exit 2, with no output, when DEGRADED is not true/false.
set -euo pipefail

: "${NEW_HASH:?NEW_HASH is required}"
: "${DEPLOYED_STATUS:?DEPLOYED_STATUS is required}"
degraded=${DEGRADED:-}
case "$degraded" in
  true | false) ;;
  *)
    echo "deploy-decision: DEGRADED must be exactly \"true\" or \"false\" (got \"${degraded}\")" >&2
    exit 2
    ;;
esac
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
  if [ "$degraded" = "false" ]; then
    echo "Unchanged since the last deploy (${NEW_HASH}); skipping."
    emit false unchanged
  elif [ "$allow" = "true" ]; then
    echo "::warning::Google was unreachable or misconfigured during this build (allowed); the site is unchanged, skipping."
    emit false unchanged-degraded-allowed
  else
    echo "::error::Google was unreachable or misconfigured during the build. The live site is identical, so nothing would change, but this stays red until Google works. Fix it, or run manually with allow_degraded."
    emit false degraded-blocked
    exit 1
  fi
elif [ "$degraded" = "false" ]; then
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
