/**
 * The two kinds of text the site must never print: a video-meeting join link and an email address.
 *
 * One definition, used twice. The loaders use it as a RULE (a Drive file whose name holds either is
 * hidden; a join link in a calendar location is stripped), and the build-output assertions use it as
 * the BACKSTOP (tests/support/dist-checks.ts, run on every deploy). Sharing it is what guarantees that
 * anything the backstop would reject in a file name has already been hidden, so a file name can never
 * block a deploy. tests/dist-checks.test.ts holds the strings each must and must not catch.
 */

/** Hosts of conferencing join links, with or without a scheme, and wherever they sit (e.g. URL-encoded inside another URL's query). `tel.meet` is Google Meet's dial-in host. */
const CONFERENCING_SOURCE = String.raw`zoom\.us|meet\.google\.com|tel\.meet|teams\.microsoft\.com|webex\.com`;

/** Every conferencing-host match in `text`. */
export function conferencingHits(text: string): string[] {
  return text.match(new RegExp(CONFERENCING_SOURCE, "gi")) ?? [];
}

/** A whitespace-delimited token that holds a conferencing host, e.g. `zoom.us/j/123?pwd=x` written without a scheme. */
export const CONFERENCING_TOKEN = new RegExp(String.raw`\S*(?:${CONFERENCING_SOURCE})\S*`, "gi");

const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
/** `logo@2x.png`: the image-density suffix of an asset name, not an address. */
const DENSITY_SUFFIX = /@\d+(?:\.\d+)?x\.[A-Za-z0-9]+$/;

/** Every email address in `text`, as written. */
export function emailAddresses(text: string): string[] {
  return (text.match(EMAIL) ?? []).filter((hit) => !DENSITY_SUFFIX.test(hit));
}

/** True for the bare string, with or without an address around it. */
export const mentionsGmail = (text: string): boolean => /gmail\.com/i.test(text);

/**
 * `text` with every email address taken out (with a `mailto:` in front of it, if any), and the bare
 * text `gmail.com` as well, so that nothing the build's address check rejects is left. `removed` is how
 * many pieces were taken out. The surrounding punctuation is left for the caller to tidy.
 */
export function withoutEmailAddresses(text: string): { text: string; removed: number } {
  let removed = 0;
  const drop = (): string => {
    removed++;
    return "";
  };
  const withoutAddresses = text.replace(new RegExp(`(?:mailto:)?${EMAIL.source}`, "gi"), (hit) => (DENSITY_SUFFIX.test(hit) ? hit : drop()));
  return { text: withoutAddresses.replace(/[A-Za-z0-9.-]*gmail\.com/gi, drop), removed };
}

/**
 * Why a Drive name (of a file or of a folder) must not be printed, or undefined when the name is fine.
 * Everything the build-output assertions reject in page text is covered, so a name cannot fail them.
 */
export function privateNameReason(name: string): string | undefined {
  if (emailAddresses(name).length > 0 || mentionsGmail(name)) return "name contains an email address";
  if (conferencingHits(name).length > 0) return "name contains a conferencing link";
  return undefined;
}

/**
 * Why a Drive file is not listed anywhere, or undefined when it may be: its own name, or the name of
 * any folder above it (`path`), holds an email address or a conferencing link. Folder names count
 * because they are printed too (as sub-headings on the Documents page).
 */
export function privateFileReason(file: { name: string; path: string[] }): string | undefined {
  const own = privateNameReason(file.name);
  if (own !== undefined) return own;
  for (const folder of file.path) {
    const reason = privateNameReason(folder);
    if (reason !== undefined) return `a folder ${reason}`;
  }
  return undefined;
}
