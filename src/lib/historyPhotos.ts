export type HistoryPhoto = { year: string; image: ImageMetadata };

/**
 * Turns the `import.meta.glob` result for `src/assets/history/AVCA_<year>.png` into photos, oldest first.
 * A file that does not match the name pattern is an error, not a photo with a blank caption.
 */
export function photosFromModules(modules: Record<string, { default: ImageMetadata }>): HistoryPhoto[] {
  return Object.entries(modules)
    .map(([path, mod]) => {
      const year = /AVCA_(\d{4})\.png$/.exec(path)?.[1];
      if (year === undefined) throw new Error(`${path}: history photograph names must look like AVCA_<year>.png`);
      return { year, image: mod.default };
    })
    .sort((a, b) => a.year.localeCompare(b.year));
}
