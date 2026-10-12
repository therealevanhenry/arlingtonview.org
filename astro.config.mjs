// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Canonical origin. The deploy workflow overrides it with the origin GitHub Pages reports
  // (and adds --base for a github.io project page); there is no base here.
  site: 'https://arlingtonview.org',
  // Pages build to <route>/index.html and every internal link ends in a slash, so
  // GitHub Pages never answers a nav click with a redirect.
  trailingSlash: 'always',
});
