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
 * Why a Drive file with this name is not listed anywhere, or undefined when the name is fine.
 * Everything the build-output assertions reject in page text is covered, so a name cannot fail them.
 */
export function privateNameReason(name: string): string | undefined {
  if (emailAddresses(name).length > 0 || mentionsGmail(name)) return "name contains an email address";
  if (conferencingHits(name).length > 0) return "name contains a conferencing link";
  return undefined;
}
