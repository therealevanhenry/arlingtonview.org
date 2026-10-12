import { defineConfig } from "vitest/config";

// Build-output assertions only. Run through `npm run test:build` (builds first) or
// `npm run test:dist` (asserts against an existing dist/). See tests/build.test.ts.
export default defineConfig({
  test: {
    include: ["tests/build.test.ts"],
  },
});
