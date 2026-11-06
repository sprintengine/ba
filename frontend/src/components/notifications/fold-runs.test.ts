import { describe, expect, it } from "vitest";
import type { AppNotification } from "@/lib/api/types";
import { foldRuns } from "./notification-bell";

const note = (id: string, kind: string) => ({ id, kind }) as unknown as AppNotification;
const items = [note("a", "x"), note("b", "x"), note("c", "x"), note("d", "x"), note("e", "y")];

describe("foldRuns", () => {
  it("keeps two of a long run in view and folds the rest", () => {
    expect(foldRuns(items, new Set())).toEqual([items[0], items[1], { key: "a", more: 2 }, items[4]]);
  });

  it("shows a run whole once opened", () => {
    expect(foldRuns(items, new Set(["a"]))).toEqual(items);
  });

  it("never folds one item behind a button", () => {
    expect(foldRuns(items.slice(1), new Set())).toEqual(items.slice(1));
  });
});
