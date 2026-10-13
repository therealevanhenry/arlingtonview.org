#!/usr/bin/env bash
# Compare the counts of a new build with those of the live site, and report a Drive folder that has
# lost most of its files or a calendar that has lost most of its meetings. Called by
# .github/workflows/deploy.yml. Pure: reads three files, no network.
#
# Usage: scripts/drive-drop.sh <live build-meta.json> <new build-meta.json> \
#                              <HTTP status of the live build-meta.json fetch> \
#                              <HTTP status of the live build-hash.txt fetch> <live build-hash.txt>
#
# A status is the three-digit code curl reported ("000" when the request failed altogether). The two
# build-meta.json files have the shape the build writes to dist/build-meta.json:
#   { "driveFileCounts": { "<root>": <visible files>, ... }, "meetingCount": <meetings> }
# Only roots that listed are present, and meetingCount is present only when the calendar was read.
#
# Why: Drive answers a listing with HTTP 200 and FEWER files when link sharing is removed from a
# subfolder, and a calendar that has been emptied still answers with a valid, empty feed, so neither
# loader can tell. A root that had at least 4 files on the live site and is missing from the new build,
# or has fewer than half as many, is treated as that kind of accident; so is a calendar that had at
# least 4 meetings and now has fewer than half as many, or was not read at all.
#
# The live fetch has three outcomes, and only one of them means "nothing to compare with":
#   200 and the expected JSON   the baseline: compare.
#   404, and no build-hash.txt  no baseline (nothing is published at that address yet): nothing to
#                               compare. The saved body is ignored.
#   anything else               the baseline could not be read: a 5xx, a timeout, "000", a 200 whose
#                               body is not the expected JSON, or a 404 while build-hash.txt IS
#                               published there (HTTP 200 with a hash), since the two files are always
#                               published together. That is NOT "no baseline": a passing fault must
#                               not be the moment a real drop slips through.
#
# Exit 0: no drop, or no baseline.
# Exit 1: a drop. One line per root (and one for the calendar) on stdout, naming both counts.
# Exit 2: bad usage, or the NEW file is missing or malformed (the build always writes it).
# Exit 3: the baseline could not be read. One line on stdout saying so. The workflow treats it like a
#         degraded build: red, unless allow_degraded is ticked.
# Needs node (the project's own requirement); no other dependency.
set -euo pipefail

if [ "$#" -ne 5 ]; then
  echo "usage: drive-drop.sh <live build-meta.json> <new build-meta.json> <meta HTTP status> <hash HTTP status> <live build-hash.txt>" >&2
  exit 2
fi

exec node - "$1" "$2" "$3" "$4" "$5" <<'JS'
const { readFileSync } = require("node:fs");
const [livePath, newPath, metaStatus, hashStatus, hashPath] = process.argv.slice(2);
const MIN = 4;
const UNREADABLE = "drive-drop: could not read the live site's file and meeting counts";

for (const [name, status] of [["build-meta.json", metaStatus], ["build-hash.txt", hashStatus]]) {
  if (!/^[0-9]{3}$/.test(status)) {
    console.error(`drive-drop: the HTTP status for ${name} must be three digits, e.g. 200, 404, or 000 (got ${JSON.stringify(status)})`);
    process.exit(2);
  }
}

const isCount = (n) => Number.isSafeInteger(n) && n >= 0;

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
  if (!entries.every(([root, n]) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(root) && isCount(n))) return undefined;
  if ("meetingCount" in parsed && !isCount(parsed.meetingCount)) return undefined;
  return { files: new Map(entries), meetings: parsed.meetingCount };
}

/** build-hash.txt is published at the live address: HTTP 200 and a 64-hex digest (as scripts/deploy-decision.sh reads it). */
function hashIsPublished() {
  if (hashStatus !== "200") return false;
  try {
    return /^[0-9a-f]{64}$/.test(readFileSync(hashPath, "utf8").slice(0, 200).replace(/\s/g, ""));
  } catch {
    return false;
  }
}

const fresh = counts(newPath);
if (fresh === undefined) {
  console.error(`drive-drop: ${newPath} is missing or is not a build-meta.json ({"driveFileCounts":{"<root>":<count>},"meetingCount":<count>})`);
  process.exit(2);
}
if (metaStatus === "404") {
  if (hashIsPublished()) {
    console.log(`${UNREADABLE} (build-hash.txt is published, but build-meta.json answered HTTP 404; the two are always published together)`);
    process.exit(3);
  }
  console.log("drive-drop: no baseline (HTTP 404: the live site has no build-meta.json, and no build-hash.txt beside it); nothing to compare");
  process.exit(0);
}
if (metaStatus !== "200") {
  console.log(`${UNREADABLE} (HTTP ${metaStatus} for build-meta.json)`);
  process.exit(3);
}
const live = counts(livePath);
if (live === undefined) {
  console.log(`${UNREADABLE} (HTTP 200, but build-meta.json is not the expected JSON)`);
  process.exit(3);
}

const drops = [];
for (const [root, before] of live.files) {
  if (before < MIN) continue;
  const now = fresh.files.get(root);
  if (now === undefined) {
    drops.push(`drive-drop: "${root}" listed ${before} files on the live site and is not listed in this build`);
  } else if (now * 2 < before) {
    drops.push(`drive-drop: "${root}" listed ${before} files on the live site and ${now} in this build`);
  }
}
if (live.meetings !== undefined && live.meetings >= MIN) {
  if (fresh.meetings === undefined) {
    drops.push(`drive-drop: the calendar listed ${live.meetings} meetings on the live site and was not read in this build`);
  } else if (fresh.meetings * 2 < live.meetings) {
    drops.push(`drive-drop: the calendar listed ${live.meetings} meetings on the live site and ${fresh.meetings} in this build`);
  }
}
if (drops.length > 0) {
  console.log(drops.join("\n"));
  process.exit(1);
}
console.log("drive-drop: no Drive folder lost more than half its files, and the calendar did not lose more than half its meetings");
JS
