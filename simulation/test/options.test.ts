import { afterEach, describe, expect, it } from "vitest";
import { parseOptions, randomSeed, replayOptions } from "../src/options";

afterEach(() => {
  delete process.env.SIM_RATE;
  delete process.env.SIM_AUTH;
});

describe("parseOptions", () => {
  it("has defaults and reads flags", () => {
    const o = parseOptions([
      "run",
      "--seed",
      "abc",
      "--duration",
      "2m",
      "--rate",
      "30",
      "--log",
      "-",
      "--no-plan-limit",
    ]);
    expect(o).toMatchObject({
      command: "run",
      seed: "abc",
      durationMs: 120_000,
      rate: 30,
      logPath: null,
      planLimit: false,
      concurrency: 8,
    });
    expect(o.appUrl).toBe("http://localhost:8097");
  });

  it("takes defaults from the environment, flags win", () => {
    process.env.SIM_RATE = "12";
    expect(parseOptions([]).rate).toBe(12);
    expect(parseOptions(["--rate", "5"]).rate).toBe(5);
  });

  it("signs in with dev tokens unless asked for staging's simulation tokens", () => {
    expect(parseOptions([]).auth).toBe("dev");
    expect(parseOptions(["--auth", "simulation-token"]).auth).toBe("simulation-token");
    process.env.SIM_AUTH = "simulation-token";
    expect(parseOptions([]).auth).toBe("simulation-token");
    expect(parseOptions(["--auth", "dev"]).auth).toBe("dev");
    expect(() => parseOptions(["--auth", "clerk"])).toThrow(/one of dev, simulation-token/);
  });

  it("replays one action at a time and checks write nothing by default", () => {
    const replay = parseOptions(["replay", "--seed", "x"]);
    expect(replay).toMatchObject({
      concurrency: 1,
      logPath: "out/replay.jsonl",
      reportPath: "out/replay.md",
    });
    expect(parseOptions(["replay", "--seed", "x", "--concurrency", "3"]).concurrency).toBe(3);
    const check = parseOptions(["check", "--from-log", "out/sim.jsonl"]);
    expect(check.logPath).toBeNull();
    expect(check.reportPath).toBeNull();
  });

  it("refuses bad values", () => {
    expect(() => parseOptions(["--rate", "0"])).toThrow(/positive/);
    expect(() => parseOptions(["--payments", "magic"])).toThrow(/one of/);
    expect(() => parseOptions(["--stripe-share", "2"])).toThrow(/between/);
    expect(() => parseOptions(["--bogus"])).toThrow();
  });

  it("takes a run's decisions from its log for a replay", () => {
    const o = parseOptions(["replay", "--seed", "mine", "--log", "-"]);
    const r = replayOptions(o, { seed: "theirs", rate: 7, businesses: 2, logPath: "elsewhere" });
    expect(r).toMatchObject({ seed: "mine", rate: 7, businesses: 2, logPath: null, concurrency: 1 });
    const fromLog = parseOptions(["replay", "--from-log", "x.jsonl", "--duration", "2m"]);
    const replayed = replayOptions(fromLog, { seed: "theirs", durationMs: 600_000, rate: 7 });
    expect(replayed).toMatchObject({ seed: "theirs", seedGiven: true, durationMs: 120_000, rate: 7 });
    expect(randomSeed()).toMatch(/^[a-z0-9]+$/);
  });
});
