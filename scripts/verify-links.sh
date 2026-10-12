#!/bin/sh
# Report the HTTP status of every external URL in src/content/resources.yaml and dist/**/*.html.
#
# Usage: scripts/verify-links.sh   (run `npm run build` first to include the built HTML)
#
# - Browser-like user agent, follows redirects, 20 s timeout, one request per unique URL.
# - www.arlingtonva.us answers 403 to every non-browser client; that is reported as a warning
#   ("bot-blocked, cannot verify"), never a failure. Verify those by hand in a browser.
# - Google Drive/Docs/Calendar URLs are skipped (login redirects make the status meaningless).
# - Exit status is non-zero only for real failures: 404, 410, other 4xx, 5xx, DNS, TLS, timeout.
set -eu

root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

{
  grep -ohE 'https?://[^[:space:]"<>)]+' "$root/src/content/resources.yaml" 2>/dev/null || true
  if [ -d "$root/dist" ]; then
    find "$root/dist" -name '*.html' -exec grep -ohE 'href="https?://[^"]+"' {} + 2>/dev/null \
      | sed -e 's/^href="//' -e 's/"$//' -e 's/&amp;/\&/g' || true
  fi
} | sort -u > "$tmp"

fail=0
warn=0
total=0
while IFS= read -r url; do
  [ -n "$url" ] || continue
  host=$(printf '%s\n' "$url" | sed -E 's#^https?://([^/:?]+).*#\1#')
  case "$host" in
    drive.google.com | docs.google.com | calendar.google.com)
      printf 'SKIP  %s (Google login-gated)\n' "$url"
      continue
      ;;
  esac
  total=$((total + 1))
  code=$(curl -sS -o /dev/null -L --max-time 20 -A "$ua" -w '%{http_code}' "$url" 2>/dev/null) || code=000
  case "$code" in
    2??)
      printf 'OK    %s %s\n' "$code" "$url"
      ;;
    403)
      case "$host" in
        arlingtonva.us | *.arlingtonva.us)
          printf 'WARN  403 (bot-blocked, cannot verify) %s\n' "$url"
          warn=$((warn + 1))
          ;;
        *)
          printf 'FAIL  403 %s\n' "$url"
          fail=$((fail + 1))
          ;;
      esac
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

printf '\n%s checked, %s failed, %s county URLs need a manual look\n' "$total" "$fail" "$warn"
[ "$fail" -eq 0 ]
