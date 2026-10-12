import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { boardSchema, resourcesSchema, settingsSchema } from "./content/schemas";

// The schemas live in a module with no `astro:content` import so that lib code and unit tests can
// use them directly. Re-exported here so this file remains the one place that names them.
export { boardSchema, resourcesSchema, settingsSchema };

// settings.yaml, board.yaml and resources.yaml are NOT collections. src/lib/settings.ts is their
// single loader and validator (getSettings, getBoard, getResources); do not use getEntry for them.
export const collections = {
  pages: defineCollection({
    loader: glob({ pattern: "*.md", base: "src/content/pages" }),
    schema: z.object({ title: z.string().min(1) }),
  }),
};
