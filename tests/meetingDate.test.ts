import { it, expect } from "vitest";
import { parseMeetingDate } from "../src/lib/meetingDate";

const cases: Array<[string, string | undefined, boolean?]> = [
  ["2026-09-30 Minutes.pdf", "2026-09-30"],
  ["AVCA Meeting Minutes 9.25.24", "2024-09-25"],
  ["AVCA Proposed Agenda 06.24.2026", "2026-06-24"],
  ["AVCA Minutes 4-27-2022.docx", "2022-04-27"],
  ["Agenda 3/29/2023.pdf", "2023-03-29"],
  ["Sept 2020 Minutes", "2020-09-01", true],
  ["AVCA Meeting Minutes.docx", undefined],
  ["AVCA Proposed Agenda 6.23.201.docx", undefined],
  ["Budget 13.40.2024.xlsx", undefined],
  ["Budget 2.30.2024.xlsx", undefined],
  ["AVCA Monthly Meeting Proposed Agenda - October 20, 2026", "2026-10-20"],
  ["AVCA By-Laws (June 24th, 2026).pdf", "2026-06-24"],
  ["Agenda Sept 3, 2025", "2025-09-03"],
  ["Agenda Sept 3,2025", "2025-09-03"],
  ["1989-12-31 Minutes", undefined],
  ["2101-01-01 Minutes", undefined],
  ["Marching 2026", undefined],
  ["Mayor 2026", undefined],
  ["February 30, 2026 then March 3, 2026", "2026-03-03"],
  ["AVCA 2026 Sep mtg mins (draft)", "2026-09-01", true],
  ["AVCA 2026 June mtg mins", "2026-06-01", true],
  ["AVCA 2025 Jun mtg mins", "2025-06-01", true],
  ["(OLD) AVCA 2025 Feb mtg mins", "2025-02-01", true],
  ["September 2020 Minutes", "2020-09-01", true],
  ["Sep. 2020 Minutes", "2020-09-01", true],
  ["Arlington View Civic Association Updated 06242026", undefined],
  ["Summary 2020", undefined],
  ["February 30, 2026 Agenda", undefined],
  ["Jan 0000 notes", undefined],
  ["Budget 13.40.2024 revised 6.24.2026.xlsx", "2026-06-24"],
  ["12026-09-30 Minutes.pdf", undefined],
  ["2026-09-30 Minutes 10.01.2026.pdf", "2026-09-30"],
];
it.each(cases)("%s", (name, date, approx = false) => {
  const r = parseMeetingDate(name);
  expect(r?.date).toBe(date);
  if (date) expect(r?.approximate).toBe(approx);
});
