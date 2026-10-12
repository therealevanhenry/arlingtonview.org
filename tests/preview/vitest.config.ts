import { getViteConfig } from "astro/config";

// Only the fixture preview generator; the default `npm test` run does not match *.preview.ts.
// Run from the repo root through `npm run preview:fixtures`.
export default getViteConfig({
  test: { include: ["tests/preview/*.preview.ts"], root: process.cwd() },
});
