// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Pages build to <route>/index.html and every internal link ends in a slash, so
  // GitHub Pages never answers a nav click with a redirect.
  trailingSlash: 'always',
});
