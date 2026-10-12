#!/usr/bin/env bash
# Compare the Drive file counts of a new build with those of the live site, and report a root that
# has lost most of its files. Called by .github/workflows/deploy.yml. Pure: reads two files, no network.
#
# Usage: scripts/drive-drop.sh <live build-meta.json> <new build-meta.json>
#
# Both files have the shape the build writes to dist/build-meta.json:
#   { "driveFileCounts": { "<root>": <visible files>, ... } }     (only roots that listed are present)
#
# Why: Drive answers a listing with HTTP 200 and FEWER files when link sharing is removed from a
# subfolder, so the loader cannot tell. A root that had at least 4 files on the live site and is missing
# from the new build, or has fewer than half as many, is treated as that kind of accident.
#
# Exit 0: no drop. Also when there is no baseline: the live file is absent, empty, or not this shape
#         (nothing deployed yet, a site from before this file existed, an error page).
# Exit 1: a drop. One line per root on stdout, naming the root and both counts.
# Exit 2: bad usage, or the NEW file is missing or malformed (the build always writes it).
# Needs node (the project's own requirement); no other dependency.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: drive-drop.sh <live build-meta.json> <new build-meta.json>" >&2
  exit 2
fi

exec node - "$1" "$2" <<'JS'
const { readFileSync } = require("node:fs");
const [livePath, newPath] = process.argv.slice(2);
const MIN_FILES = 4;

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
const live = counts(livePath);
if (live === undefined) {
  console.log("drive-drop: no baseline (the live site has no usable build-meta.json); nothing to compare");
  process.exit(0);
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
