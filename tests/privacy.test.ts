import { describe, expect, it } from "vitest";
import { conferencingHits, emailAddresses, privateFileReason, privateNameReason, withoutEmailAddresses } from "../src/lib/privacy";

describe("privateNameReason (Drive file names that are never listed)", () => {
  it.each([
    "Sign-up sheet, send to a.resident@example.org.pdf",
    "Minutes 2026-10-20 (questions to A.Resident+avca@Example.ORG)",
    "o'neighbor@example.org notes",
    "board list gmail.com export",
    "CONTACT US AT X.Y@GMAIL.COM",
  ])("hides a name with an email address: %s", (name) => {
    expect(privateNameReason(name)).toBe("name contains an email address");
  });

  it.each([
    "Join https://zoom.us/j/1234567890",
    "October meeting meet.google.com/abc-defg-hij",
    "Dial in tel.meet/abc-defg-hij?pin=123",
    "Teams.Microsoft.com link for the board",
    "avca.webex.com room",
  ])("hides a name with a conferencing link: %s", (name) => {
    expect(privateNameReason(name)).toBe("name contains a conferencing link");
  });

  it.each([
    "AVCA Monthly Meeting Proposed Agenda - October 20, 2026",
    "AVCA 2026 Sep mtg mins (draft)",
    "AVCA_Article_V_Section_1_proposed_amendment",
    "logo@2x.png",
    "Banner@1.5x.webp",
    "Meet the candidates 2026-10-20",
    "Zoom etiquette for hybrid meetings",
    "Where to email the board",
    "Rates @ 5 percent",
  ])("lists an ordinary name: %s", (name) => {
    expect(privateNameReason(name)).toBeUndefined();
  });
});

describe("emailAddresses and conferencingHits", () => {
  it("return every match, and nothing for clean text", () => {
    expect(emailAddresses("a@b.example.org, then c.d@e.example.com")).toEqual(["a@b.example.org", "c.d@e.example.com"]);
    expect(emailAddresses("logo@2x.png and nothing else")).toEqual([]);
    expect(emailAddresses("not@anaddress")).toEqual([]);
    expect(conferencingHits("zoom.us and MEET.GOOGLE.COM")).toEqual(["zoom.us", "MEET.GOOGLE.COM"]);
    expect(conferencingHits("We meet on Zoom")).toEqual([]);
  });

  it("an address at a domain that only looks like a density suffix is still an address", () => {
    expect(emailAddresses("name@2x.example.org")).toEqual(["name@2x.example.org"]);
  });
});

describe("withoutEmailAddresses", () => {
  it("removes every address (and a mailto: before it, and the bare text gmail.com) and counts them", () => {
    expect(withoutEmailAddresses("Room 2, a.resident@example.org or mailto:b.neighbor@example.org.")).toEqual({ text: "Room 2,  or .", removed: 2 });
    expect(withoutEmailAddresses("list on gmail.com, or X.Y@GMAIL.COM")).toEqual({ text: "list on , or ", removed: 2 });
  });

  it("leaves text without an address alone, including an asset name with a density suffix", () => {
    for (const text of ["Carver Community Center", "Room logo@2x.png", "Meet @ 7 pm", ""]) {
      expect(withoutEmailAddresses(text)).toEqual({ text, removed: 0 });
    }
  });

  it("leaves nothing the build's address check would catch", () => {
    for (const text of ["a@b.example.org", "x.y@gmail.com, gmail.com", "o'neighbor@example.org (A.Resident+avca@Example.ORG)"]) {
      const { text: out } = withoutEmailAddresses(text);
      expect(emailAddresses(out), text).toEqual([]);
      expect(out, text).not.toMatch(/gmail\.com/i);
    }
  });
});

describe("privateFileReason (a file's own name, then the folders above it)", () => {
  it("gives the file's own name first, then the first folder with the problem, or nothing", () => {
    expect(privateFileReason({ name: "Minutes.pdf", path: ["2026-2027", "26 10 October"] })).toBeUndefined();
    expect(privateFileReason({ name: "Minutes for a.resident@example.org", path: ["zoom.us/j/1"] })).toBe("name contains an email address");
    expect(privateFileReason({ name: "Minutes.pdf", path: ["2026-2027", "Join zoom.us/j/1", "from a.resident@example.org"] })).toBe("a folder name contains a conferencing link");
    expect(privateFileReason({ name: "Minutes.pdf", path: ["gmail.com export"] })).toBe("a folder name contains an email address");
    expect(privateFileReason({ name: "logo@2x.png", path: ["Assets @ 2x"] })).toBeUndefined();
  });
});
