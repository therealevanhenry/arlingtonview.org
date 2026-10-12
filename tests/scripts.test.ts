import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
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

  it("is the same for an identical copy in another location and under another locale", () => {
    const a = join(tmp, "one/deeper/dist");
    const b = join(tmp, "two/dist");
    site(a);
    site(b);
    expect(hash(b, { LC_ALL: "tr_TR.UTF-8" }).out).toBe(hash(a).out);
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
    expect(hash(tmp).out).not.toBe(changed);
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

  it("exits 2 on missing file or wrong usage", () => {
    expect(run("build-health.sh", [join(tmp, "missing.log")]).code).toBe(2);
    expect(run("build-health.sh").code).toBe(2);
  });
});

describe("deploy-decision.sh", () => {
  const NEW = "a".repeat(64);
  const OTHER = "b".repeat(64);
  const decide = (status: string, body: string | undefined, extra: Record<string, string> = {}) => {
    const file = join(tmp, "deployed.txt");
    if (body !== undefined) writeFileSync(file, body);
    return run("deploy-decision.sh", [], {
      NEW_HASH: NEW,
      DEPLOYED_STATUS: status,
      DEPLOYED_FILE: file,
      GITHUB_OUTPUT: join(tmp, "out.txt"),
      ...extra,
    });
  };
  const outputs = (): string => {
    const r = spawnSync("cat", [join(tmp, "out.txt")], { encoding: "utf8" });
    return r.stdout;
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

  it("unchanged wins over degraded, with a warning", () => {
    const r = decide("200", `${NEW}\n`, { DEGRADED: "true" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("::warning::");
    expect(outputs()).toContain("deploy=false");
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
