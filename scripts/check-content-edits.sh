#!/usr/bin/env bash
# Guard: a valid edit to an owner-editable content file must never fail the tests that gate a deploy,
# and an invalid edit must fail with a message that names the file and the field.
#
# Usage: scripts/check-content-edits.sh        (npm run test:content-edits)
#
# Owner-editable content: src/content/settings.yaml, board.yaml, resources.yaml and pages/*.md. Tests
# enforce RULES (schemas, https URLs, ...), never CONTENT (a name, a sentence, a count). This script
# keeps it that way: it applies one VALID edit at a time to a content file in place, runs `npm test`,
# and restores the file; then applies all valid edits together and runs `OFFLINE=1 npm run test:build`;
# then applies each INVALID edit and requires `npm test` to fail with the file name and the field in
# the output. The edits are the table in the embedded Python below; add a case when a new kind of
# content edit becomes possible.
#
# Refuses to run on a dirty working tree. Content files are restored from git on any exit (trap),
# including an interrupt. Needs python3 and git.
set -uo pipefail

root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd -- "$root"

if [ -n "$(git status --porcelain)" ]; then
  echo "check-content-edits: the working tree is not clean; commit or stash first (this script edits and restores src/content in place)." >&2
  exit 2
fi

work=$(mktemp -d)
restore() { git checkout -q HEAD -- src/content 2>/dev/null; git clean -fdq -- src/content 2>/dev/null; }
cleanup() { restore; rm -rf -- "$work"; }
trap cleanup EXIT
trap 'exit 130' INT TERM

cat > "$work/edits.py" <<'PY'
import re, sys, pathlib

C = pathlib.Path("src/content")

def sub1(s, pattern, repl, flags=re.M):
    new, n = re.subn(pattern, repl, s, count=1, flags=flags)
    if n != 1:
        raise SystemExit(f"edit not applicable: no match for {pattern!r}; update scripts/check-content-edits.sh")
    return new

def first_body_paragraph(s):
    return sub1(s, r"\A(---\n.*?\n---\n\n)([^#\n][^\n]*)", lambda m: m.group(1) + m.group(2) + " An added sentence.", re.S)

def first_heading(s):
    return sub1(s, r"^## .*$", "## A renamed heading")

def md(name):
    return (f"pages/{name}.md", {
        f"{name}.md: edit a sentence": first_body_paragraph,
        f"{name}.md: edit a heading": first_heading,
    })

def fill_vacant(s):
    if "names: []" in s:
        return sub1(s, r"names: \[\]", "names: [B. Neighbor]")
    return s.rstrip("\n") + "\n  - { block: 98, names: [B. Neighbor] }\n"

OFFICER = r"^  - \{ role: [^}\n]*\}$"

def add_officer(s):
    return sub1(s, r"^blockCaptains:", "  - { role: Neighborhood liaison, name: A. Resident, kind: appointed }\nblockCaptains:")

def remove_officer(s):
    # the third officer line
    lines = s.split("\n"); seen = 0
    for i, l in enumerate(lines):
        if re.match(OFFICER, l):
            seen += 1
            if seen == 3:
                del lines[i]; return "\n".join(lines)
    raise SystemExit("edit not applicable: fewer than three officers")

def _vacant(s):
    lines = s.split("\n"); seen = 0
    for i, l in enumerate(lines):
        if re.match(OFFICER, l):
            seen += 1
            if seen == 2:
                lines[i] = re.sub(r"(name: )[^,}]+(,)", r"\g<1>Vacant\g<2>", l, count=1); return "\n".join(lines)
    raise SystemExit("edit not applicable: fewer than two officers")

VALID = {
    "board.yaml: change an officer's name": ("board.yaml", lambda s: sub1(s, r"(^  - \{ role: [^}\n]*?name: )[^,}]+(,)", r"\g<1>A. Resident\g<2>")),
    "board.yaml: mark an office Vacant": ("board.yaml", _vacant),
    "board.yaml: fill a vacant block": ("board.yaml", fill_vacant),
    "board.yaml: empty a filled block": ("board.yaml", lambda s: sub1(s, r"(\{ block: \d+, names: )\[[^\]\n]+\]", r"\g<1>[]")),
    "board.yaml: add a term": ("board.yaml", lambda s: sub1(s, r"^officers:", 'term: { start: "2026-09", end: "2027-08" }\nofficers:')),
    "board.yaml: add an officer": ("board.yaml", add_officer),
    "board.yaml: remove an officer": ("board.yaml", remove_officer),
    "settings.yaml: change contactEmail": ("settings.yaml", lambda s: sub1(s, r"^contactEmail: .*$", "contactEmail: board@example.org")),
    "settings.yaml: set joinFormUrl": ("settings.yaml", lambda s: sub1(s, r"^joinFormUrl: .*$", 'joinFormUrl: "https://forms.example.org/join"')),
    "settings.yaml: change meetingRule": ("settings.yaml", lambda s: sub1(s, r"^meetingRule: .*$", 'meetingRule: "Meetings are held on the second Monday of the month, unless noted."')),
    "settings.yaml: change virtualLinkNote": ("settings.yaml", lambda s: sub1(s, r"^virtualLinkNote: .*$", 'virtualLinkNote: "Ask us for the virtual meeting link."')),
    "settings.yaml: change bylawsCurrentFileId": ("settings.yaml", lambda s: sub1(s, r'^(  bylawsCurrentFileId: ).*$', r'\g<1>"NEWFILEID123"')),
    "settings.yaml: blank calendarId": ("settings.yaml", lambda s: sub1(s, r"^calendarId: .*$", 'calendarId: ""')),
    "resources.yaml: add a link": ("resources.yaml", lambda s: s.rstrip("\n") + "\n      - label: A new link\n        url: https://example.org/new\n"),
    "resources.yaml: remove a link": ("resources.yaml", lambda s: sub1(s, r"^      - label:.*\n(?:        .*\n)*", "")),
    "resources.yaml: relabel a link": ("resources.yaml", lambda s: sub1(s, r"^(      - label: ).*$", r"\g<1>A relabeled link")),
    "resources.yaml: re-note a link": ("resources.yaml", lambda s: sub1(s, r"^(        note: ).*$", r"\g<1>555-0100")),
    "resources.yaml: add a group": ("resources.yaml", lambda s: s.rstrip("\n") + "\n  - title: A new group\n    links:\n      - label: Sample\n        url: https://example.org/\n"),
    "resources.yaml: remove a group": ("resources.yaml", lambda s: sub1(s, r"^  - title:.*\n(?: {4,}.*\n)*", "")),
}

