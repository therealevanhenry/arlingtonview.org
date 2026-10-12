import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "astro/zod";
import { parseDocument } from "yaml";
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
/**
 * Parses YAML text and validates it. Failures throw one readable line that names the file and, for
 * schema errors, the failing path (e.g. `src/content/board.yaml: officers[4].name: Invalid input`).
 */
export function parseContent<T>(file: string, text: string, schema: z.ZodType<T>): T {
  const label = `src/content/${file}`;
  const doc = parseDocument(text);
  const syntax = doc.errors[0];
  if (syntax) {
    const line = syntax.linePos?.[0];
    const where = line ? `line ${line.line}, column ${line.col}: ` : "";
    throw new Error(`${label}: ${where}${syntax.message.split("\n")[0]}`);
  }
  const result = schema.safeParse(doc.toJS());
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue.path.reduce<string>(
    (acc, part) => (typeof part === "number" ? `${acc}[${part}]` : acc === "" ? String(part) : `${acc}.${String(part)}`),
    "",
  );
  const more = result.error.issues.length > 1 ? ` (and ${result.error.issues.length - 1} more)` : "";
  throw new Error(`${label}: ${path === "" ? "" : `${path}: `}${issue.message}${more}`.replace(/\s*\n\s*/g, " "));
}

async function readYaml<T>(file: string, schema: z.ZodType<T>): Promise<T> {
  const path = join(process.cwd(), "src", "content", file);
  return parseContent(file, await readFile(path, "utf8"), schema);
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
