/**
 * ops/apps-script/calendarTrigger.js runs in Google Apps Script, which cannot be reached from here.
 * This runs the file as written in a sandbox with stand-ins for the two Apps Script services it uses,
 * and checks the requests it would send: which endpoints, which body, and what it does with the answers.
 * Whether GitHub accepts them with the token's one permission is confirmed during setup (testDispatch).
 */
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync("ops/apps-script/calendarTrigger.js", "utf8");
const REPO = "https://api.github.com/repos/therealevanhenry/arlingtonview.org";

type Call = { method: string; url: string; body?: unknown; headers: Record<string, string> };
type Answer = { code: number; text?: string };

/** Loads the script and returns its entry points plus every request it makes. `answer` plays GitHub. */
function load(answer: (call: Call) => Answer, token: string | null = "test-token") {
  const calls: Call[] = [];
  const sandbox = {
    console: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (name: string) => (name === "GITHUB_TOKEN" ? token : null) }) },
    UrlFetchApp: {
      fetch: (url: string, options: { method: string; headers: Record<string, string>; payload?: string; muteHttpExceptions?: boolean }) => {
        const call: Call = { method: options.method.toUpperCase(), url, headers: options.headers, ...(options.payload === undefined ? {} : { body: JSON.parse(options.payload) }) };
        calls.push(call);
        const { code, text = "" } = answer(call);
        return { getResponseCode: () => code, getContentText: () => text };
      },
    },
  };
  createContext(sandbox);
  runInContext(SOURCE, sandbox);
  const fns = sandbox as unknown as Record<"onCalendarUpdated" | "onDailyTick" | "onWeeklyLinkCheck" | "testDispatch", (e?: unknown) => void>;
  return { calls, fns };
}

/** GitHub with the workflow in the given state, accepting everything. */
const github = (state: string) => (call: Call): Answer => (call.method === "GET" ? { code: 200, text: JSON.stringify({ state }) } : { code: 204 });
const summary = (calls: Call[]) => calls.map((c) => `${c.method} ${c.url.replace(REPO, "")}`);

