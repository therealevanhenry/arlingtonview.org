export interface MeetingDate {
  /** Valid calendar date, YYYY-MM-DD. */
  date: string;
  /** True when the day was not in the filename (month + year only, day = 1). */
  approximate: boolean;
}

const MONTHS = [
  ["jan", "january"],
  ["feb", "february"],
  ["mar", "march"],
  ["apr", "april"],
  ["may", "may"],
  ["jun", "june"],
  ["jul", "july"],
  ["aug", "august"],
  ["sep", "september", "sept"],
  ["oct", "october"],
  ["nov", "november"],
  ["dec", "december"],
];

const MONTH_LOOKUP = new Map<string, number>(
  MONTHS.flatMap((names, i) => names.map((n) => [n, i + 1] as [string, number])),
);

// Longest names first so "september" is preferred over "sep".
const MONTH_ALTERNATION = [...MONTH_LOOKUP.keys()]
  .sort((a, b) => b.length - a.length)
  .join("|");

// A month name that is a whole word (not the start of "Marching" or the end of "Mayor"). Shared by
// every pattern that matches a month name; it captures the name as one group.
const MONTH_WORD = `(?<![a-z])(${MONTH_ALTERNATION})(?![a-z])`;

type Parts = { year: number; month: number; day: number };

interface Pattern {
  /** Must carry the `g` flag so every match in the filename is tried. */
  re: RegExp;
  parts: (m: RegExpMatchArray) => Parts;
  /** True when the filename carries no day (month + year only). */
  approximate: boolean;
}

const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

// The alternation only matches names in the lookup; 0 is an invalid month that `isRealDate` rejects.
const monthNumber = (name: string) => MONTH_LOOKUP.get(name.toLowerCase()) ?? 0;

// Tried in order; the first pattern with a valid date wins. Numeric patterns
// must not match inside a longer digit run, and month names must not sit
// inside a longer word.
const PATTERNS: Pattern[] = [
  {
    re: /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g,
    parts: (m) => ({ year: +m[1], month: +m[2], day: +m[3] }),
    approximate: false,
  },
  {
    re: /(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/g,
    parts: (m) => ({ year: +m[3], month: +m[1], day: +m[2] }),
    approximate: false,
  },
  {
    re: /(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{2})(?!\d)/g,
    parts: (m) => ({ year: 2000 + +m[3], month: +m[1], day: +m[2] }),
    approximate: false,
  },
  {
    re: /(?<!\d)(\d{1,2})-(\d{1,2})-(\d{4})(?!\d)/g,
    parts: (m) => ({ year: +m[3], month: +m[1], day: +m[2] }),
    approximate: false,
  },
  {
    re: /(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/g,
    parts: (m) => ({ year: +m[3], month: +m[1], day: +m[2] }),
    approximate: false,
  },
  {
    re: new RegExp(`${MONTH_WORD}\\.?\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,\\s*|\\s+)(\\d{4})(?!\\d)`, "gi"),
    parts: (m) => ({ year: +m[3], month: monthNumber(m[1]), day: +m[2] }),
    approximate: false,
  },
  {
    re: new RegExp(`${MONTH_WORD}\\.?\\s+(\\d{4})(?!\\d)`, "gi"),
    parts: (m) => ({ year: +m[2], month: monthNumber(m[1]), day: 1 }),
    approximate: true,
  },
  {
    re: new RegExp(`(?<!\\d)(\\d{4})\\s+${MONTH_WORD}`, "gi"),
    parts: (m) => ({ year: +m[1], month: monthNumber(m[2]), day: 1 }),
    approximate: true,
  },
];

function isRealDate({ year, month, day }: Parts): boolean {
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function format({ year, month, day }: Parts): string {
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  return `${p(year, 4)}-${p(month, 2)}-${p(day, 2)}`;
}

/**
 * Extract a meeting date from a Drive filename; undefined if none is recognisable.
 *
 * Known and accepted: patterns are tried in order and the first valid one wins, so a name with an
 * impossible `Month D, YYYY` (e.g. "February 30, 2026 notes") followed by a `YYYY Mon` shape
 * ("... 2026 Mar") resolves to that approximate month rather than being undated.
 */
export function parseMeetingDate(filename: string): MeetingDate | undefined {
  for (const { re, parts, approximate } of PATTERNS) {
    for (const m of filename.matchAll(re)) {
      const p = parts(m);
      if (isRealDate(p)) return { date: format(p), approximate };
    }
  }
  return undefined;
}
