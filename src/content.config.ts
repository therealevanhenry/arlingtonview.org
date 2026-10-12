import { defineCollection } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";
import { parse as parseYaml } from "yaml";
import { boardSchema, resourcesSchema, settingsSchema } from "./content/schemas";

// The schemas live in a module with no `astro:content` import so that lib code and unit tests can
// use them directly. Re-exported here so this file remains the one place that names them.
export { boardSchema, resourcesSchema, settingsSchema };

/**
 * The YAML files each hold one document, not a list of entries. The file loader would read the
 * top-level keys as entry ids, so wrap the whole document as a single entry with id "main".
 */
const singleEntry = (text: string) => ({ main: parseYaml(text) });

export const collections = {
  settings: defineCollection({
    loader: file("src/content/settings.yaml", { parser: singleEntry }),
    schema: settingsSchema,
  }),
  board: defineCollection({
    loader: file("src/content/board.yaml", { parser: singleEntry }),
    schema: boardSchema,
  }),
  resources: defineCollection({
    loader: file("src/content/resources.yaml", { parser: singleEntry }),
    schema: resourcesSchema,
  }),
  pages: defineCollection({
    loader: glob({ pattern: "*.md", base: "src/content/pages" }),
    schema: z.object({ title: z.string().min(1) }),
  }),
};
