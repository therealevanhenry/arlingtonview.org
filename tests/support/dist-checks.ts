/**
 * The detectors behind build assertions 3, 4, and 5 (tests/build.test.ts), kept apart from the test
 * that reads `dist/` so they can be unit-tested in the default `npm test` run (tests/dist-checks.test.ts).
 * The patterns themselves live in src/lib/privacy.ts, which the loaders also use to hide a Drive file
 * with such a name, so the rule and this backstop cannot drift apart.
 */
import { conferencingHits, emailAddresses } from "../../src/lib/privacy";

/** Every start tag in the markup, whole (`<a href="x">`), with `>` inside a quoted value honored. */
export function startTags(html: string): string[] {
  const tags: string[] = [];
  for (let i = html.indexOf("<"); i !== -1; i = html.indexOf("<", i + 1)) {
    if (!/[A-Za-z]/.test(html[i + 1] ?? "")) continue;
    let quote = "";
    let end = i + 1;
    for (; end < html.length; end++) {
      const ch = html[end];
      if (quote !== "") {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
    }
    tags.push(html.slice(i, end + 1));
    i = end;
  }
  return tags;
}

/** The attribute names of one start tag, lower-cased. Values are skipped, so text inside a value is never a name. */
export function attributeNames(tag: string): string[] {
  const afterName = tag.replace(/^<[^\s/>]+/, "").replace(/\/?>$/, "");
  const names: string[] = [];
  for (const m of afterName.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>]+))?/g)) names.push(m[1].toLowerCase());
  return names;
}

/**
 * Assertion 3: the start tags that carry a `target` attribute, in any quoting style. Only attributes
 * count: text such as a file name containing ` target=` is not one.
 */
export function targetAttributes(html: string): string[] {
  return startTags(html).filter((tag) => attributeNames(tag).includes("target"));
}

/** Assertion 4: every conferencing host in the page, in text or in any attribute, encoded inside another URL or not. */
export function conferencingLinks(html: string): string[] {
  return conferencingHits(html);
}

/**
 * Assertion 5: every `gmail.com`, and every email address other than `allowed` (compared without
 * regard to case). The apostrophe and the at sign are decoded first, since HTML may escape them.
 */
export function emailLeaks(html: string, allowed: string): string[] {
  const decoded = html.replace(/&#39;|&#x27;|&apos;/gi, "'").replace(/&#64;|&#x40;|&commat;/gi, "@");
  const gmail = decoded.match(/gmail\.com/gi) ?? [];
  const others = emailAddresses(decoded).filter((address) => address.toLowerCase() !== allowed.toLowerCase());
  return [...gmail, ...others];
}

export const CONFERENCING_HELP =
  "a video-meeting join link must never be published: remove it from the page text, the calendar event's location, or the Drive file name";
export const EMAIL_HELP =
  "email addresses come from `contactEmail` in `src/content/settings.yaml`; remove the address from the page text or the Drive file name";
export const TARGET_HELP = "links open in the same tab: remove the target attribute from the component or the page text";
