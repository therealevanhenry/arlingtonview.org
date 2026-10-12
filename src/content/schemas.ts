import { z } from "astro/zod";

/** Month in `YYYY-MM` form. */
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expected YYYY-MM");

/** Blank is allowed by the schema; `isConfigured` reports which values are still blank. */
const driveId = z.string();

export const settingsSchema = z.object({
  siteName: z.string().min(1),
  shortName: z.string().min(1),
  siteUrl: z.url(),
  contactEmail: z.email(),
  calendarId: z.string(),
  meetingRule: z.string().min(1),
  virtualLinkNote: z.string().min(1),
  joinFormUrl: z.string(),
  drive: z.object({
    bylaws: driveId,
    bylawsCurrentFileId: driveId,
    meetings: driveId,
    presentations: driveId,
    letters: driveId,
    neighborhoodPlan: driveId,
    history: driveId,
  }),
});

export const boardSchema = z.object({
  term: z.object({ start: month, end: month }).optional(),
  officers: z.array(z.object({ role: z.string().min(1), name: z.string().min(1) })),
  blockCaptains: z.array(
    z.object({ block: z.number().int().positive(), names: z.array(z.string().min(1)) }),
  ),
});

export const resourcesSchema = z.object({
  groups: z.array(
    z.object({
      title: z.string().min(1),
      links: z.array(
        z.object({
          label: z.string().min(1),
          url: z.string().startsWith("https://"),
          note: z.string().optional(),
        }),
      ),
    }),
  ),
});
