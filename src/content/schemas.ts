import { z } from "astro/zod";

/** Month in `YYYY-MM` form. */
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

// Every object is strict: board members edit these files in the GitHub web editor, so a typo such as
// `calandarId` must fail the build instead of silently falling back to a blank.

/** Blank is allowed by the schema; `isConfigured` reports which values are still blank. */
const driveId = z.string();

export const settingsSchema = z.strictObject({
  siteName: z.string().min(1),
  shortName: z.string().min(1),
  siteUrl: z.url({ protocol: /^https$/ }),
  contactEmail: z.email(),
  calendarId: z.string(),
  meetingRule: z.string().min(1),
  virtualLinkNote: z.string().min(1),
  /** Blank at launch (no form); otherwise an https:// URL. */
  joinFormUrl: z.union([z.literal(""), z.url({ protocol: /^https$/ })]),
  drive: z.strictObject({
    bylaws: driveId,
    bylawsCurrentFileId: driveId,
    meetings: driveId,
    presentations: driveId,
    letters: driveId,
    neighborhoodPlan: driveId,
    history: driveId,
  }),
});

export const boardSchema = z.strictObject({
  term: z.strictObject({ start: month, end: month }).optional(),
  officers: z.array(
    z.strictObject({
      role: z.string().min(1),
      name: z.string().min(1),
      kind: z.enum(["elected", "appointed", "honorary"]),
    }),
  ),
  /** An empty `names` is a vacant block. */
  blockCaptains: z.array(
    z.strictObject({ block: z.number().int().positive(), names: z.array(z.string().min(1)) }),
  ),
});

export const resourcesSchema = z.strictObject({
  groups: z.array(
    z.strictObject({
      title: z.string().min(1),
      links: z.array(
        z.strictObject({
          label: z.string().min(1),
          url: z.string().startsWith("https://"),
          note: z.string().optional(),
        }),
      ),
    }),
  ),
});
