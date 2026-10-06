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
];
it.each(cases)("%s", (name, date, approx = false) => {
  const r = parseMeetingDate(name);
  expect(r?.date).toBe(date);
  if (date) expect(r?.approximate).toBe(approx);
});
