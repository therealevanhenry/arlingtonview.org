import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Shell helpers used by .github/workflows/deploy.yml. Every test works in a temp directory and never
// touches the real dist/.
const scripts = resolve(__dirname, "../scripts");
const run = (script: string, args: string[] = [], env: Record<string, string> = {}) => {
  const r = spawnSync("bash", [join(scripts, script), ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "avca-scripts-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function site(dir: string): void {
  mkdirSync(join(dir, "_astro"), { recursive: true });
  mkdirSync(join(dir, "meetings"), { recursive: true });
  writeFileSync(join(dir, "index.html"), "<h1>home</h1>");
  writeFileSync(join(dir, "meetings/index.html"), "<h1>meetings</h1>");
  writeFileSync(join(dir, "_astro/a.css"), "body{}");
}

describe("dist-hash.sh", () => {
  const hash = (dir: string, env: Record<string, string> = {}) => run("dist-hash.sh", [dir], env);

  it("prints one 64-hex digest", () => {
    site(tmp);
    const r = hash(tmp);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^[0-9a-f]{64}\n$/);
  });

  it("is the same for an identical copy in another location", () => {
    const a = join(tmp, "one/deeper/dist");
    const b = join(tmp, "two/dist");
    site(a);
    site(b);
    expect(hash(b).out).toBe(hash(a).out);
  });

  // B.txt sorts before a.txt in the C locale and after it in en_US.UTF-8, so a digest computed under
  // en_US.UTF-8 would differ unless the script forces LC_ALL=C. Removing that line makes this fail.
  const hasEnUS = spawnSync("locale", ["-a"], { encoding: "utf8" }).stdout.split("\n").some((l) => /^en_US\.utf-?8$/i.test(l));
  it.skipIf(!hasEnUS)("is independent of the caller's locale (forces LC_ALL=C)", () => {
    site(tmp);
    writeFileSync(join(tmp, "B.txt"), "upper");
    writeFileSync(join(tmp, "a.txt"), "lower");
    const inC = hash(tmp, { LC_ALL: "C" }).out;
    expect(hash(tmp, { LC_ALL: "en_US.UTF-8" }).out).toBe(inC);
    expect(hash(tmp).out).toBe(inC);
  });

  it("ignores mtimes", () => {
    site(tmp);
    const before = hash(tmp).out;
    utimesSync(join(tmp, "index.html"), new Date(2001, 1, 1), new Date(2001, 1, 1));
    expect(hash(tmp).out).toBe(before);
  });

  it("changes when one byte changes, when a file is added, and when a file is renamed", () => {
    site(tmp);
    const before = hash(tmp).out;
    writeFileSync(join(tmp, "_astro/a.css"), "body{ }");
    const changed = hash(tmp).out;
    expect(changed).not.toBe(before);
    writeFileSync(join(tmp, "extra.txt"), "x");
    const added = hash(tmp).out;
    expect(added).not.toBe(changed);
    renameSync(join(tmp, "extra.txt"), join(tmp, "renamed.txt"));
    expect(hash(tmp).out).not.toBe(added);
  });

  it("ignores a top-level build-hash.txt but not one nested deeper", () => {
    site(tmp);
    const before = hash(tmp).out;
    writeFileSync(join(tmp, "build-hash.txt"), "anything\n");
    expect(hash(tmp).out).toBe(before);
    writeFileSync(join(tmp, "meetings/build-hash.txt"), "anything\n");
    expect(hash(tmp).out).not.toBe(before);
  });

  it("fails clearly when the directory is missing or empty", () => {
    const missing = hash(join(tmp, "nope"));
    expect(missing.code).toBe(1);
    expect(missing.err).toContain("directory not found");
    mkdirSync(join(tmp, "empty"));
    const empty = hash(join(tmp, "empty"));
    expect(empty.code).toBe(1);
    expect(empty.err).toContain("no files");
  });
});

describe("build-health.sh", () => {
  // The script reads the one line src/lib/data.ts prints. tests/data.test.ts feeds it the REAL loader
  // output; these cover the parsing and the fail-closed cases.
  const health = (log: string) => {
    const file = join(tmp, "build.log");
    writeFileSync(file, log);
    return run("build-health.sh", [file]);
  };
  const line = (status: string) => `[site-data] health: ${status}\n`;
  const drive = (reason: string) => `[drive] folder "abc123" not listed: ${reason}; falling back to a link\n`;

  it("exits 0 and prints ok for a healthy build", () => {
    const r = health(`12:00 [build] start\n${line("ok")}12:00 [build] 9 page(s) built\n`);
    expect(r.code).toBe(0);
    expect(r.out).toBe("ok\n");
  });

  it("exits 0 for an OFFLINE=1 build", () => {
    const r = health(line("ok (offline)"));
    expect(r.code).toBe(0);
    expect(r.out).toBe("ok (offline)\n");
  });

  it("exits 0 for an unconfigured build and prints what is missing, for the workflow's warning", () => {
    const r = health(drive("no API key") + line("unconfigured (no API key; calendarId is blank)"));
    expect(r.code).toBe(0);
    expect(r.out).toBe("unconfigured: no API key; calendarId is blank\n");
  });

  it("exits 1 for a degraded build and prints the reasons", () => {
    const r = health(`before\n${drive("HTTP 403")}${line("degraded (drive meetings: HTTP 403; calendar: HTTP 503)")}after\n`);
    expect(r.code).toBe(1);
    expect(r.out).toBe("degraded: drive meetings: HTTP 403; calendar: HTTP 503\n");
  });

  it("finds the line when Astro's progress output left it in the middle of another", () => {
    const r = health(`18:03:47   ├─ /about/history/index.html${line("degraded (drive bylaws: timeout)")}`);
    expect(r.code).toBe(1);
    expect(r.out).toBe("degraded: drive bylaws: timeout\n");
    expect(health(`18:03:47   ├─ /about/history/index.html${line("ok")}`).code).toBe(0);
  });

  it("does not fail open on a log containing a NUL byte", () => {
    const r = health(`before\0\n${line("degraded (drive bylaws: HTTP 403)")}`);
    expect(r.code).toBe(1);
    expect(r.out).toContain("HTTP 403");
  });

  it("exits 2 when the health line is absent: the per-root warnings alone decide nothing", () => {
    for (const log of ["12:00 [build] 9 page(s) built\n", drive("HTTP 403"), "[calendar] not loaded: HTTP 503; the meetings list will be empty\n", ""]) {
      const r = health(log);
      expect(r.code, JSON.stringify(log)).toBe(2);
      expect(r.err).toContain("found 0");
      expect(r.out).toBe("");
    }
  });

  it("exits 2 when the health line appears more than once, even if every copy says ok", () => {
    for (const log of [line("ok") + line("ok"), line("ok") + line("degraded (calendar: HTTP 503)"), `x ${line("ok").trimEnd()} ${line("ok")}`]) {
      const r = health(log);
      expect(r.code, JSON.stringify(log)).toBe(2);
      expect(r.err).toContain("found 2");
    }
  });

  it("exits 2 for a health line that is not one of the four forms", () => {
    for (const status of ["", "OK", "ok and then some", "fine", "degraded", "degraded ()", "unconfigured (a (b))", "degraded (x) trailing"]) {
      const r = health(line(status));
      expect(r.code, status).toBe(2);
      expect(r.out, status).toBe("");
    }
  });

  it("exits 2 on missing file or wrong usage", () => {
    expect(run("build-health.sh", [join(tmp, "missing.log")]).code).toBe(2);
    expect(run("build-health.sh").code).toBe(2);
  });
});

describe("drive-drop.sh", () => {
  const meta = (counts: Record<string, unknown>) => JSON.stringify({ driveFileCounts: counts });
  /** `undefined` means the file does not exist. `status` is the HTTP status of the live fetch. */
  const drop = (live: string | undefined, fresh: string | undefined, status = "200") => {
    const a = join(tmp, "live.json");
    const b = join(tmp, "new.json");
    rmSync(a, { force: true });
    rmSync(b, { force: true });
    if (live !== undefined) writeFileSync(a, live);
    if (fresh !== undefined) writeFileSync(b, fresh);
    return run("drive-drop.sh", [a, b, status]);
  };
  const FIVE = { bylaws: 6, meetings: 40, presentations: 9, letters: 5, neighborhoodPlan: 4 };

  it.each<[string, Record<string, unknown>, Record<string, unknown>]>([
    ["identical counts", FIVE, FIVE],
    ["every root grew", FIVE, { bylaws: 7, meetings: 44, presentations: 10, letters: 6, neighborhoodPlan: 5 }],
    ["exactly half (40 to 20, 4 to 2)", FIVE, { ...FIVE, meetings: 20, neighborhoodPlan: 2 }],
    ["an odd count at the boundary (9 to 5, 5 to 3)", FIVE, { ...FIVE, presentations: 5, letters: 3 }],
    ["a root at 3 files that drops to 1", { ...FIVE, letters: 3 }, { ...FIVE, letters: 1 }],
    ["a root at 3 files that is no longer listed", { ...FIVE, letters: 3 }, { bylaws: 6, meetings: 40, presentations: 9, neighborhoodPlan: 4 }],
    ["a new root appearing", { bylaws: 6 }, { bylaws: 6, meetings: 40 }],
    ["a live site that listed nothing (built without the key)", {}, FIVE],
    ["neither build listed anything", {}, {}],
  ])("exits 0 (HTTP 200, a readable baseline): %s", (_name, live, fresh) => {
    const r = drop(meta(live), meta(fresh));
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["fewer than half (40 to 19)", { ...FIVE, meetings: 19 }, 'drive-drop: "meetings" listed 40 files on the live site and 19 in this build\n'],
    ["a root at 4 files that drops to 1", { ...FIVE, neighborhoodPlan: 1 }, 'drive-drop: "neighborhoodPlan" listed 4 files on the live site and 1 in this build\n'],
    ["5 to 2", { ...FIVE, letters: 2 }, 'drive-drop: "letters" listed 5 files on the live site and 2 in this build\n'],
    [
      "a root that is no longer listed (failed, emptied, or the key is gone)",
      { bylaws: 6, presentations: 9, letters: 5, neighborhoodPlan: 4 },
      'drive-drop: "meetings" listed 40 files on the live site and is not listed in this build\n',
    ],
  ])("exits 1 and names the root and both counts: %s", (_name, fresh, expected) => {
    const r = drop(meta(FIVE), meta(fresh));
    expect(r.code).toBe(1);
    expect(r.out).toBe(expected);
  });

  it("names every root that dropped, one per line", () => {
    const r = drop(meta(FIVE), meta({}));
    expect(r.code).toBe(1);
    expect(r.out.trimEnd().split("\n")).toHaveLength(5);
    expect(r.out).toContain('"bylaws" listed 6 files on the live site and is not listed in this build');
  });

  // Three outcomes of the live fetch. Only a 404 means "there is nothing to compare with".
  it("HTTP 404 is no baseline (nothing published yet, or a site from before this file existed): exits 0, whatever was saved", () => {
    for (const body of [undefined, "", "<!doctype html><title>Page not found</title>", meta(FIVE)]) {
      const r = drop(body, meta({ meetings: 1 }), "404");
      expect(r.code).toBe(0);
      expect(r.out).toContain("no baseline");
      expect(r.out).toContain("HTTP 404");
    }
  });

  it.each(["000", "500", "502", "503", "504", "429", "403", "301", "410", "204"])(
    "HTTP %s is a baseline that could not be read: exits 3, even with a valid file beside it",
    (status) => {
      for (const body of [undefined, "", "<html>Bad gateway</html>", meta(FIVE)]) {
        const r = drop(body, meta(FIVE), status);
        expect(r.code).toBe(3);
        expect(r.out).toBe(`drive-drop: could not read the live site's file counts (HTTP ${status} for build-meta.json)\n`);
      }
    },
  );

  it.each<[string, string | undefined]>([
    ["absent", undefined],
    ["empty", ""],
    ["an HTML page", "<!doctype html><title>Welcome</title>"],
    ["malformed JSON", '{"driveFileCounts":{"meetings":40'],
    ["JSON without driveFileCounts", "{}"],
    ["driveFileCounts that is not an object", '{"driveFileCounts":[40]}'],
    ["a count that is not a non-negative whole number", meta({ meetings: "40" })],
    ["a negative count", meta({ meetings: -1 })],
    ["a fractional count", meta({ meetings: 40.5 })],
    ["JSON null", "null"],
    ["a root name that is not a plain key (it would be printed into the workflow log)", JSON.stringify({ driveFileCounts: { "x\n::error::injected": 9 } })],
  ])("HTTP 200 with a body that is %s could not be read either: exits 3", (_name, live) => {
    const r = drop(live, meta({ meetings: 1 }));
    expect(r.code).toBe(3);
    expect(r.out).toBe("drive-drop: could not read the live site's file counts (HTTP 200, but build-meta.json is not the expected JSON)\n");
    expect(r.out).not.toContain("injected");
  });

  it.each<[string, string | undefined]>([
    ["missing", undefined],
    ["empty", ""],
    ["malformed JSON", '{"driveFileCounts":'],
    ["the wrong shape", '{"counts":{}}'],
    ["holding a bad count", meta({ meetings: "many" })],
    ["holding a root name that is not a plain key", meta({ "two words": 3 })],
  ])("exits 2 when the NEW file is %s, whatever the live site answered", (_name, fresh) => {
    for (const [live, status] of [[meta(FIVE), "200"], [undefined, "404"], [undefined, "503"]] as const) {
      const r = drop(live, fresh, status);
      expect(r.code).toBe(2);
      expect(r.err).toContain("drive-drop:");
      expect(r.out).toBe("");
    }
  });

  it("exits 2 on wrong usage, including a status that is not three digits", () => {
    expect(run("drive-drop.sh").code).toBe(2);
    expect(run("drive-drop.sh", [join(tmp, "one.json")]).code).toBe(2);
    expect(run("drive-drop.sh", ["a", "b"]).code).toBe(2);
    expect(run("drive-drop.sh", ["a", "b", "200", "d"]).code).toBe(2);
    for (const status of ["", "ok", "20", "2000", "200\n"]) {
      const r = drop(meta(FIVE), meta(FIVE), status);
      expect(r.code, JSON.stringify(status)).toBe(2);
      expect(r.err).toContain("HTTP status");
    }
  });
});

describe("deploy-decision.sh", () => {
  const NEW = "a".repeat(64);
  const OTHER = "b".repeat(64);
  const decide = (status: string, body: string | undefined, extra: Record<string, string> = {}) => {
    rmSync(join(tmp, "out.txt"), { force: true });
    const file = join(tmp, "deployed.txt");
    rmSync(file, { force: true });
    if (body !== undefined) writeFileSync(file, body);
    return run("deploy-decision.sh", [], {
      NEW_HASH: NEW,
      DEGRADED: "false",
      DRIVE_DROP: "false",
      DEPLOYED_STATUS: status,
      DEPLOYED_FILE: file,
      GITHUB_OUTPUT: join(tmp, "out.txt"),
      ...extra,
    });
  };
  const outputs = (): string => {
    return spawnSync("cat", [join(tmp, "out.txt")], { encoding: "utf8" }).stdout;
  };

  it("deploys a healthy build when nothing is deployed yet (404)", () => {
    expect(decide("404", "<html>not found</html>").code).toBe(0);
    expect(outputs()).toBe("deploy=true\nreason=changed\n");
  });

  it("deploys when the deployed hash differs", () => {
    expect(decide("200", `${OTHER}\n`).code).toBe(0);
    expect(outputs()).toContain("deploy=true");
  });

  it("deploys when the fetch failed (status 000) and the build is healthy", () => {
    expect(decide("000", undefined).code).toBe(0);
    expect(outputs()).toContain("deploy=true");
  });

  it("deploys when a 200 response is not a hash (e.g. an old site's HTML)", () => {
    expect(decide("200", "<!doctype html><title>old</title>").code).toBe(0);
    expect(outputs()).toContain("deploy=true");
  });

  it("skips without failing when unchanged, tolerating surrounding whitespace", () => {
    const r = decide("200", `  ${NEW}\r\n`);
    expect(r.code).toBe(0);
    expect(outputs()).toBe("deploy=false\nreason=unchanged\n");
  });

  it("does not treat a matching body as unchanged unless the status is 200", () => {
    decide("404", `${NEW}\n`);
    expect(outputs()).toContain("deploy=true");
  });

  // The whole truth table. "Bad" is a degraded build (DEGRADED), a Drive listing drop (DRIVE_DROP=true),
  // or file counts that could not be compared because the live site's could not be read
  // (DRIVE_DROP=unknown): any of them, with no exception for any HTTP status, is a failed run unless
  // allow_degraded is true.
  const SAME: [string, string] = ["200", `${NEW}\n`];
  const DIFFERENT: [string, string] = ["200", `${OTHER}\n`];
  const NOTHING_LIVE: [string, string] = ["404", "<html>Site not found</html>"];
  const UNREACHABLE: [string, undefined] = ["000", undefined];
  const BAD: Array<[string, Record<string, string>]> = [
    ["degraded", { DEGRADED: "true" }],
    ["a Drive listing drop", { DRIVE_DROP: "true" }],
    ["degraded and a Drive listing drop", { DEGRADED: "true", DRIVE_DROP: "true" }],
    ["live file counts that could not be read", { DRIVE_DROP: "unknown" }],
    ["degraded, and live file counts that could not be read", { DEGRADED: "true", DRIVE_DROP: "unknown" }],
  ];

  describe.each(BAD)("%s", (_name, bad) => {
    it.each<[string, [string, string | undefined]]>([
      ["identical to the live site", SAME],
      ["different from the live site", DIFFERENT],
      ["build-hash.txt answers 404 (first deploy, or the old site during DNS cutover)", NOTHING_LIVE],
      ["the live site could not be reached (000)", UNREACHABLE],
    ])("fails and does not deploy: %s", (_case, [status, body]) => {
      const r = decide(status, body, bad);
      expect(r.code).toBe(1);
      expect(r.out).toContain("::error::");
      expect(outputs()).toBe("deploy=false\nreason=degraded-blocked\n");
    });

    it("deploys with a warning when allow_degraded is true and the build differs, whatever the status", () => {
      for (const [status, body] of [DIFFERENT, NOTHING_LIVE, UNREACHABLE]) {
        const r = decide(status, body, { ...bad, ALLOW_DEGRADED: "true" });
        expect(r.code).toBe(0);
        expect(r.out).toContain("::warning::");
        expect(r.out).not.toContain("::error::");
        expect(outputs()).toBe("deploy=true\nreason=degraded-allowed\n");
      }
    });

    it("skips with a warning when allow_degraded is true and the build is identical", () => {
      const r = decide(...SAME, { ...bad, ALLOW_DEGRADED: "true" });
      expect(r.code).toBe(0);
      expect(r.out).toContain("::warning::");
      expect(outputs()).toBe("deploy=false\nreason=unchanged-degraded-allowed\n");
    });

    it("only the exact string true enables allow_degraded", () => {
      for (const allow of ["1", "TRUE", "yes", "", "false"]) {
        expect(decide(...DIFFERENT, { ...bad, ALLOW_DEGRADED: allow }).code, allow).toBe(1);
      }
    });
  });

  it("has no first-deploy exception: no reason other than changed, unchanged, and the degraded three exists", () => {
    const reasons = new Set<string>();
    for (const [status, body] of [SAME, DIFFERENT, NOTHING_LIVE, UNREACHABLE] as Array<[string, string | undefined]>) {
      for (const DEGRADED of ["true", "false"]) {
        for (const DRIVE_DROP of ["true", "false", "unknown"]) {
          for (const ALLOW_DEGRADED of ["true", "false"]) {
            decide(status, body, { DEGRADED, DRIVE_DROP, ALLOW_DEGRADED });
            reasons.add(/reason=(.*)/.exec(outputs())?.[1] ?? "none");
          }
        }
      }
    }
    expect([...reasons].sort()).toEqual(["changed", "degraded-allowed", "degraded-blocked", "unchanged", "unchanged-degraded-allowed"]);
  });

  it("says which kind of problem blocked the deploy", () => {
    expect(decide(...DIFFERENT, { DEGRADED: "true" }).out).toMatch(/unreachable or misconfigured/);
    expect(decide(...DIFFERENT, { DRIVE_DROP: "true" }).out).toMatch(/far fewer files/);
    const both = decide(...DIFFERENT, { DEGRADED: "true", DRIVE_DROP: "true" }).out;
    expect(both).toMatch(/unreachable or misconfigured/);
    expect(both).toMatch(/far fewer files/);
    const unknown = decide(...DIFFERENT, { DRIVE_DROP: "unknown" }).out;
    expect(unknown).toMatch(/could not read the live site's file counts/i);
    expect(unknown).not.toMatch(/far fewer files|unreachable or misconfigured/);
  });

  it.each(["DEGRADED", "DRIVE_DROP"])("requires %s to be exactly one of its values, and writes no output otherwise", (name) => {
    for (const bad of ["", "TRUE", "1", "yes", "Unknown", "maybe"]) {
      const r = decide("200", `${OTHER}\n`, { [name]: bad });
      expect(r.code).toBe(2);
      expect(r.err).toContain(`${name} must be exactly`);
    }
    // "unknown" is a value of DRIVE_DROP only.
    expect(decide("200", `${OTHER}\n`, { DEGRADED: "unknown" }).code).toBe(2);
    expect(outputs()).toBe("");
  });
});

describe("tip-check.sh", () => {
  // A real origin and a real clone in the temp directory; no network.
  const git = (cwd: string, ...args: string[]): string => {
    const r = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=none", "-c", "init.defaultBranch=main", "-c", "commit.gpgsign=false", ...args], {
      cwd,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
    });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
    return r.stdout.trim();
  };
  const commit = (cwd: string, message: string): string => {
    git(cwd, "commit", "--allow-empty", "-m", message);
    return git(cwd, "rev-parse", "HEAD");
  };
  /** An origin with one commit on main, and a clone of it. */
  const repos = () => {
    const origin = join(tmp, "origin");
    const clone = join(tmp, "clone");
    mkdirSync(origin);
    git(origin, "init", "-q");
    const first = commit(origin, "first");
    git(tmp, "clone", "-q", origin, clone);
    return { origin, clone, first };
  };
  const check = (cwd: string, sha: string | undefined) => {
    rmSync(join(tmp, "out.txt"), { force: true });
    const r = spawnSync("bash", [join(scripts, "tip-check.sh")], {
      cwd,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GITHUB_OUTPUT: join(tmp, "out.txt"), ...(sha === undefined ? {} : { GITHUB_SHA: sha }) },
    });
    const output = spawnSync("cat", [join(tmp, "out.txt")], { encoding: "utf8" }).stdout;
    return { code: r.status, out: r.stdout, err: r.stderr, output };
  };

  it("says current=true when the run's commit is the tip of main", () => {
    const { clone, first } = repos();
    const r = check(clone, first);
    expect(r.code).toBe(0);
    expect(r.output).toBe("current=true\n");
    expect(r.out).not.toContain("::notice::");
  });

  it("says current=false, with a notice and exit 0, once main has moved on (a re-run of an old run)", () => {
    const { origin, clone, first } = repos();
    const second = commit(origin, "second");
    const r = check(clone, first);
    expect(r.code).toBe(0);
    expect(r.output).toBe("current=false\n");
    expect(r.out).toContain("::notice::");
    expect(r.out).toContain(first);
    expect(r.out).toContain(second);
    // The newer run itself is current, from the same stale clone: the answer comes from origin.
    expect(check(clone, second).output).toBe("current=true\n");
  });

  it("looks at main only, not at whatever branch moved last", () => {
    const { origin, clone, first } = repos();
    git(origin, "checkout", "-q", "-b", "other");
    commit(origin, "on another branch");
    expect(check(clone, first).output).toBe("current=true\n");
  });

  it("exits 2 with no output when the tip cannot be read", () => {
    const { origin, clone, first } = repos();
    rmSync(origin, { recursive: true, force: true });
    const gone = check(clone, first);
    expect(gone.code).toBe(2);
    expect(gone.output).toBe("");
    expect(gone.out).toContain("::error::");
  });

  it("exits 2 when origin has no main branch", () => {
    const origin = join(tmp, "origin");
    const clone = join(tmp, "clone");
    mkdirSync(origin);
    git(origin, "init", "-q", "-b", "trunk");
    const sha = commit(origin, "first");
    git(tmp, "clone", "-q", origin, clone);
    const r = check(clone, sha);
    expect(r.code).toBe(2);
    expect(r.output).toBe("");
  });

  it("requires GITHUB_SHA", () => {
    const { clone } = repos();
    const r = check(clone, undefined);
    expect(r.code).not.toBe(0);
    expect(r.output).toBe("");
  });
});

