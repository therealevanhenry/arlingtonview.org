/** Unit check of the contrast helpers in support.ts (no browser involved). */
import { expect, test } from "@playwright/test";
import { contrastRatio, parseRgba } from "./support";

const white = parseRgba("rgb(255, 255, 255)");

test("contrast helper: black on white is 21:1", () => {
  expect(contrastRatio(parseRgba("rgb(0, 0, 0)"), white)).toBeCloseTo(21, 5);
});

test("contrast helper: #777777 on white is about 4.48:1 and fails the 4.5 threshold", () => {
  const ratio = contrastRatio(parseRgba("rgb(119, 119, 119)"), white);
  expect(ratio).toBeCloseTo(4.48, 2);
  expect(ratio).toBeLessThan(4.5);
});
