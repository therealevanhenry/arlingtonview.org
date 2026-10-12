#!/usr/bin/env bash
# Decide whether the deploy job should run. Called by .github/workflows/deploy.yml.
#
# Inputs (environment):
#   NEW_HASH          digest of the freshly built site (scripts/dist-hash.sh)
#   DEPLOYED_STATUS   HTTP status of <deployed site>/build-hash.txt, "000" when the request failed
#   DEPLOYED_FILE     path of the downloaded response body (may be empty or absent)
#   DEGRADED          exactly "true" (scripts/build-health.sh: Google was asked and something failed) or "false"
#   DRIVE_DROP        exactly "true" (scripts/drive-drop.sh: a Drive folder lists far fewer files than
#                     the live site shows) or "false"
#   ALLOW_DEGRADED    "true" only for a workflow_dispatch run that ticked allow_degraded
#   GITHUB_OUTPUT     where step outputs are appended (stdout when unset, for local runs)
#
# Output: deploy=true|false and reason=<text>.
#
#   build                          allow_degraded   same as live          differs from live (any status)
#   healthy                        (ignored)        skip, green           deploy
#   DEGRADED or DRIVE_DROP         false            red, no deploy        red, no deploy
#   DEGRADED or DRIVE_DROP         true             skip, warning         deploy, warning
#
# There is no other exception. In particular a 404 for build-hash.txt does NOT let a bad build
# through as a "first deploy": during DNS cutover the configured domain answers 404 for that path
# from the old site, which is exactly when publishing a broken build would hurt most.
# Exit 1 with reason=degraded-blocked for a red row. Exit 2, with no output, when DEGRADED or
# DRIVE_DROP is not exactly true or false (a missing value must never read as healthy).
set -euo pipefail

: "${NEW_HASH:?NEW_HASH is required}"
: "${DEPLOYED_STATUS:?DEPLOYED_STATUS is required}"
degraded=${DEGRADED:-}
drop=${DRIVE_DROP:-}
for pair in "DEGRADED=$degraded" "DRIVE_DROP=$drop"; do
  case "${pair#*=}" in
    true | false) ;;
    *)
      echo "deploy-decision: ${pair%%=*} must be exactly \"true\" or \"false\" (got \"${pair#*=}\")" >&2
      exit 2
      ;;
  esac
done
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

bad=false
problem=""
if [ "$degraded" = "true" ]; then
  bad=true
  problem="Google was unreachable or misconfigured during the build."
fi
if [ "$drop" = "true" ]; then
  bad=true
  problem="${problem:+$problem }A Drive folder lists far fewer files than the live site shows (was sharing removed from a folder or a subfolder?)."
fi

same=false
if [ -n "$deployed" ] && [ "$deployed" = "$NEW_HASH" ]; then same=true; fi

if [ "$bad" = "false" ]; then
  if [ "$same" = "true" ]; then
    echo "Unchanged since the last deploy (${NEW_HASH}); skipping."
    emit false unchanged
  else
    echo "Site differs from the deployed one (HTTP ${DEPLOYED_STATUS} for build-hash.txt); deploying."
    emit true changed
  fi
elif [ "$allow" = "true" ]; then
  if [ "$same" = "true" ]; then
    echo "::warning::${problem} allow_degraded was set; the site is unchanged, skipping."
    emit false unchanged-degraded-allowed
  else
    echo "::warning::${problem} Deploying anyway because allow_degraded was set."
    emit true degraded-allowed
  fi
elif [ "$same" = "true" ]; then
  echo "::error::${problem} The live site is identical, so nothing would change, but this stays red until it is fixed. Fix it, or run the workflow manually with allow_degraded."
  emit false degraded-blocked
  exit 1
else
  echo "::error::${problem} Not replacing the live site. Fix it and re-run, or run the workflow manually with allow_degraded."
  emit false degraded-blocked
  exit 1
fi
