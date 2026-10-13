import type { APIRoute } from "astro";
import { buildMetaJson, loadSiteData } from "../lib/data";

/**
 * `dist/build-meta.json`: `{ "driveFileCounts": { "<root>": <visible files>, ... }, "meetingCount": <n> }`
 * for the Drive roots that listed and, when the calendar was read, its meetings; nothing else. The
 * deploy workflow fetches the live copy and refuses to publish a build in which a root lost more than
 * half its files or the calendar more than half its meetings (see scripts/drive-drop.sh and README
 * section 3).
 */
export const GET: APIRoute = async () => {
  const { folders, calendar } = await loadSiteData();
  return new Response(buildMetaJson(folders, calendar), { headers: { "content-type": "application/json; charset=utf-8" } });
};
