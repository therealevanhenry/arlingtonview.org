/**
 * The detectors behind build assertions 3, 4, and 5 (tests/build.test.ts), kept apart from the test
 * that reads `dist/` so they can be unit-tested in the default `npm test` run (tests/dist-checks.test.ts).
 * The patterns themselves live in src/lib/privacy.ts, which the loaders also use to hide a Drive file
 * with such a name, so the rule and this backstop cannot drift apart.
 *
 * What a detector returns is printed in the failure message, and the failure message is printed in the
 * Actions log of a public repository, which is public and cannot be edited afterwards. So a detector
 * never returns what it found in full: an address is masked to its first character and its domain
 * (`j…@example.org`), a conferencing link is reported by its host alone, and a tag by its attribute
 * names. Each says what KIND of thing it is; the caller adds the page's file name.
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

/** The attributes of one start tag: names lower-cased, values without their quotes ("" when there is none). */
export function attributes(tag: string): Array<{ name: string; value: string }> {
  const afterName = tag.replace(/^<[^\s/>]+/, "").replace(/\/?>$/, "");
  const found: Array<{ name: string; value: string }> = [];
  for (const m of afterName.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g)) {
    found.push({ name: m[1].toLowerCase(), value: m[2] ?? m[3] ?? m[4] ?? "" });
  }
  return found;
}

/** The attribute names of one start tag. Values are skipped, so text inside a value is never a name. */
export const attributeNames = (tag: string): string[] => attributes(tag).map((a) => a.name);

/** The few character references that can stand for the characters of an address or a URL escape. */
const decodeReferences = (text: string): string =>
  text
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&#64;|&#x40;|&commat;/gi, "@")
    .replace(/&#37;|&#x25;|&percnt;/gi, "%")
    .replace(/&#46;|&#x2e;|&period;/gi, ".");

/**
 * `value` with its percent-escapes decoded, up to three times over (a URL inside a URL's query is
 * encoded twice). Never throws: an escape that is malformed, or that is not valid UTF-8, is decoded
 * byte by byte where it is plain ASCII and otherwise left as it is.
 */
export function percentDecoded(value: string): string {
  let current = value;
  for (let round = 0; round < 3; round++) {
    const next = current.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
      try {
        return decodeURIComponent(run);
      } catch {
        return run.replace(/%([0-7][0-9A-Fa-f])/g, (_escape, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
      }
    });
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * Every attribute value that says something more once its percent-escapes are decoded: [as written,
 * decoded]. In both, a `+` is read as the space it stands for in a query string (`text=Meeting+jane%40...`
 * is "Meeting jane@...", not an address that begins "Meeting+jane"); a real plus sign is `%2B`.
 */
function encodedAttributeValues(html: string): Array<[written: string, decoded: string]> {
  const pairs: Array<[string, string]> = [];
  for (const tag of startTags(html)) {
    for (const { value } of attributes(tag)) {
      const written = decodeReferences(value);
      if (percentDecoded(written) === written) continue;
      const spaced = written.replace(/\+/g, " ");
      pairs.push([spaced, percentDecoded(spaced)]);
    }
  }
  return pairs;
}

const ENCODED = " (percent-encoded in an attribute)";

/**
 * Assertion 3: the start tags that carry a `target` attribute, in any quoting style, each reported as
 * its tag and attribute names (`<a href target>`), never its values. Only attributes count: text such
 * as a file name containing ` target=` is not one.
 */
export function targetAttributes(html: string): string[] {
  return startTags(html)
    .filter((tag) => attributeNames(tag).includes("target"))
    .map((tag) => `<${[/^<([^\s/>]+)/.exec(tag)?.[1] ?? "?", ...attributeNames(tag)].join(" ")}>`);
}

/**
 * Assertion 4: every conferencing host in the page, in text or in any attribute, encoded inside
 * another URL or not, and also where the host itself is percent-encoded in an attribute. Each is
 * reported as `conferencing host <host>`: the host alone, never the link.
 */
export function conferencingLinks(html: string): string[] {
  const found = conferencingHits(html).map((host) => `conferencing host ${host.toLowerCase()}`);
  for (const [written, decoded] of encodedAttributeValues(html)) {
    const extra = conferencingHits(decoded).slice(conferencingHits(written).length);
    found.push(...extra.map((host) => `conferencing host ${host.toLowerCase()}${ENCODED}`));
  }
  return found;
}

/** `jane.roe@example.org` as `j…@example.org`: enough to find it on the page, not enough to publish it. */
export function maskAddress(address: string): string {
  const at = address.lastIndexOf("@");
  return `${address.slice(0, 1)}…${address.slice(at)}`;
}

/**
 * Assertion 5: every `gmail.com`, and every email address other than `allowed` (compared without
 * regard to case), in the page as written (the apostrophe and the at sign may be character references)
 * and in attribute values once percent-decoded (`mailto:` aside, an address in a link is `%40`).
 * `allowedInLinks` are address-shaped values that may appear percent-encoded in a link and nowhere
 * else: the calendar ID, which is part of the calendar's own subscribe links.
 * Each is reported masked (`email address j…@example.org`), never in full.
 */
export function emailLeaks(html: string, allowed: string, allowedInLinks: string[] = []): string[] {
  const permitted = allowed.toLowerCase();
  const text = decodeReferences(html);
  const found = [
    ...(text.match(/gmail\.com/gi) ?? []).map(() => "the text gmail.com"),
    ...emailAddresses(text).filter((address) => address.toLowerCase() !== permitted).map((address) => `email address ${maskAddress(address)}`),
  ];
  const inLinks = new Set([permitted, ...allowedInLinks.map((a) => a.toLowerCase())]);
  for (const [written, decoded] of encodedAttributeValues(html)) {
    const already = new Set(emailAddresses(written).map((a) => a.toLowerCase()));
    const extraGmail = (decoded.match(/gmail\.com/gi) ?? []).length - (written.match(/gmail\.com/gi) ?? []).length;
    for (let i = 0; i < extraGmail; i++) found.push(`the text gmail.com${ENCODED}`);
    for (const address of emailAddresses(decoded)) {
      const lower = address.toLowerCase();
      if (already.has(lower) || inLinks.has(lower)) continue;
      found.push(`email address ${maskAddress(address)}${ENCODED}`);
    }
  }
  return found;
}

export const CONFERENCING_HELP =
  "a video-meeting join link must never be published: remove it from the page text (or, if the rules that strip and hide such links have a gap, from the Drive file name, a folder name, or an event title or location). The match is shown by its host only";
export const EMAIL_HELP =
  "email addresses come from `contactEmail` in `src/content/settings.yaml`; remove the address from the page text (or, if the rules that strip and hide addresses have a gap, from the Drive file name, a folder name, or an event title or location). The address is shown masked: its first character and its domain";
export const TARGET_HELP = "links open in the same tab: remove the target attribute from the component or the page text";
