#!/bin/sh
# Report the HTTP status of every external URL in src/content/resources.yaml and dist/**/*.html.
#
# Usage: scripts/verify-links.sh   (run `npm run build` first to include the built HTML)
#
# - Browser-like user agent, follows redirects, 20 s timeout, one request per unique URL.
# - Hosts in is_bot_blocked() below answer 403 to every non-browser client. A 403 from them is
#   reported as a warning ("bot-blocked, cannot verify"), never a failure; verify those by hand in
#   a browser. Any other status from those hosts (404, 410, 5xx, DNS, timeout) still fails, and a
#   403 from any other host fails.
# - Google Drive/Docs/Calendar URLs are skipped (login redirects make the status meaningless).
# - URLs on the site's own origin (siteUrl in src/content/settings.yaml) are skipped and counted:
#   every page has an absolute canonical URL, and before DNS cutover that origin is the old site.
#   Internal links are verified by tests/build.test.ts.
# - Exits non-zero if src/content/resources.yaml or dist/ is missing.
# - Exit status is non-zero only for real failures: 404, 410, other 4xx, 5xx, DNS, TLS, timeout.
set -eu

root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

# Bot-blocked hosts: keep this the single list. Each host and its subdomains.
# Mirror any change in the `exclude` list in lychee.toml.
is_bot_blocked() {
  case "$1" in
    arlingtonva.us | *.arlingtonva.us) return 0 ;;
    researchgate.net | *.researchgate.net) return 0 ;;
    *) return 1 ;;
  esac
}

if [ ! -f "$root/src/content/resources.yaml" ]; then
  echo "verify-links: src/content/resources.yaml not found" >&2
  exit 2
fi
if [ ! -d "$root/dist" ]; then
  echo "verify-links: dist/ not found; run npm run build first" >&2
  exit 2
fi

# Origin of siteUrl (scheme://host[:port]), unquoted or in single or double quotes.
site_origin=$(sed -n -E "s/^siteUrl:[[:space:]]*[\"']?(https?:\/\/[^\/\"'[:space:]]+).*/\1/p" "$root/src/content/settings.yaml" | head -n 1)
if [ -z "$site_origin" ]; then
  echo "verify-links: could not read siteUrl (an http or https URL) from src/content/settings.yaml" >&2
  exit 2
fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

{
  # Trailing quotes and sentence punctuation are not part of a URL written in prose or YAML.
  { grep -ohE "https?://[^[:space:]\"'<>)]+" "$root/src/content/resources.yaml" || true; } \
    | sed -E "s/[.,;:!?'\"]+\$//"
  find "$root/dist" -name '*.html' -exec grep -ohE 'href="https?://[^"]+"' {} + 2>/dev/null \
    | sed -e 's/^href="//' -e 's/"$//' -e 's/&amp;/\&/g' || true
} | sort -u > "$tmp"

fail=0
warn=0
total=0
own=0
while IFS= read -r url; do
  [ -n "$url" ] || continue
  host=$(printf '%s\n' "$url" | sed -E 's#^https?://([^/:?]+).*#\1#')
  case "$host" in
    drive.google.com | docs.google.com | calendar.google.com)
      printf 'SKIP  %s (Google login-gated)\n' "$url"
      continue
      ;;
  esac
  case "$url" in
    "$site_origin" | "$site_origin"/* | "$site_origin"\?* | "$site_origin"\#*)
      printf 'SKIP  %s (own origin)\n' "$url"
      own=$((own + 1))
      continue
      ;;
  esac
  total=$((total + 1))
  code=$(curl -sS --globoff -o /dev/null -L --max-time 20 -A "$ua" -w '%{http_code}' "$url" 2>/dev/null) || code=000
  case "$code" in
    2??)
      printf 'OK    %s %s\n' "$code" "$url"
      ;;
    403)
      if is_bot_blocked "$host"; then
        printf 'WARN  403 (bot-blocked, cannot verify) %s\n' "$url"
        warn=$((warn + 1))
      else
        printf 'FAIL  403 %s\n' "$url"
        fail=$((fail + 1))
      fi
      ;;
    000)
      printf 'FAIL  000 (DNS, TLS, connection, or timeout) %s\n' "$url"
      fail=$((fail + 1))
      ;;
    *)
      printf 'FAIL  %s %s\n' "$code" "$url"
      fail=$((fail + 1))
      ;;
  esac
done < "$tmp"

printf '\n%s checked, %s failed, %s bot-blocked URLs need a manual look, %s own-origin URLs skipped\n' "$total" "$fail" "$warn" "$own"
[ "$fail" -eq 0 ]
