/**
 * The privacy backstop, tested against itself. tests/build.test.ts runs these detectors over the built
 * site on every deploy; a detector that silently stopped matching would turn that backstop off without
 * anything going red. So each is held here, in the default `npm test` run, to strings it MUST catch and
 * strings it must NOT.
 */
import { describe, expect, it } from "vitest";
import { conferencingLinks, emailLeaks, targetAttributes } from "./support/dist-checks";

const CONTACT = "board@fixture.example.org";

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
    ["tel.meet, Google Meet's dial-in host", "<p>Dial in: https://tel.meet/abc-defg-hij?pin=1234567890123</p>"],
    ["Microsoft Teams", '<a href="https://teams.microsoft.com/l/meetup-join/19%3ameeting">Teams</a>'],
    ["Webex", "<p>avca.webex.com/meet/board</p>"],
    ["any letter case", "<p>MEET.GOOGLE.COM/ABC</p>"],
    ["a link inside an attribute other than href", '<p title="zoom.us/j/1">x</p>'],
  ])("catches %s", (_name, html) => {
    expect(conferencingLinks(html).length).toBeGreaterThan(0);
  });

  it.each([
    ["the words meet and zoom in text", "<p>We meet on the last Tuesday. Meet the board. A Zoom link is emailed to members.</p>"],
    ["Google Meet named without a link", "<p>Held on Google Meet or Microsoft Teams, or by Webex.</p>"],
    ["other Google hosts", '<a href="https://calendar.google.com/calendar/u/0?cid=abc">Subscribe</a> <a href="https://drive.google.com/drive/folders/x">Open</a>'],
    ["a host that only resembles one", "<p>zoomXus, meet-google-com, telemeet</p>"],
  ])("does not catch %s", (_name, html) => {
    expect(conferencingLinks(html)).toEqual([]);
  });

  it("reports every hit", () => {
    expect(conferencingLinks("<p>zoom.us and meet.google.com</p>")).toEqual(["zoom.us", "meet.google.com"]);
  });
});

// Every address here is invented: example.org is reserved, and x.y is too short to be a Gmail account.
describe("emailLeaks (build assertion 5)", () => {
  it.each([
    ["an address in link text", '<a href="/join/">a.resident@example.org</a>', ["a.resident@example.org"]],
    ["an address in an attribute", '<a href="mailto:a.resident@example.org">Email us</a>', ["a.resident@example.org"]],
    ["an address in another attribute", '<p title="write to a.resident@example.org">x</p>', ["a.resident@example.org"]],
    ["an address in plain text", "<p>Questions: A.Resident+avca@Example.ORG.</p>", ["A.Resident+avca@Example.ORG"]],
    ["an address with an apostrophe, as HTML escapes it", "<p>o&#39;neighbor@example.org</p>", ["o'neighbor@example.org"]],
    ["an address whose @ is written as a character reference", "<p>a.resident&#64;example.org and b.neighbor&#x40;example.org</p>", ["a.resident@example.org", "b.neighbor@example.org"]],
    ["a gmail.com address (reported as gmail.com and as an address)", "<p>x.y@gmail.com</p>", ["gmail.com", "x.y@gmail.com"]],
    ["the string gmail.com with no address around it", "<p>We moved off gmail.com last year.</p>", ["gmail.com"]],
    ["a second address beside the contact address", `<p>${CONTACT} or a.resident@example.org</p>`, ["a.resident@example.org"]],
    ["an address that only resembles the contact address", `<p>x${CONTACT}</p>`, [`x${CONTACT}`]],
  ])("catches %s", (_name, html, expected) => {
    expect(emailLeaks(html, CONTACT)).toEqual(expected);
  });

  it.each([
    ["the configured contact address, in text and in a mailto link", `<a href="mailto:${CONTACT}">${CONTACT}</a>`],
    ["the contact address in another letter case", "<p>Board@Fixture.Example.ORG</p>"],
    ["logo@2x.png: an image-density suffix, not an address", '<img src="/_astro/logo@2x.png" srcset="/_astro/logo@2x.png 2x, /_astro/logo@3x.webp 3x">'],
    ["an at sign in prose", "<p>Meet @ 7 pm; rates @ 5.5 percent</p>"],
    ["a calendar ID inside a URL-encoded link", '<a href="https://calendar.google.com/calendar/ical/c_abc%40group.calendar.google.com/public/basic.ics">ICS</a>'],
    ["a page with no address at all", "<h1>Meetings</h1><p>Email the president.</p>"],
  ])("does not catch %s", (_name, html) => {
    expect(emailLeaks(html, CONTACT)).toEqual([]);
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

  it("reports each offending tag", () => {
    const hits = targetAttributes('<p><a href="a" target="_blank">a</a> <a href="b">b</a> <a href="c" target=_self>c</a></p>');
    expect(hits).toEqual(['<a href="a" target="_blank">', '<a href="c" target=_self>']);
  });
});
