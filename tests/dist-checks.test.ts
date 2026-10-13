/**
 * The privacy backstop, tested against itself. tests/build.test.ts runs these detectors over the built
 * site on every deploy; a detector that silently stopped matching would turn that backstop off without
 * anything going red. So each is held here, in the default `npm test` run, to strings it MUST catch and
 * strings it must NOT.
 */
import { describe, expect, it } from "vitest";
import { CONFERENCING_HELP, conferencingLinks, EMAIL_HELP, emailLeaks, maskAddress, percentDecoded, targetAttributes } from "./support/dist-checks";

const CONTACT = "board@fixture.example.org";
const CALENDAR_ID = "c_0123abcd@group.calendar.google.com";
const ICS_LINK = '<a href="https://calendar.google.com/calendar/ical/c_0123abcd%40group.calendar.google.com/public/basic.ics">Calendar file (ICS)</a>';

describe("conferencingLinks (build assertion 4)", () => {
  it.each([
    ["a bare conferencing host", "<p>Join at zoom.us tonight</p>"],
    ["a full join link in an href", '<a href="https://meet.google.com/abc-defg-hij">Join</a>'],
    ["a join link with a subdomain", "<p>https://us02web.zoom.us/j/1234567890?pwd=x</p>"],
    [
      "a URL-encoded conferencing link inside another URL's query string",
      '<a href="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;location=https%3A%2F%2Fmeet.google.com%2Fabc-defg-hij">Add</a>',
    ],
    ["the same for Zoom", '<a href="https://example.org/r?to=https%3A%2F%2Fzoom.us%2Fj%2F123">x</a>'],
    ["a host whose dots are percent-encoded in an attribute", '<a href="https://example.org/r?to=zoom%2Eus%2Fj%2F123">x</a>'],
    ["a host encoded twice", '<a href="https://example.org/r?to=https%253A%252F%252Fmeet%252Egoogle%252Ecom%252Fabc">x</a>'],
    ["tel.meet, Google Meet's dial-in host", "<p>Dial in: https://tel.meet/abc-defg-hij?pin=1234567890123</p>"],
    ["Microsoft Teams", '<a href="https://teams.microsoft.com/l/meetup-join/19%3ameeting">Teams</a>'],
    ["Webex", "<p>avca.webex.com/meet/board</p>"],
    ["any letter case", "<p>MEET.GOOGLE.COM/ABC</p>"],
    ["a link inside an attribute other than href", '<p title="zoom.us/j/1">x</p>'],
  ])("catches %s", (_name, html) => {
    const hits = conferencingLinks(html);
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) expect(hit).toMatch(/^conferencing host (zoom\.us|meet\.google\.com|tel\.meet|teams\.microsoft\.com|webex\.com)( \(percent-encoded in an attribute\))?$/);
  });

  it.each([
    ["the words meet and zoom in text", "<p>We meet on the last Tuesday. Meet the board. A Zoom link is emailed to members.</p>"],
    ["Google Meet named without a link", "<p>Held on Google Meet or Microsoft Teams, or by Webex.</p>"],
    ["other Google hosts", '<a href="https://calendar.google.com/calendar/u/0?cid=abc">Subscribe</a> <a href="https://drive.google.com/drive/folders/x">Open</a>'],
    ["a host that only resembles one", "<p>zoomXus, meet-google-com, telemeet</p>"],
    ["an encoded legitimate URL", '<a href="https://www.google.com/maps/search/?api=1&amp;query=1415%20S%20Queen%20St%2C%20Arlington%2C%20VA">Map</a>'],
  ])("does not catch %s", (_name, html) => {
    expect(conferencingLinks(html)).toEqual([]);
  });

  it("reports every hit once, by its host alone: never the rest of the link", () => {
    expect(conferencingLinks("<p>zoom.us and meet.google.com</p>")).toEqual(["conferencing host zoom.us", "conferencing host meet.google.com"]);
    const link = conferencingLinks('<a href="https://us02web.zoom.us/j/1234567890?pwd=SECRETPASSCODE&amp;x=%20">Join</a>');
    expect(link).toEqual(["conferencing host zoom.us"]);
    expect(conferencingLinks('<a href="https://example.org/r?to=zoom%2Eus%2Fj%2F1234567890%3Fpwd%3DSECRETPASSCODE">x</a>')).toEqual([
      "conferencing host zoom.us (percent-encoded in an attribute)",
    ]);
  });
});

