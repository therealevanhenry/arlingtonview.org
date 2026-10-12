import { describe, expect, it } from "vitest";
import { conferencingHits, emailAddresses, privateNameReason } from "../src/lib/privacy";

describe("privateNameReason (Drive file names that are never listed)", () => {
  it.each([
    "Sign-up sheet, send to a.resident@example.org.pdf",
    "Minutes 2026-10-20 (questions to A.Resident+avca@Example.ORG)",
    "o'neighbor@example.org notes",
    "board list gmail.com export",
    "CONTACT US AT SOMEONE@GMAIL.COM",
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
    expect(emailAddresses("a@b.org, then c.d@e.example.com")).toEqual(["a@b.org", "c.d@e.example.com"]);
    expect(emailAddresses("logo@2x.png and nothing else")).toEqual([]);
    expect(emailAddresses("not@anaddress")).toEqual([]);
    expect(conferencingHits("zoom.us and MEET.GOOGLE.COM")).toEqual(["zoom.us", "MEET.GOOGLE.COM"]);
    expect(conferencingHits("We meet on Zoom")).toEqual([]);
  });

  it("an address at a domain that only looks like a density suffix is still an address", () => {
    expect(emailAddresses("name@2x.example.org")).toEqual(["name@2x.example.org"]);
  });
});
