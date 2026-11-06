import { describe, expect, it } from "vitest";
import {
  chosenResources,
  parseResourceChoice,
  peopleFirst,
  resourceChoiceLabel,
  resourceChoiceParam,
  type ResourceChoice,
} from "./calendar-resources";

const room = { id: "r1", name: "Room 1", kind: "space" as const };
const studio = { id: "r2", name: "Studio", kind: "space" as const };
const avery = { id: "p1", name: "Avery", kind: "person" as const };
const blake = { id: "p2", name: "Blake", kind: "person" as const };
const all = [room, avery, studio, blake];

describe("resource choice", () => {
  it.each<[string, ResourceChoice, string | null]>([
    ["all", { type: "people" }, null],
    ["everything", { type: "everything" }, "everything"],
    ["spaces", { type: "spaces" }, "spaces"],
    ["p1", { type: "ids", ids: ["p1"] }, "p1"],
    ["p1,r2", { type: "ids", ids: ["p1", "r2"] }, "p1,r2"],
  ])("reads and writes %s", (value, choice, param) => {
    expect(parseResourceChoice(value)).toEqual(choice);
    expect(resourceChoiceParam(choice)).toBe(param);
  });

  it("puts people first and keeps the order within each kind", () => {
    expect(peopleFirst(all).map((r) => r.id)).toEqual(["p1", "p2", "r1", "r2"]);
  });

  it("shows people by default, and a space only when it holds a booking with no person", () => {
    const withPerson = { resources: [{ id: "p1" }, { id: "r1" }] };
    const roomOnly = { resources: [{ id: "r2" }] };
    expect(chosenResources({ type: "people" }, all, [withPerson]).map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(chosenResources({ type: "people" }, all, [withPerson, roomOnly]).map((r) => r.id)).toEqual([
      "p1",
      "p2",
      "r2",
    ]);
  });

  it("shows everything for a business with no people", () => {
    expect(chosenResources({ type: "people" }, [room, studio], []).map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("keeps people first in a mixed selection and falls back when every id is gone", () => {
    expect(chosenResources({ type: "ids", ids: ["r1", "p2"] }, all, []).map((r) => r.id)).toEqual([
      "p2",
      "r1",
    ]);
    expect(chosenResources({ type: "ids", ids: ["gone"] }, all, []).map((r) => r.id)).toEqual(["p1", "p2"]);
  });

  it("labels what is showing", () => {
    const label = (choice: ResourceChoice, shown: typeof all) =>
      resourceChoiceLabel(choice, shown, all, "staff");
    expect(label({ type: "people" }, [avery, blake])).toBe("All people");
    expect(label({ type: "people" }, [avery, blake, studio])).toBe("All people +Studio");
    expect(label({ type: "people" }, [avery, room, studio])).toBe("All people +2");
    expect(label({ type: "everything" }, all)).toBe("All people and spaces");
    expect(label({ type: "spaces" }, [room, studio])).toBe("All spaces");
    expect(label({ type: "ids", ids: ["p1"] }, [avery])).toBe("Avery");
    expect(label({ type: "ids", ids: ["p1", "r1"] }, [avery, room])).toBe("Avery, Room 1");
    expect(label({ type: "ids", ids: [] }, [avery, blake, room])).toBe("3 selected");
    expect(resourceChoiceLabel({ type: "people" }, [avery, blake], [avery, blake], "staff")).toBe(
      "All staff",
    );
  });
});
