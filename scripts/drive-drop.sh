#!/usr/bin/env bash
# Compare the Drive file counts of a new build with those of the live site, and report a root that
# has lost most of its files. Called by .github/workflows/deploy.yml. Pure: reads two files, no network.
#
# Usage: scripts/drive-drop.sh <live build-meta.json> <new build-meta.json> <HTTP status of the live fetch>
#
# The status is the three-digit code curl reported for <live site>/build-meta.json ("000" when the
# request failed altogether). Both files have the shape the build writes to dist/build-meta.json:
#   { "driveFileCounts": { "<root>": <visible files>, ... } }     (only roots that listed are present)
#
# Why: Drive answers a listing with HTTP 200 and FEWER files when link sharing is removed from a
# subfolder, so the loader cannot tell. A root that had at least 4 files on the live site and is missing
# from the new build, or has fewer than half as many, is treated as that kind of accident.
#
# The live fetch has three outcomes, and only one of them means "nothing to compare with":
#   200 and the expected JSON   the baseline: compare.
#   404                         no baseline (nothing published yet, or a site published before this
#                               file existed): nothing to compare. The saved body is ignored.
#   anything else               the baseline could not be read (a 5xx, a timeout, "000", or a 200
#                               whose body is not the expected JSON). That is NOT "no baseline": a
#                               passing network fault must not be the moment a real drop slips through.
#
# Exit 0: no drop, or no baseline (404).
# Exit 1: a drop. One line per root on stdout, naming the root and both counts.
# Exit 2: bad usage, or the NEW file is missing or malformed (the build always writes it).
# Exit 3: the baseline could not be read. One line on stdout saying so. The workflow treats it like a
#         degraded build: red, unless allow_degraded is ticked.
# Needs node (the project's own requirement); no other dependency.
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: drive-drop.sh <live build-meta.json> <new build-meta.json> <HTTP status of the live fetch>" >&2
  exit 2
fi

exec node - "$1" "$2" "$3" <<'JS'
const { readFileSync } = require("node:fs");
const [livePath, newPath, status] = process.argv.slice(2);
const MIN_FILES = 4;

if (!/^[0-9]{3}$/.test(status)) {
  console.error(`drive-drop: the HTTP status must be three digits, e.g. 200, 404, or 000 (got ${JSON.stringify(status)})`);
  process.exit(2);
}

/** The counts in a build-meta.json, or undefined when the file is absent or not that shape. */
function counts(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
  const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
  if (!isObject(parsed) || !isObject(parsed.driveFileCounts)) return undefined;
  const entries = Object.entries(parsed.driveFileCounts);
  // Root names are printed into the workflow log, so they must look like the build's own keys.
  if (!entries.every(([root, n]) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(root) && Number.isSafeInteger(n) && n >= 0)) return undefined;
  return new Map(entries);
}

const fresh = counts(newPath);
if (fresh === undefined) {
  console.error(`drive-drop: ${newPath} is missing or is not a build-meta.json ({"driveFileCounts":{"<root>":<count>}})`);
  process.exit(2);
}
if (status === "404") {
  console.log("drive-drop: no baseline (HTTP 404: the live site has no build-meta.json); nothing to compare");
  process.exit(0);
}
if (status !== "200") {
  console.log(`drive-drop: could not read the live site's file counts (HTTP ${status} for build-meta.json)`);
  process.exit(3);
}
const live = counts(livePath);
if (live === undefined) {
  console.log("drive-drop: could not read the live site's file counts (HTTP 200, but build-meta.json is not the expected JSON)");
  process.exit(3);
}

const drops = [];
for (const [root, before] of live) {
  if (before < MIN_FILES) continue;
  const now = fresh.get(root);
  if (now === undefined) {
    drops.push(`drive-drop: "${root}" listed ${before} files on the live site and is not listed in this build`);
  } else if (now * 2 < before) {
    drops.push(`drive-drop: "${root}" listed ${before} files on the live site and ${now} in this build`);
  }
}
if (drops.length > 0) {
  console.log(drops.join("\n"));
  process.exit(1);
}
console.log("drive-drop: no root lost more than half its files");
JS