describe("check-reproducible.sh", () => {
  // A fake checkout: the real script, a stub dist-hash.sh, and a stub npx on PATH. Never builds anything.
  const check = (digests: [string, string], npx = "exit 0") => {
    mkdirSync(join(tmp, "scripts"));
    mkdirSync(join(tmp, "bin"));
    copyFileSync(join(scripts, "check-reproducible.sh"), join(tmp, "scripts/check-reproducible.sh"));
    writeFileSync(join(tmp, "calls"), "0");
    writeFileSync(
      join(tmp, "scripts/dist-hash.sh"),
      `#!/usr/bin/env bash\nn=$(( $(cat "${tmp}/calls") + 1 )); echo $n > "${tmp}/calls"\nif [ $n = 1 ]; then echo ${digests[0]}; else echo ${digests[1]}; fi\n`,
    );
    writeFileSync(join(tmp, "bin/npx"), `#!/usr/bin/env bash\n${npx}\n`);
    for (const f of ["scripts/dist-hash.sh", "bin/npx"]) chmodSync(join(tmp, f), 0o755);
    const r = spawnSync("bash", [join(tmp, "scripts/check-reproducible.sh")], {
      encoding: "utf8",
      env: { PATH: `${join(tmp, "bin")}:${process.env.PATH ?? ""}` },
    });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };

  it("passes when both digests match", () => {
    const r = check(["aaa", "aaa"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("reproducible: aaa");
  });

  it("fails when a build fails, showing the build log", () => {
    const r = check(["aaa", "aaa"], "echo boom >&2; exit 3");
    expect(r.code).toBe(1);
    expect(r.err).toContain("build 1 failed");
    expect(r.err).toContain("boom");
  });

  it("fails and names both digests when they differ", () => {
    const r = check(["aaa", "bbb"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("aaa vs bbb");
  });
});

describe("lychee-outcome.sh", () => {
  it.each([
    ["0", "clean"],
    ["2", "broken"],
    ["1", "crashed"],
    ["3", "crashed"],
    ["", "crashed"],
    ["137", "crashed"],
  ])("exit code %j is %s", (code, outcome) => {
    const r = run("lychee-outcome.sh", [code]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(`${outcome}\n`);
  });

  it("exits 2 without an argument", () => {
    expect(run("lychee-outcome.sh").code).toBe(2);
  });
});

describe("verify-links.sh preconditions", () => {
  it("exits 2 with a clear message when siteUrl cannot be read", () => {
    mkdirSync(join(tmp, "scripts"));
    mkdirSync(join(tmp, "dist"));
    mkdirSync(join(tmp, "src/content"), { recursive: true });
    copyFileSync(join(scripts, "verify-links.sh"), join(tmp, "scripts/verify-links.sh"));
    writeFileSync(join(tmp, "src/content/resources.yaml"), "");
    writeFileSync(join(tmp, "src/content/settings.yaml"), "siteName: x\n");
    const r = spawnSync("sh", [join(tmp, "scripts/verify-links.sh")], { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("could not read siteUrl");
  });
});
