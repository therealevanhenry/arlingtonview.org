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

type Parts = { year: number; month: number; day: number };

// Numeric patterns must not match inside a longer digit run.
const NUMERIC_PATTERNS: Array<{ re: RegExp; parts: (m: RegExpMatchArray) => Parts }> = [
  {
    re: /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/,
    parts: (m) => ({ year: +m[1], month: +m[2], day: +m[3] }),
  },
  {
    re: /(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/,
    parts: (m) => ({ year: +m[3], month: +m[1], day: +m[2] }),
  },
  {
    re: /(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{2})(?!\d)/,
    parts: (m) => ({ year: 2000 + +m[3], month: +m[1], day: +m[2] }),
  },
  {
    re: /(?<!\d)(\d{1,2})-(\d{1,2})-(\d{4})(?!\d)/,
    parts: (m) => ({ year: +m[3], month: +m[1], day: +m[2] }),
  },
  {
    re: /(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/,
    parts: (m) => ({ year: +m[3], month: +m[1], day: +m[2] }),
  },
];

const MONTH_YEAR = new RegExp(
  `(?<![a-z])(${MONTH_ALTERNATION})\\.?\\s+(\\d{4})(?!\\d)`,
  "i",
);

function isRealDate({ year, month, day }: Parts): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function format({ year, month, day }: Parts): string {
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  return `${p(year, 4)}-${p(month, 2)}-${p(day, 2)}`;
}

/** Extract a meeting date from a Drive filename; undefined if none is recognisable. */
export function parseMeetingDate(filename: string): MeetingDate | undefined {
  for (const { re, parts } of NUMERIC_PATTERNS) {
    const m = filename.match(re);
    if (!m) continue;
    const p = parts(m);
    if (isRealDate(p)) return { date: format(p), approximate: false };
  }

  const m = filename.match(MONTH_YEAR);
  if (m) {
    const p = { year: +m[2], month: MONTH_LOOKUP.get(m[1].toLowerCase())!, day: 1 };
    return { date: format(p), approximate: true };
  }
  return undefined;
}
