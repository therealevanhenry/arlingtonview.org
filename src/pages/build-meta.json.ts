import type { APIRoute } from "astro";
import { buildMetaJson, loadSiteData } from "../lib/data";

/**
 * `dist/build-meta.json`: `{ "driveFileCounts": { "<root>": <visible files>, ... } }` for the Drive roots
 * that listed, and nothing else. The deploy workflow fetches the live copy and refuses to publish a
 * build in which a root lost more than half its files (see scripts/drive-drop.sh and README section 3).
 */
export const GET: APIRoute = async () => {
  const { folders } = await loadSiteData();
  return new Response(buildMetaJson(folders), { headers: { "content-type": "application/json; charset=utf-8" } });
};