// Every address here is invented: example.org and example.com are reserved, and x.y is too short to be a Gmail account.
describe("emailLeaks (build assertion 5)", () => {
  it.each<[string, string, string[], string[]]>([
    ["an address in link text", '<a href="/join/">a.resident@example.org</a>', ["email address a…@example.org"], ["a.resident"]],
    ["an address in an attribute", '<a href="mailto:a.resident@example.org">Email us</a>', ["email address a…@example.org"], ["a.resident"]],
    ["an address in another attribute", '<p title="write to a.resident@example.org">x</p>', ["email address a…@example.org"], ["a.resident"]],
    ["an address in plain text", "<p>Questions: A.Resident+avca@Example.ORG.</p>", ["email address A…@Example.ORG"], ["Resident"]],
    ["an address with an apostrophe, as HTML escapes it", "<p>o&#39;neighbor@example.org</p>", ["email address o…@example.org"], ["neighbor"]],
    [
      "an address whose @ is written as a character reference",
      "<p>a.resident&#64;example.org and b.neighbor&#x40;example.org</p>",
      ["email address a…@example.org", "email address b…@example.org"],
      ["resident", "neighbor"],
    ],
    ["a gmail.com address (reported as gmail.com and as an address)", "<p>x.y@gmail.com</p>", ["the text gmail.com", "email address x…@gmail.com"], ["x.y"]],
    ["the string gmail.com with no address around it", "<p>We moved off gmail.com last year.</p>", ["the text gmail.com"], []],
    ["a second address beside the contact address", `<p>${CONTACT} or a.resident@example.org</p>`, ["email address a…@example.org"], ["a.resident"]],
    ["an address that only resembles the contact address", `<p>x${CONTACT}</p>`, ["email address x…@fixture.example.org"], ["xboard"]],
    [
      "a percent-encoded address in an href (an event title in the Add to Google Calendar link)",
      '<a class="button" href="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;text=Meeting+jane.roe%40mail.example.com&amp;dates=20261020T230000Z%2F20261021T003000Z">Add to Google Calendar</a>',
      ["email address j…@mail.example.com (percent-encoded in an attribute)"],
      ["jane", "roe"],
    ],
    [
      "a percent-encoded address in an attribute other than href",
      '<img src="/x.png" data-owner="jane.roe%40mail.example.com">',
      ["email address j…@mail.example.com (percent-encoded in an attribute)"],
      ["jane"],
    ],
    [
      "an address encoded twice (a link inside a link's query)",
      '<a href="https://example.org/r?to=mailto%253Ajane.roe%2540mail.example.com">x</a>',
      ["email address j…@mail.example.com (percent-encoded in an attribute)"],
      ["jane"],
    ],
    [
      "an address encoded with a lower-case escape and entity-escaped percent sign",
      '<a href="https://example.org/r?a=jane.roe%40mail.example.com&amp;b=b.neighbor&#37;40example.org">x</a>',
      ["email address j…@mail.example.com (percent-encoded in an attribute)", "email address b…@example.org (percent-encoded in an attribute)"],
      ["jane", "neighbor"],
    ],
    [
      "a percent-encoded gmail address: the bare text is caught as written, the address once decoded",
      '<a href="https://example.org/r?to=x.y%40gmail.com">x</a>',
      ["the text gmail.com", "email address x…@gmail.com (percent-encoded in an attribute)"],
      ["x.y"],
    ],
    [
      "a calendar ID in a link, when it is not the configured calendar's",
      ICS_LINK.replace("c_0123abcd", "c_other"),
      ["email address c…@group.calendar.google.com (percent-encoded in an attribute)"],
      ["c_other"],
    ],
  ])("catches %s, and reports it masked", (_name, html, expected, mustNotAppear) => {
    const hits = emailLeaks(html, CONTACT, [CALENDAR_ID]);
    expect(hits).toEqual(expected);
    for (const fragment of mustNotAppear) expect(hits.join(" "), fragment).not.toContain(fragment);
  });

  it.each([
    ["the configured contact address, in text and in a mailto link", `<a href="mailto:${CONTACT}">${CONTACT}</a>`],
    ["the contact address in another letter case", "<p>Board@Fixture.Example.ORG</p>"],
    ["the contact address percent-encoded in a link", '<a href="https://example.org/r?to=board%40fixture.example.org">x</a>'],
    ["logo@2x.png: an image-density suffix, not an address", '<img src="/_astro/logo@2x.png" srcset="/_astro/logo@2x.png 2x, /_astro/logo@3x.webp 3x">'],
    ["the same, percent-encoded", '<img src="/_astro/logo%402x.png">'],
    ["an at sign in prose", "<p>Meet @ 7 pm; rates @ 5.5 percent</p>"],
    ["the configured calendar's ID inside its own subscribe link", ICS_LINK],
    ["an encoded legitimate URL without an address", '<a href="https://www.google.com/maps/search/?api=1&amp;query=1415%20S%20Queen%20St%2C%20Arlington%2C%20VA%20%40%2038.86">Map</a>'],
    ["an Add to Google Calendar link with an ordinary title and location", '<a href="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;text=AVCA+Monthly+Meeting&amp;dates=20261020T230000Z%2F20261021T003000Z&amp;location=Carver+Community+Center%2C+Room+2">Add</a>'],
    ["a page with no address at all", "<h1>Meetings</h1><p>Email the president.</p>"],
  ])("does not catch %s", (_name, html) => {
    expect(emailLeaks(html, CONTACT, [CALENDAR_ID])).toEqual([]);
  });

  it("allows the calendar ID only percent-encoded in a link, never as text on the page", () => {
    expect(emailLeaks(`<p>${CALENDAR_ID}</p>`, CONTACT, [CALENDAR_ID])).toEqual(["email address c…@group.calendar.google.com"]);
    expect(emailLeaks(ICS_LINK, CONTACT)).toEqual(["email address c…@group.calendar.google.com (percent-encoded in an attribute)"]);
  });

  it("never throws on a malformed or non-UTF-8 escape, and still reads what is around it", () => {
    for (const bad of ["%", "%4", "%zz", "100%", "%E0%A4%A", "%C3", "%FF%FE", "a%2", "%%40%"]) {
      const html = `<a href="https://example.org/r?x=${bad}&amp;to=jane.roe%40mail.example.com">x</a>`;
      expect(() => emailLeaks(html, CONTACT), bad).not.toThrow();
      expect(emailLeaks(html, CONTACT), bad).toEqual(["email address j…@mail.example.com (percent-encoded in an attribute)"]);
      expect(() => conferencingLinks(html), bad).not.toThrow();
    }
    expect(percentDecoded("%E0%40x")).toBe("%E0@x");
    expect(percentDecoded("caf%C3%A9 %zz %4")).toBe("café %zz %4");
    expect(percentDecoded("a%2540b")).toBe("a@b");
  });

  it("maskAddress keeps the first character and the domain", () => {
    expect(maskAddress("jane.roe@mail.example.com")).toBe("j…@mail.example.com");
    expect(maskAddress("x@example.org")).toBe("x…@example.org");
  });
});