describe("calendarTrigger.js", () => {
  it.each([
    ["onCalendarUpdated", "deploy.yml"],
    ["onDailyTick", "deploy.yml"],
    ["onWeeklyLinkCheck", "links.yml"],
  ] as const)("%s checks that %s is active, then starts it on main through workflow dispatch", (entry, workflow) => {
    const { calls, fns } = load(github("active"));
    fns[entry]({});
    expect(summary(calls)).toEqual([`GET /actions/workflows/${workflow}`, `POST /actions/workflows/${workflow}/dispatches`]);
    expect(calls[1].body).toEqual({ ref: "main" });
  });

  it("switches a disabled workflow back on before starting it", () => {
    for (const state of ["disabled_inactivity", "disabled_manually"]) {
      const { calls, fns } = load(github(state));
      fns.onDailyTick();
      expect(summary(calls), state).toEqual([
        "GET /actions/workflows/deploy.yml",
        "PUT /actions/workflows/deploy.yml/enable",
        "POST /actions/workflows/deploy.yml/dispatches",
      ]);
    }
  });

  it("testDispatch always calls enable, so one run proves the token can read, enable, and start", () => {
    const { calls, fns } = load(github("active"));
    fns.testDispatch();
    expect(summary(calls)).toEqual([
      "PUT /actions/workflows/deploy.yml/enable",
      "GET /actions/workflows/deploy.yml",
      "POST /actions/workflows/deploy.yml/dispatches",
    ]);
  });

  it("uses only endpoints under /actions/workflows: nothing that needs the Contents permission", () => {
    for (const entry of ["onCalendarUpdated", "onDailyTick", "onWeeklyLinkCheck", "testDispatch"] as const) {
      const { calls, fns } = load(github("disabled_inactivity"));
      fns[entry]();
      for (const call of calls) {
        expect(call.url.startsWith(`${REPO}/actions/workflows/`), `${entry}: ${call.url}`).toBe(true);
        // repository_dispatch is POST <repo>/dispatches with an event_type; it needs Contents: write.
        expect(call.url).not.toBe(`${REPO}/dispatches`);
        expect(JSON.stringify(call.body ?? {})).not.toContain("event_type");
      }
      // Never asks for run details or sets workflow inputs: allow_degraded stays at its default, false.
      expect(calls.at(-1)?.body).toEqual({ ref: "main" });
    }
  });

  it("sends the token as a bearer token with the API version the 204 answer belongs to", () => {
    const { calls, fns } = load(github("active"), "tok-123");
    fns.onDailyTick();
    for (const call of calls) {
      expect(call.headers.Authorization).toBe("Bearer tok-123");
      expect(call.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
      expect(call.headers.Accept).toBe("application/vnd.github+json");
    }
  });

  it("throws on any unexpected answer, so Google emails the trigger's owner", () => {
    const rejectPost = (code: number) => (call: Call): Answer => (call.method === "POST" ? { code, text: "Resource not accessible by personal access token" } : github("active")(call));
    for (const code of [201, 202, 301, 400, 401, 403, 404, 422, 500, 503]) {
      const { fns } = load(rejectPost(code));
      expect(() => fns.onDailyTick(), String(code)).toThrow(new RegExp(`Start deploy\\.yml failed: HTTP ${code}`));
    }
    const noRead = load((call) => (call.method === "GET" ? { code: 403 } : { code: 204 }));
    expect(() => noRead.fns.onDailyTick()).toThrow(/Get deploy\.yml failed: HTTP 403/);
    expect(summary(noRead.calls)).toEqual(["GET /actions/workflows/deploy.yml"]);
    const noEnable = load((call) => (call.method === "GET" ? { code: 200, text: '{"state":"disabled_inactivity"}' } : call.method === "PUT" ? { code: 403 } : { code: 204 }));
    expect(() => noEnable.fns.onDailyTick()).toThrow(/Enable deploy\.yml failed: HTTP 403/);
    expect(summary(noEnable.calls)).not.toContain("POST /actions/workflows/deploy.yml/dispatches");
  });

  it("takes 204 or 200 for a started run: a newer API version answers 200 with the run's details", () => {
    // Pinned to 2022-11-28, GitHub answers 204 with no body. Under 2026-03-10 it answers 200 with a
    // body. Either way the run has started, and a started run must not be reported as a failure.
    const startedWith = (code: number, text: string) => (call: Call): Answer => (call.method === "POST" ? { code, text } : github("active")(call));
    for (const [code, text] of [[204, ""], [200, '{"workflow_run_id":1,"run_url":"https://api.github.com/x","html_url":"https://github.com/x"}']] as const) {
      for (const entry of ["onCalendarUpdated", "onDailyTick", "onWeeklyLinkCheck", "testDispatch"] as const) {
        const { calls, fns } = load(startedWith(code, text));
        expect(() => fns[entry](), `${entry} ${code}`).not.toThrow();
        expect(calls.at(-1)?.method).toBe("POST");
      }
    }
    // The other two calls keep their one expected answer.
    const getAnswers204 = load((call) => (call.method === "GET" ? { code: 204 } : { code: 204 }));
    expect(() => getAnswers204.fns.onDailyTick()).toThrow(/Get deploy\.yml failed: HTTP 204/);
    const enableAnswers200 = load((call) => (call.method === "GET" ? { code: 200, text: '{"state":"disabled_inactivity"}' } : call.method === "PUT" ? { code: 200 } : { code: 204 }));
    expect(() => enableAnswers200.fns.onDailyTick()).toThrow(/Enable deploy\.yml failed: HTTP 200/);
  });

  it("throws before any request when the token is not set", () => {
    const { calls, fns } = load(github("active"), null);
    expect(() => fns.onDailyTick()).toThrow(/GITHUB_TOKEN is not set/);
    expect(calls).toEqual([]);
  });
});