for page in ("about", "history", "join"):
    path, edits = md(page)
    for name, fn in edits.items():
        VALID[name] = (path, fn)

# name -> (file, edit, field that the failure message must name)
INVALID = {
    "settings.yaml: unknown key": ("settings.yaml", lambda s: s.rstrip("\n") + "\ncalandarId: x\n", "calandarId"),
    "board.yaml: unknown key": ("board.yaml", lambda s: s.rstrip("\n") + "\nofficer: []\n", "officer"),
    "resources.yaml: unknown key": ("resources.yaml", lambda s: s.rstrip("\n") + "\ngroup: []\n", "group"),
    "board.yaml: kind: president": ("board.yaml", lambda s: sub1(s, r"^(  - \{ .*kind: )elected", r"\g<1>president"), "kind"),
    "resources.yaml: http:// URL": ("resources.yaml", lambda s: sub1(s, r"url: https://", "url: http://"), "url"),
    "settings.yaml: http:// siteUrl": ("settings.yaml", lambda s: sub1(s, r"^siteUrl: https://", "siteUrl: http://"), "siteUrl"),
    "settings.yaml: contactEmail not an address": ("settings.yaml", lambda s: sub1(s, r"^contactEmail: .*$", "contactEmail: not-an-address"), "contactEmail"),
    "board.yaml: malformed term month": ("board.yaml", lambda s: sub1(s, r"^officers:", 'term: { start: "2026-13", end: "2027-08" }\nofficers:'), "term"),
}

def apply(name, table):
    entry = table[name]
    path = C / entry[0]
    path.write_text(entry[1](path.read_text()))

cmd = sys.argv[1]
if cmd == "valid-names":
    print("\n".join(VALID))
elif cmd == "invalid-names":
    print("\n".join(INVALID))
elif cmd == "apply-valid":
    apply(sys.argv[2], VALID)
elif cmd == "apply-all-valid":
    for n in VALID: apply(n, VALID)
elif cmd == "apply-invalid":
    apply(sys.argv[2], INVALID)
elif cmd == "invalid-file":
    print("src/content/" + INVALID[sys.argv[2]][0])
elif cmd == "invalid-field":
    print(INVALID[sys.argv[2]][2])
PY

failures=()
log="$work/out.log"
edit() { python3 "$work/edits.py" "$@"; }

mapfile -t valid < <(edit valid-names)
mapfile -t invalid < <(edit invalid-names)

echo "== single valid edits: npm test must pass (${#valid[@]} cases)"
for name in "${valid[@]}"; do
  restore
  if ! edit apply-valid "$name"; then failures+=("$name (edit could not be applied)"); continue; fi
  if npm test > "$log" 2>&1; then
    echo "ok    $name"
  else
    echo "FAIL  $name"; tail -n 40 "$log" | sed 's/^/      /'
    failures+=("valid edit failed npm test: $name")
  fi
done
restore

echo "== all valid edits together: OFFLINE=1 npm run test:build must pass"
if edit apply-all-valid && OFFLINE=1 npm run test:build > "$log" 2>&1; then
  echo "ok    all valid edits together"
else
  echo "FAIL  all valid edits together"; tail -n 60 "$log" | sed 's/^/      /'
  failures+=("valid edits together failed test:build")
fi
restore

echo "== invalid edits: npm test must fail and name the file and the field (${#invalid[@]} cases)"
for name in "${invalid[@]}"; do
  restore
  file=$(edit invalid-file "$name"); field=$(edit invalid-field "$name")
  if ! edit apply-invalid "$name"; then failures+=("$name (edit could not be applied)"); continue; fi
  if npm test > "$log" 2>&1; then
    echo "FAIL  $name: npm test passed"
    failures+=("invalid edit did not fail npm test: $name")
  elif grep -qF -- "$file" "$log" && grep -qF -- "$field" "$log"; then
    echo "ok    $name (names $file and $field)"
  else
    echo "FAIL  $name: output does not name $file and $field"; grep -E "src/content" "$log" | head -5 | sed 's/^/      /'
    failures+=("invalid edit failure does not name $file and $field: $name")
  fi
done
restore

if [ "${#failures[@]}" -gt 0 ]; then
  echo
  echo "check-content-edits: ${#failures[@]} problem(s):" >&2
  printf '  %s\n' "${failures[@]}" >&2
  exit 1
fi
echo "check-content-edits: all edits behaved."
