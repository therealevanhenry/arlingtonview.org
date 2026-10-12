/** Rules the four workflow files must keep. They are read as YAML at test time; nothing here runs a workflow. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const DIR = ".github/workflows";
type Step = { uses?: string; with?: Record<string, unknown> };
type Job = { "runs-on"?: string; steps?: Step[] };
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
