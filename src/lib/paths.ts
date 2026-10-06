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
 * `/about`, `/about/`, and `about` all become `/about/`; the home path stays `/`.
 * A path whose last segment looks like a file (`/404.html`) gets no trailing slash.
 */
function withTrailingSlash(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (trimmed === "") return "/";
  const lastSegment = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  return lastSegment.includes(".") ? `/${trimmed}` : `/${trimmed}/`;
}

/**
 * Prefix the site base to a root-relative path.
 * `withBase("/meetings/")` is `/meetings/` under base `/` and
 * `/arlingtonview.org/meetings/` under base `/arlingtonview.org/` or `/arlingtonview.org`.
 *
 * The path is otherwise passed through untouched: this never adds or removes a trailing
 * slash, so fragments (`/documents/#bylaws`) and files (`/favicon.svg`) are safe. The site
 * builds with `trailingSlash: "always"`, so callers write page paths with the slash.
 * Root-relative internal paths only; do not pass absolute URLs.
 */
export function withBase(path: string, base: string = import.meta.env.BASE_URL): string {
  const rooted = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeBase(base)}${rooted}`;
}

/**
 * Remove the site base from a pathname and return the trailing-slash form the site links
 * to: `/arlingtonview.org/about/history`, `/about/history/`, and `/about/history` all give
 * `/about/history/`. The home page is `/`.
 */
export function stripBase(pathname: string, base: string = import.meta.env.BASE_URL): string {
  const prefix = normalizeBase(base);
  const underBase = prefix !== "" && (pathname === prefix || pathname.startsWith(`${prefix}/`));
  return withTrailingSlash(underBase ? pathname.slice(prefix.length) : pathname);
}

/**
 * True when `pathname` is the section `route` or a page beneath it (`/about/history/` is
 * within `/about/`). Trailing slashes on either argument do not matter. The home route `/`
 * matches the home page only. Used for `aria-current` in the nav.
 */
export function isCurrentSection(
  pathname: string,
  route: string,
  base: string = import.meta.env.BASE_URL,
): boolean {
  const current = stripBase(pathname, base);
  const section = withTrailingSlash(route);
  return section === "/" ? current === "/" : current.startsWith(section);
}
