/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Needs a built dist/; run via vitest.build.config.ts (npm run test:build / test:dist).
    exclude: ["tests/build.test.ts", "node_modules/**"],
  },
});
