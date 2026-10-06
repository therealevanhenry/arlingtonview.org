/**
 * Internal URL helpers that honor Astro's `base`.
 *
 * The site is previewed under https://therealevanhenry.github.io/arlingtonview.org/
 * before DNS cutover, so every internal href and asset URL must go through
 * `withBase`. Astro reports the base with or without a trailing slash depending
 * on configuration; both forms are accepted here.
 */

function normalizeBase(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  return trimmed === "" ? "" : trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Prefix the site base to a root-relative path.
 * `withBase("/meetings")` is `/meetings` under base `/` and
 * `/arlingtonview.org/meetings` under base `/arlingtonview.org/` or `/arlingtonview.org`.
 * Root-relative internal paths only; do not pass absolute URLs.
 */
export function withBase(path: string, base: string = import.meta.env.BASE_URL): string {
  const rooted = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeBase(base)}${rooted}`;
}

/**
 * Remove the site base and any trailing slash from a pathname, so that
 * `/arlingtonview.org/about/history/` and `/about/history` both give `/about/history`.
 * The home page is `/`.
 */
export function stripBase(pathname: string, base: string = import.meta.env.BASE_URL): string {
  const prefix = normalizeBase(base);
  const underBase = prefix !== "" && (pathname === prefix || pathname.startsWith(`${prefix}/`));
  const rest = (underBase ? pathname.slice(prefix.length) : pathname).replace(/\/+$/, "");
  return rest === "" ? "/" : rest;
}

/**
 * True when `pathname` is the section `route` or a page beneath it
 * (`/about/history` is within `/about`). Used for `aria-current` in the nav.
 */
export function isCurrentSection(
  pathname: string,
  route: string,
  base: string = import.meta.env.BASE_URL,
): boolean {
  const current = stripBase(pathname, base);
  return current === route || current.startsWith(`${route}/`);
}
