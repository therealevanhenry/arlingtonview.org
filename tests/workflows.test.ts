/** Rules the four workflow files must keep. They are read as YAML at test time; nothing here runs a workflow. */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

const DIR = ".github/workflows";
type Step = { id?: string; name?: string; run?: string; if?: string; env?: Record<string, string>; uses?: string; with?: Record<string, unknown> };
type Job = { "runs-on"?: string; needs?: string; if?: string; outputs?: Record<string, string>; steps?: Step[] };
type Workflow = { on: Record<string, unknown>; jobs: Record<string, Job> };
const files = readdirSync(DIR).filter((f) => f.endsWith(".yml")).sort();
const workflows = files.map((file) => ({ file, text: readFileSync(join(DIR, file), "utf8"), yaml: parse(readFileSync(join(DIR, file), "utf8")) as Workflow }));
const one = (file: string) => workflows.find((w) => w.file === file)!;

describe("workflow files", () => {
  it("are the four the documentation names", () => {
    expect(files).toEqual(["browsers.yml", "ci.yml", "deploy.yml", "links.yml"]);
  });

  it("pin every job's runner to ubuntu-24.04, with the reason beside it", () => {
    for (const { file, text, yaml } of workflows) {
      for (const [name, job] of Object.entries(yaml.jobs)) expect(job["runs-on"], `${file}: jobs.${name}.runs-on`).toBe("ubuntu-24.04");
      expect(text, file).not.toContain("ubuntu-latest\n");
      expect(text, `${file}: the comment that explains the pin`).toContain("# Pinned (not ubuntu-latest): latest moves to Ubuntu 26 on 2026-10-19");
    }
  });

  it("have no repository_dispatch trigger: that event needs a token that can write repository contents", () => {
    for (const { file, yaml, text } of workflows) {
      expect(Object.keys(yaml.on), file).not.toContain("repository_dispatch");
      expect(text, file).not.toMatch(/^\s*repository_dispatch:/m);
    }
  });

  it("keep workflow_dispatch on the two workflows the Apps Script starts, and allow_degraded off by default", () => {
    for (const file of ["deploy.yml", "links.yml"]) expect(Object.keys(one(file).yaml.on), file).toContain("workflow_dispatch");
    const inputs = (one("deploy.yml").yaml.on.workflow_dispatch as { inputs: Record<string, { type: string; default: unknown }> }).inputs;
    expect(inputs.allow_degraded).toMatchObject({ type: "boolean", default: false });
  });

  it("schedule nothing at the top of the hour, when GitHub's scheduler is most delayed", () => {
    const crons = workflows.flatMap(({ file, yaml }) => ((yaml.on.schedule as Array<{ cron: string }> | undefined) ?? []).map((s) => ({ file, cron: s.cron })));
    expect(crons.map((c) => c.file).sort()).toEqual(["deploy.yml", "links.yml"]);
    for (const { file, cron } of crons) {
      const [minute] = cron.split(" ");
      expect(Number(minute), `${file}: ${cron}`).toBeGreaterThan(0);
      expect(cron.split(" "), `${file}: ${cron}`).toHaveLength(5);
    }
  });

  it("pin every action outside the actions/ organization to a full commit SHA, with its version in a comment", () => {
    const uses = workflows.flatMap(({ file, text }) => [...text.matchAll(/^\s*(?:- )?uses:\s*(\S+)(.*)$/gm)].map((m) => ({ file, ref: m[1], rest: m[2] })));
    expect(uses.length).toBeGreaterThan(8);
    const thirdParty = uses.filter((u) => !u.ref.startsWith("actions/"));
    expect(thirdParty.map((u) => u.ref.split("@")[0])).toEqual(["lycheeverse/lychee-action"]);
    for (const u of thirdParty) {
      expect(u.ref, u.file).toMatch(/@[0-9a-f]{40}$/);
      expect(u.rest, `${u.file}: ${u.ref}`).toMatch(/#\s*v\d+\.\d+\.\d+/);
    }
  });

  it("pin the lychee binary through the action's lycheeVersion input", () => {
    const steps = Object.values(one("links.yml").yaml.jobs).flatMap((j) => j.steps ?? []);
    const lychee = steps.find((s) => s.uses?.startsWith("lycheeverse/lychee-action@"));
    expect(lychee?.with?.lycheeVersion).toMatch(/^v\d+\.\d+\.\d+$/);
  });
});

/**
 * The shell written inside deploy.yml, run as written. The scripts it calls have their own tests
 * (tests/scripts.test.ts); this covers the glue between them: that each step turns its script's exit
 * code into the right output, and that the outputs reach the decision. GitHub's expressions cannot be
 * evaluated here, so the test checks that the env mapping is the expected one and then applies it.
 */
describe("deploy.yml: the health, drop, and decide steps, run as GitHub runs them", () => {
  const build = one("deploy.yml").yaml.jobs.build;
  const step = (id: string): Step => {
    const found = (build.steps ?? []).find((s) => s.id === id);
    if (!found?.run) throw new Error(`deploy.yml: no run step with id "${id}"`);
    return found;
  };
  const NEW = "a".repeat(64);
  const OLD = "b".repeat(64);
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "avca-workflow-"));
    symlinkSync(resolve("scripts"), join(dir, "scripts"));
    mkdirSync(join(dir, "dist"));
    mkdirSync(join(dir, "tmp"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** Runs one step's script the way a runner does (`bash -eo pipefail`), and returns its outputs. */
  function runStep(id: string, env: Record<string, string> = {}) {
    const out = join(dir, `${id}.out`);
    writeFileSync(out, "");
    const r = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", step(id).run as string], {
      cwd: dir,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", RUNNER_TEMP: join(dir, "tmp"), GITHUB_OUTPUT: out, ...env },
    });
    const outputs = Object.fromEntries(readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => l.split("=") as [string, string]));
    return { code: r.status, stdout: r.stdout, outputs };
  }

  /**
   * A stand-in for curl on PATH, so the fetch step runs as written without a network. It answers the
   * two URLs the step asks for from `live`: `-o <file>` receives the body, `-w '%{http_code}'` the
   * status. A status of "000" plays a request that never got an answer (curl's own exit code 28).
   */
  type Live = { hash?: [status: string, body?: string]; meta?: [status: string, body?: string] };
  function fakeCurl(live: Live): string {
    const bin = join(dir, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(dir, "curl-calls.txt"), "");
    // Each answer's body sits in a file the stand-in copies, so no body ever passes through shell quoting.
    const answer = (which: "hash" | "meta") => {
      const [status, body] = live[which] ?? ["404", "<html>Page not found</html>"];
      const bodyFile = join(dir, `live-${which}.body`);
      if (body !== undefined) writeFileSync(bodyFile, body);
      return `${body === undefined ? ":" : `cat "${bodyFile}" > "$out"`}; printf '%s' ${status}; ${status === "000" ? "exit 28" : "exit 0"}`;
    };
    writeFileSync(
      join(bin, "curl"),
      `#!/usr/bin/env bash
printf '%s\n' "$*" >> "${dir}/curl-calls.txt"
out=/dev/null
args=("$@")
for ((i = 0; i < \${#args[@]}; i++)); do [ "\${args[i]}" = "-o" ] && out=\${args[i+1]}; done
url=\${args[\${#args[@]}-1]}
case "$url" in
  */build-hash.txt\?*) ${answer("hash")} ;;
  */build-meta.json\?*) ${answer("meta")} ;;
  *) echo "unexpected URL: $url" >&2; exit 2 ;;
esac
`,
    );
    chmodSync(join(bin, "curl"), 0o755);
    return bin;
  }

  const metaJson = (files: Record<string, number>, meetings?: number) =>
    JSON.stringify({ driveFileCounts: files, ...(meetings === undefined ? {} : { meetingCount: meetings }) });

  /** One whole decision: a build log, the new build-meta.json, what the live site answers, and the checkbox. */
  function decide(opts: {
    health: string | null;
    /** The live site's file counts (HTTP 200). Omit, with `meta` unset, for a live site without the file (HTTP 404). */
    live?: Record<string, number>;
    /** The live site's and the new build's meetingCount; omitted means the calendar was not read. */
    liveMeetings?: number;
    freshMeetings?: number;
    /** Overrides the live build-meta.json answer: [status, body]. */
    meta?: [string, string?];
    fresh: Record<string, number>;
    liveHash?: string;
    allow?: boolean;
  }) {
    writeFileSync(join(dir, "tmp/build.log"), opts.health === null ? "12:00 [build] done\n" : `12:00 [build] start\n[site-data] health: ${opts.health}\n`);
    writeFileSync(join(dir, "dist/build-meta.json"), metaJson(opts.fresh, opts.freshMeetings));
    const bin = fakeCurl({
      hash: opts.liveHash ? ["200", `${opts.liveHash}\n`] : undefined,
      meta: opts.meta ?? (opts.live ? ["200", metaJson(opts.live, opts.liveMeetings)] : undefined),
    });
    const fetched = runStep("deployed", { PATH: `${bin}:${process.env.PATH ?? ""}`, BASE_URL: "https://live.example.org/base", GITHUB_RUN_ID: "7", GITHUB_RUN_ATTEMPT: "1" });
    // The fetch step never fails the run by itself: what it could not get is a status for the steps after it.
    if (fetched.code !== 0) throw new Error(`the fetch step exited ${fetched.code}: ${fetched.stdout}`);
    const health = runStep("health");
    if (health.code !== 0) return { failedAt: "health", fetched, health };
    const drop = runStep("drop", { LIVE_META_STATUS: fetched.outputs.meta_status ?? "", LIVE_HASH_STATUS: fetched.outputs.hash_status ?? "" });
    if (drop.code !== 0) return { failedAt: "drop", fetched, health, drop };
    const decision = runStep("decide", {
      NEW_HASH: NEW,
      DEPLOYED_STATUS: fetched.outputs.hash_status ?? "",
      DEPLOYED_FILE: join(dir, "tmp/deployed-hash.txt"),
      DEGRADED: health.outputs.degraded ?? "",
      DRIVE_DROP: drop.outputs.dropped ?? "",
      ALLOW_DEGRADED: String(opts.allow === true),
    });
    return { fetched, health, drop, decision };
  }
  const FIVE = { bylaws: 6, meetings: 40, presentations: 9, letters: 5, neighborhoodPlan: 4 };

  it("wires the two checks into the decision exactly as the test applies them", () => {
    expect(step("decide").env).toMatchObject({
      DEGRADED: "${{ steps.health.outputs.degraded }}",
      DRIVE_DROP: "${{ steps.drop.outputs.dropped }}",
      ALLOW_DEGRADED: "${{ inputs.allow_degraded == true }}",
    });
    expect(step("decide").env).toMatchObject({ DEPLOYED_STATUS: "${{ steps.deployed.outputs.hash_status }}", DEPLOYED_FILE: "${{ runner.temp }}/deployed-hash.txt" });
    expect(step("drop").env).toEqual({
      LIVE_META_STATUS: "${{ steps.deployed.outputs.meta_status }}",
      LIVE_HASH_STATUS: "${{ steps.deployed.outputs.hash_status }}",
    });
    expect(step("drop").run).toContain(
      'scripts/drive-drop.sh "$RUNNER_TEMP/deployed-meta.json" dist/build-meta.json "$LIVE_META_STATUS" "$LIVE_HASH_STATUS" "$RUNNER_TEMP/deployed-hash.txt"',
    );
    // The record and upload steps, and the deploy job, hang on the decision alone.
    const gated = (build.steps ?? []).filter((s) => s.if !== undefined).map((s) => s.if);
    expect(gated).toEqual(["steps.decide.outputs.deploy == 'true'", "steps.decide.outputs.deploy == 'true'"]);
    expect(build.outputs).toEqual({ deploy: "${{ steps.decide.outputs.deploy }}" });
    expect(one("deploy.yml").yaml.jobs.deploy).toMatchObject({ needs: "build", if: "needs.build.outputs.deploy == 'true'" });
    expect(build).toMatchObject({ needs: "tip", if: "needs.tip.outputs.current == 'true'" });
  });

  it("fetches the live file counts with bounded retries, and the hash and the counts from the live base URL", () => {
    const run = step("deployed").run as string;
    const metaFetch = run.split("\n").find((l) => l.includes("build-meta.json") && l.includes("curl")) ?? "";
    expect(metaFetch).toContain("--retry 3");
    expect(metaFetch).toContain("--retry-all-errors");
    expect(metaFetch).toMatch(/--retry-max-time \d+/);
    expect(metaFetch).toMatch(/--max-time \d+/);
    // --fail would make a 404 an error (retried, and indistinguishable from an outage).
    expect(metaFetch).not.toContain("--fail");
    const r = decide({ health: "ok", live: FIVE, fresh: FIVE, liveHash: OLD });
    expect(r.fetched.outputs).toEqual({ hash_status: "200", meta_status: "200" });
    const calls = readFileSync(join(dir, "curl-calls.txt"), "utf8").trim().split("\n");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/https:\/\/live\.example\.org\/base\/build-hash\.txt\?run=7-1$/);
    expect(calls[1]).toMatch(/https:\/\/live\.example\.org\/base\/build-meta\.json\?run=7-1$/);
    expect(readFileSync(join(dir, "tmp/deployed-meta.json"), "utf8")).toBe(JSON.stringify({ driveFileCounts: FIVE }));
  });

  it("healthy and changed: deploys", () => {
    const r = decide({ health: "ok", live: FIVE, fresh: FIVE, liveHash: OLD });
    expect(r.health.outputs).toEqual({ degraded: "false" });
    expect(r.drop?.outputs).toEqual({ dropped: "false" });
    expect(r.decision?.outputs).toEqual({ deploy: "true", reason: "changed" });
  });

  it("healthy and unchanged: skips, green", () => {
    const r = decide({ health: "ok", live: FIVE, fresh: FIVE, liveHash: NEW });
    expect(r.decision?.code).toBe(0);
    expect(r.decision?.outputs).toEqual({ deploy: "false", reason: "unchanged" });
  });

  it("no key, and the live site has no build-meta.json (HTTP 404, no baseline): warns and deploys", () => {
    const r = decide({ health: "unconfigured (no API key)", fresh: {} });
    expect(r.fetched.outputs).toEqual({ hash_status: "404", meta_status: "404" });
    expect(r.drop?.stdout).toContain("no baseline");
    expect(r.drop?.outputs).toEqual({ dropped: "false" });
    expect(r.health.stdout).toContain("::warning::");
    expect(r.health.stdout).toContain("no API key");
    expect(r.health.outputs).toEqual({ degraded: "false" });
    expect(r.decision?.outputs).toEqual({ deploy: "true", reason: "changed" });
  });

  it("no key, but the live site lists files: the missing roots are a drop, and the run fails", () => {
    const r = decide({ health: "unconfigured (no API key)", live: FIVE, fresh: {}, liveHash: OLD });
    expect(r.drop?.outputs).toEqual({ dropped: "true" });
    expect(r.drop?.stdout).toContain('::warning::drive-drop: "meetings" listed 40 files on the live site and is not listed in this build');
    expect(r.decision?.code).toBe(1);
    expect(r.decision?.outputs).toEqual({ deploy: "false", reason: "degraded-blocked" });
  });

  it.each<[string, [string, string?]]>([
    ["a 503 that outlasts the retries", ["503", "Service Unavailable"]],
    ["a 502", ["502", "<html>Bad gateway</html>"]],
    ["no answer at all (curl prints 000 and exits non-zero)", ["000"]],
    ["HTTP 200 with a page in place of the JSON", ["200", "<!doctype html><title>Sign in</title>"]],
    ["HTTP 200 with JSON of another shape", ["200", '{"counts":{"meetings":40}}']],
    ["HTTP 200 with an empty body", ["200", ""]],
  ])("the live file counts could not be read (%s): a healthy, changed build still fails", (_name, meta) => {
    const r = decide({ health: "ok", meta, fresh: FIVE, liveHash: OLD });
    expect(r.fetched.outputs.meta_status).toBe(meta[0]);
    expect(r.health.outputs).toEqual({ degraded: "false" });
    expect(r.drop?.code).toBe(0);
    expect(r.drop?.outputs).toEqual({ dropped: "unknown" });
    expect(r.drop?.stdout).toContain("::warning::drive-drop: could not read the live site's file and meeting counts");
    expect(r.decision?.code).toBe(1);
    expect(r.decision?.stdout).toMatch(/::error::Could not read the live site's file and meeting counts/);
    expect(r.decision?.outputs).toEqual({ deploy: "false", reason: "degraded-blocked" });
    // The same build goes out with the checkbox ticked, and only then.
    const allowed = decide({ health: "ok", meta, fresh: FIVE, liveHash: OLD, allow: true });
    expect(allowed.decision?.outputs).toEqual({ deploy: "true", reason: "degraded-allowed" });
    expect(allowed.decision?.stdout).toContain("::warning::");
  });

  it("the live file counts could not be read and the build is identical: still red, so the fault is seen", () => {
    const r = decide({ health: "ok", meta: ["503"], fresh: FIVE, liveHash: NEW });
    expect(r.decision?.code).toBe(1);
    expect(r.decision?.outputs).toEqual({ deploy: "false", reason: "degraded-blocked" });
  });

  it("a failed hash fetch alone changes nothing: the build counts as different, and deploys if healthy", () => {
    const bin = fakeCurl({ hash: ["000"], meta: ["200", JSON.stringify({ driveFileCounts: FIVE })] });
    const fetched = runStep("deployed", { PATH: `${bin}:${process.env.PATH ?? ""}`, BASE_URL: "https://live.example.org", GITHUB_RUN_ID: "7", GITHUB_RUN_ATTEMPT: "2" });
    expect(fetched.code).toBe(0);
    expect(fetched.outputs).toEqual({ hash_status: "000", meta_status: "200" });
  });

  it.each([
    ["a Drive HTTP error", "degraded (drive meetings: HTTP 403)", { bylaws: 6, presentations: 9, letters: 5, neighborhoodPlan: 4 }],
    ["an empty root", "degraded (drive letters: empty listing)", { bylaws: 6, meetings: 40, presentations: 9, neighborhoodPlan: 4 }],
    ["a calendar failure", "degraded (calendar: HTTP 503)", FIVE],
  ])("%s: fails, even on a first deploy (404) and even when identical", (_name, health, fresh) => {
    for (const liveHash of [undefined, OLD, NEW]) {
      const r = decide({ health, live: liveHash ? FIVE : undefined, fresh, liveHash });
      expect(r.health.outputs).toEqual({ degraded: "true" });
      expect(r.decision?.code).toBe(1);
      expect(r.decision?.outputs).toEqual({ deploy: "false", reason: "degraded-blocked" });
    }
  });

  it("a root that lost more than half its files: healthy by the log, still fails", () => {
    const r = decide({ health: "ok", live: FIVE, fresh: { ...FIVE, meetings: 12 }, liveHash: OLD });
    expect(r.health.outputs).toEqual({ degraded: "false" });
    expect(r.drop?.outputs).toEqual({ dropped: "true" });
    expect(r.decision?.code).toBe(1);
    expect(r.decision?.stdout).toContain("far fewer");
  });

  it("the live site has a build hash but no build-meta.json (404): the baseline is unknown, not absent, and the run fails", () => {
    for (const liveHash of [OLD, NEW]) {
      const r = decide({ health: "ok", fresh: FIVE, freshMeetings: 13, liveHash });
      expect(r.fetched.outputs).toEqual({ hash_status: "200", meta_status: "404" });
      expect(r.drop?.outputs).toEqual({ dropped: "unknown" });
      expect(r.drop?.stdout).toContain("build-hash.txt is published, but build-meta.json answered HTTP 404");
      expect(r.decision?.code).toBe(1);
      expect(r.decision?.outputs).toEqual({ deploy: "false", reason: "degraded-blocked" });
    }
    const allowed = decide({ health: "ok", fresh: FIVE, freshMeetings: 13, liveHash: OLD, allow: true });
    expect(allowed.decision?.outputs).toEqual({ deploy: "true", reason: "degraded-allowed" });
  });

  it("nothing is published at the live address (404 for both files): no baseline, and a healthy build deploys", () => {
    const r = decide({ health: "ok", fresh: FIVE, freshMeetings: 13 });
    expect(r.fetched.outputs).toEqual({ hash_status: "404", meta_status: "404" });
    expect(r.drop?.stdout).toContain("no baseline");
    expect(r.drop?.outputs).toEqual({ dropped: "false" });
    expect(r.decision?.outputs).toEqual({ deploy: "true", reason: "changed" });
  });

  it("an emptied calendar: reachable, healthy by the log, far fewer meetings than the live site, and the run fails", () => {
    const r = decide({ health: "ok", live: FIVE, liveMeetings: 13, fresh: FIVE, freshMeetings: 0, liveHash: OLD });
    expect(r.health.outputs).toEqual({ degraded: "false" });
    expect(r.drop?.outputs).toEqual({ dropped: "true" });
    expect(r.drop?.stdout).toContain("::warning::drive-drop: the calendar listed 13 meetings on the live site and 0 in this build");
    expect(r.decision?.code).toBe(1);
    expect(r.decision?.stdout).toMatch(/A Drive folder or the calendar lists far fewer/);
    expect(r.decision?.outputs).toEqual({ deploy: "false", reason: "degraded-blocked" });
    const allowed = decide({ health: "ok", live: FIVE, liveMeetings: 13, fresh: FIVE, freshMeetings: 0, liveHash: OLD, allow: true });
    expect(allowed.decision?.outputs).toEqual({ deploy: "true", reason: "degraded-allowed" });
  });

  it("a blanked calendarId over a live site that recorded meetings: unconfigured by the log, a drop by the counts", () => {
    const r = decide({ health: "unconfigured (calendarId is blank)", live: FIVE, liveMeetings: 13, fresh: FIVE, liveHash: OLD });
    expect(r.health.outputs).toEqual({ degraded: "false" });
    expect(r.drop?.stdout).toContain("the calendar listed 13 meetings on the live site and was not read in this build");
    expect(r.decision?.outputs).toEqual({ deploy: "false", reason: "degraded-blocked" });
  });

  it("the ordinary month: a meeting ends, the count moves by one, nothing is flagged", () => {
    const r = decide({ health: "ok", live: FIVE, liveMeetings: 13, fresh: FIVE, freshMeetings: 14, liveHash: OLD });
    expect(r.drop?.outputs).toEqual({ dropped: "false" });
    expect(r.decision?.outputs).toEqual({ deploy: "true", reason: "changed" });
  });

  it("allow_degraded lets a degraded build or a drop through, with a warning", () => {
    const degraded = decide({ health: "degraded (drive meetings: timeout)", live: FIVE, fresh: FIVE, liveHash: OLD, allow: true });
    expect(degraded.decision?.outputs).toEqual({ deploy: "true", reason: "degraded-allowed" });
    const dropped = decide({ health: "ok", live: FIVE, fresh: { ...FIVE, meetings: 12 }, liveHash: OLD, allow: true });
    expect(dropped.decision?.outputs).toEqual({ deploy: "true", reason: "degraded-allowed" });
    expect(dropped.decision?.stdout).toContain("::warning::");
  });

  it("a missing or repeated health line fails at the health step, before any decision, whatever the checkbox says", () => {
    for (const health of [null, "ok\n[site-data] health: ok"]) {
      const r = decide({ health, live: FIVE, fresh: FIVE, liveHash: OLD, allow: true });
      expect(r.failedAt).toBe("health");
      expect(r.health.code).toBe(2);
      expect(r.health.outputs).toEqual({});
      expect(r.health.stdout).toContain("::error::");
    }
  });

  it("a build without build-meta.json fails at the drop step, whatever the live site answered", () => {
    writeFileSync(join(dir, "tmp/build.log"), "[site-data] health: ok\n");
    expect(runStep("health").code).toBe(0);
    for (const status of ["200", "404", "503"]) {
      const drop = runStep("drop", { LIVE_META_STATUS: status, LIVE_HASH_STATUS: "404" });
      expect(drop.code, status).toBe(2);
      expect(drop.outputs).toEqual({});
    }
  });

  it("a missing fetch status fails at the drop step: an absent output is never read as 'no baseline'", () => {
    writeFileSync(join(dir, "dist/build-meta.json"), JSON.stringify({ driveFileCounts: FIVE }));
    for (const env of [{ LIVE_META_STATUS: "", LIVE_HASH_STATUS: "404" }, { LIVE_META_STATUS: "404", LIVE_HASH_STATUS: "" }]) {
      const drop = runStep("drop", env);
      expect(drop.code).toBe(2);
      expect(drop.outputs).toEqual({});
    }
  });
});