describe("the help printed with a failure", () => {
  it("says where an address or a link can come from, and that the match is masked", () => {
    for (const help of [EMAIL_HELP, CONFERENCING_HELP]) {
      expect(help).toMatch(/page text/);
      expect(help).toMatch(/a folder name/);
      expect(help).toMatch(/an event title/);
    }
    expect(EMAIL_HELP).toMatch(/masked/);
    expect(CONFERENCING_HELP).toMatch(/host only/);
  });
});

describe("targetAttributes (build assertion 3)", () => {
  it.each([
    ["double quotes", '<a href="https://example.org/" target="_blank">x</a>'],
    ["single quotes", "<a href='https://example.org/' target='_blank'>x</a>"],
    ["no quotes", "<a href=https://example.org/ target=_blank>x</a>"],
    ["spaces around the equals sign", '<a href="x" target = "_blank">x</a>'],
    ["upper case", '<A HREF="x" TARGET="_blank">x</A>'],
    ["no value", '<a href="x" target>x</a>'],
    ["a value other than _blank", '<a href="x" target="_top">x</a>'],
    ["first in the tag", '<a target="_blank" href="x">x</a>'],
    ["after an attribute whose value holds a >", '<a title="a > b" target="_blank" href="x">x</a>'],
    ["on a form or an area, not only a link", '<form action="/x" target="_blank"></form>'],
    ["across lines", '<a\n  href="x"\n  target="_blank"\n>x</a>'],
  ])("catches a target attribute: %s", (_name, html) => {
    expect(targetAttributes(html)).toHaveLength(1);
  });

  it.each([
    ["the word target in text", "<p>Our target is 40 members; target=_blank is never used here.</p>"],
    ["a file name containing target=", '<li class="file"><a href="https://drive.google.com/file/d/x/view">Notes target="_blank" draft.pdf</a></li>'],
    ["the same file name as HTML escapes it", '<a href="https://drive.google.com/file/d/x/view">Notes target=&quot;_blank&quot; draft.pdf</a>'],
    ["target= inside another attribute's value", '<a href="https://example.org/?target=_blank" title="set target=_blank">x</a>'],
    ["attributes that only contain the word", '<a href="x" data-target="y" aria-describedby="target">x</a>'],
    ["an escaped tag in text", "<p>&lt;a target=&quot;_blank&quot;&gt;</p>"],
    ["the :target pseudo-class in a style element", "<style>:target{outline:2px solid}a[href]{color:red}</style>"],
  ])("does not catch %s", (_name, html) => {
    expect(targetAttributes(html)).toEqual([]);
  });

  it("reports each offending tag by its attribute names, never their values", () => {
    const hits = targetAttributes('<p><a href="mailto:a.resident@example.org" target="_blank">a</a> <a href="b">b</a> <a class="x" href="c" target=_self>c</a></p>');
    expect(hits).toEqual(["<a href target>", "<a class href target>"]);
    expect(hits.join(" ")).not.toContain("example.org");
  });
});
