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
  const health = (log: string) => {
    const file = join(tmp, "build.log");
    writeFileSync(file, log);
    return run("build-health.sh", [file]);
  };
  const drive = (reason: string) => `[drive] folder "abc123" not listed: ${reason}; falling back to a link\n`;

  it("is healthy for a clean log", () => {
    expect(health("12:00 [build] 31 page(s) built\n").code).toBe(0);
  });

  it.each(["no API key", "no folder ID", "offline"])("ignores a [drive] line with reason %s", (reason) => {
    expect(health(drive(reason)).code).toBe(0);
  });

  it.each(["HTTP 403", "HTTP 500", "timeout", "network error", "invalid response", "too many pages", "unexpected error"])(
    "is degraded for a [drive] line with reason %s, and prints it",
    (reason) => {
      const r = health(`before\n${drive(reason)}after\n`);
      expect(r.code).toBe(1);
      expect(r.out).toBe(drive(reason));
    },
  );

  it("matches a warning that Astro's progress output left in the middle of a line", () => {
    const line = `18:03:47   ├─ /about/history/index.html${drive("HTTP 403")}`;
    expect(health(line).code).toBe(1);
    expect(health(`18:03:47   ├─ /about/history/index.html${drive("no API key")}`).code).toBe(0);
  });

  it("is degraded for a [calendar] line", () => {
    const line = "[calendar] not loaded: HTTP 503; the meetings list will be empty\n";
    const r = health(line);
    expect(r.code).toBe(1);
    expect(r.out).toBe(line);
  });

  it("prints only the offending lines when benign and bad lines are mixed", () => {
    const r = health(drive("no API key") + drive("HTTP 403") + drive("offline"));
    expect(r.code).toBe(1);
    expect(r.out).toBe(drive("HTTP 403"));
  });

  it("does not fail open on a log containing a NUL byte", () => {
    const r = health(`before\0\n${drive("HTTP 403")}`);
    expect(r.code).toBe(1);
    expect(r.out).toContain("HTTP 403");
  });

  it("only matches the calendar line that data.ts emits", () => {
    expect(health("[calendar] something else entirely\n").code).toBe(0);
    expect(health("[calendar] not loaded: timeout; the meetings list will be empty\n").code).toBe(1);
  });

  it("exits 2 on missing file or wrong usage", () => {
    expect(run("build-health.sh", [join(tmp, "missing.log")]).code).toBe(2);
    expect(run("build-health.sh").code).toBe(2);
  });
});

describe("deploy-decision.sh", () => {
  const NEW = "a".repeat(64);
  const OTHER = "b".repeat(64);
  const decide = (status: string, body: string | undefined, extra: Record<string, string> = {}) => {
    rmSync(join(tmp, "out.txt"), { force: true });
    const file = join(tmp, "deployed.txt");
    if (body !== undefined) writeFileSync(file, body);
    return run("deploy-decision.sh", [], {
      NEW_HASH: NEW,
      DEGRADED: "false",
      DEPLOYED_STATUS: status,
      DEPLOYED_FILE: file,
      GITHUB_OUTPUT: join(tmp, "out.txt"),
      ...extra,
    });
  };
  const outputs = (): string => {
    return spawnSync("cat", [join(tmp, "out.txt")], { encoding: "utf8" }).stdout;
  };

  it("deploys when nothing is deployed yet (404)", () => {
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

  it("fails a degraded build even when it is identical to the live site", () => {
    const r = decide("200", `${NEW}\n`, { DEGRADED: "true" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("::error::");
    expect(outputs()).toBe("deploy=false\nreason=degraded-blocked\n");
  });

  it("skips a degraded identical build with a warning when allow_degraded is true", () => {
    const r = decide("200", `${NEW}\n`, { DEGRADED: "true", ALLOW_DEGRADED: "true" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("::warning::");
    expect(outputs()).toBe("deploy=false\nreason=unchanged-degraded-allowed\n");
  });

  it("requires DEGRADED to be exactly true or false, and writes no output otherwise", () => {
    for (const bad of ["", "TRUE", "1", "yes"]) {
      const r = decide("200", `${OTHER}\n`, { DEGRADED: bad });
      expect(r.code).toBe(2);
      expect(r.err).toContain("DEGRADED must be exactly");
    }
    expect(outputs()).toBe("");
  });

  it("fails and does not deploy a degraded build over a live site", () => {
    const r = decide("200", `${OTHER}\n`, { DEGRADED: "true" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("::error::");
    expect(outputs()).toBe("deploy=false\nreason=degraded-blocked\n");
  });

  it("fails on a degraded build when the status check itself failed (000)", () => {
    expect(decide("000", undefined, { DEGRADED: "true" }).code).toBe(1);
  });

  it("deploys a degraded build when allow_degraded is true, with a warning", () => {
    const r = decide("200", `${OTHER}\n`, { DEGRADED: "true", ALLOW_DEGRADED: "true" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("::warning::");
    expect(outputs()).toBe("deploy=true\nreason=degraded-allowed\n");
  });

  it("deploys a degraded first build (404) with a warning", () => {
    const r = decide("404", "nope", { DEGRADED: "true" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("::warning::");
    expect(outputs()).toBe("deploy=true\nreason=degraded-first-deploy\n");
  });

  it("only the exact string true enables allow_degraded", () => {
    expect(decide("200", `${OTHER}\n`, { DEGRADED: "true", ALLOW_DEGRADED: "1" }).code).toBe(1);
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
