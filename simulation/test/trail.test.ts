import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ActionLog, formatTrailEntry, parseLog } from "../src/trail";

describe("ActionLog", () => {
  it("writes JSONL and finds the trail of a booking, business or action", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "sim-log-")), "out", "sim.jsonl");
    const log = new ActionLog(path, 3);
    log.write({ type: "run", seed: "s" });
    log.write({
      type: "request",
      seq: 1,
      actor: "c1",
      method: "POST",
      path: "/v1/x/bk-1/cancel",
      status: 409,
      code: "POLICY_VIOLATION",
      requestId: "r1",
      businessId: "biz",
    });
    log.write({
      type: "action",
      seq: 2,
      actor: "o1",
      kind: "owner.approve",
      outcome: "approved",
      businessId: "biz",
      detail: { n: 1 },
    });
    log.write({
      type: "action",
      seq: 3,
      actor: "o1",
      kind: "owner.book",
      outcome: "ok",
      businessId: "other",
    });
    expect(log.trailFor({ bookingId: "bk-1" }).map((e) => e.seq)).toEqual([1]);
    expect(log.trailFor({ businessId: "biz" }).map((e) => e.seq)).toEqual([1, 2]);
    expect(log.trailFor({ actionSeq: 3 }).map((e) => e.seq)).toEqual([3]);
    await log.close();
    await log.close();
    const entries = parseLog(readFileSync(path, "utf8"));
    expect(entries.map((e) => e.type)).toEqual(["run", "request", "action", "action"]);
    expect(formatTrailEntry(entries[1]!)).toMatch(
      /#1 c1 POST \/v1\/x\/bk-1\/cancel -> 409 POLICY_VIOLATION \(r1\)/,
    );
    expect(formatTrailEntry(entries[2]!)).toMatch(/#2 o1 owner.approve => approved \{"n":1\}/);
  });

  it("finds a booking by the ids actions logged, and leaves the checker's reads out", () => {
    const log = new ActionLog(null);
    // The creating request came back before the action knew the booking's id.
    log.write({ type: "request", seq: 4, path: "/v1/public/businesses/s/bookings", businessId: "biz" });
    log.write({
      type: "request",
      seq: 4,
      path: "/v1/public/manage/tok",
      bookingIds: ["bk"],
      businessId: "biz",
    });
    log.write({ type: "action", seq: 4, kind: "customer.book", bookingIds: ["bk"], businessId: "biz" });
    log.write({ type: "request", seq: 0, path: "/v1/businesses/biz/bookings/bk", businessId: "biz" });
    log.write({ type: "request", seq: 5, path: "/v1/businesses/biz/bookings/other", businessId: "biz" });
    expect(log.trailFor({ bookingId: "bk", actionSeq: 0 }).map((e) => e.path ?? e.kind)).toEqual([
      "/v1/public/businesses/s/bookings",
      "/v1/public/manage/tok",
      "customer.book",
    ]);
    expect(log.trailFor({ businessId: "biz" }).map((e) => e.seq)).toEqual([4, 4, 4, 5]);
  });

  it("keeps only the recent entries in memory and can write nowhere", () => {
    const log = new ActionLog(null, 2);
    for (let i = 0; i < 5; i++) log.write({ type: "action", seq: i, businessId: "b" });
    expect(log.trailFor({ businessId: "b" }).map((e) => e.seq)).toEqual([3, 4]);
  });
});
