import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "astro/zod";
import { parse as parseYaml } from "yaml";
import { boardSchema, resourcesSchema, settingsSchema } from "../content/schemas";

export type Settings = z.infer<typeof settingsSchema>;
export type Board = z.infer<typeof boardSchema>;
export type ResourceGroup = z.infer<typeof resourcesSchema>["groups"][number];

// The content layer's data store is only populated by `astro sync`/`build`/`dev`, so it is empty
// in plain Vitest and in the container API. These three files are small and read at build time, so
// they are read and validated directly with the same schemas the collections use. That keeps one
// code path in pages and in unit tests, and this module free of any `astro:content` import.
// `process.cwd()` is the project root for build, dev, and test; bundled page chunks cannot rely
// on `import.meta.url` to find `src/`.
async function readYaml<T>(file: string, schema: z.ZodType<T>): Promise<T> {
  const path = join(process.cwd(), "src", "content", file);
  return schema.parse(parseYaml(await readFile(path, "utf8")));
}

export const getSettings = (): Promise<Settings> => readYaml("settings.yaml", settingsSchema);
export const getBoard = (): Promise<Board> => readYaml("board.yaml", boardSchema);
export async function getResources(): Promise<ResourceGroup[]> {
  return (await readYaml("resources.yaml", resourcesSchema)).groups;
}

export type ConfiguredStatus = {
  calendarId: boolean;
  joinFormUrl: boolean;
  drive: Record<keyof Settings["drive"], boolean>;
};

const isSet = (value: string): boolean => value.trim() !== "";

/** True per key when the value is non-blank. A blank `joinFormUrl` is a valid launch state. */
export function isConfigured(settings: Settings): ConfiguredStatus {
  const drive = Object.fromEntries(
    Object.entries(settings.drive).map(([key, value]) => [key, isSet(value)]),
  ) as ConfiguredStatus["drive"];
  return {
    calendarId: isSet(settings.calendarId),
    joinFormUrl: isSet(settings.joinFormUrl),
    drive,
  };
}
