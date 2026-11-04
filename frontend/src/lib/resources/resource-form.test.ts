import { describe, expect, it } from "vitest";
import type { Resource } from "@/lib/api/types";
import { SERVICE_COLORS } from "@/lib/services/service-form";
import {
  formValuesToResourceInput,
  NO_MEMBER,
  resourceFormSchema,
  resourceSwatches,
  resourceToFormValues,
  type ResourceFormValues,
} from "./resource-form";

const resource: Resource = {
  id: "r1",
  kind: "space",
  name: "Room 1",
  description: null,
  color: "#123456",
  capacity: 4,
  memberId: null,
  isActive: false,
  sortOrder: 3,
};

const issues = (v: ResourceFormValues) => {
  const r = resourceFormSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("resourceToFormValues", () => {
  it("gives a new resource defaults with the palette colour for its position", () => {
    expect(resourceToFormValues(null, 0)).toEqual({
      name: "",
      kind: "person",
      description: "",
      color: SERVICE_COLORS[0],
      capacity: 1,
      memberId: NO_MEMBER,
      isActive: true,
    });
    expect(resourceToFormValues(null, SERVICE_COLORS.length + 1).color).toBe(SERVICE_COLORS[1]);
  });

  it("maps an existing resource, nulls as empty strings and an unlinked member as none", () => {
    expect(resourceToFormValues(resource, 9)).toEqual({
      name: "Room 1",
      kind: "space",
      description: "",
      color: "#123456",
      capacity: 4,
      memberId: NO_MEMBER,
      isActive: false,
    });
  });
});

describe("formValuesToResourceInput", () => {
  it("trims, turns blanks and none into null and keeps the sort order", () => {
    const values = { ...resourceToFormValues(resource, 0), name: "  Room 2 ", description: "  " };
    expect(formValuesToResourceInput(values, 3)).toEqual({
      name: "Room 2",
      kind: "space",
      description: null,
      color: "#123456",
      capacity: 4,
      memberId: null,
      isActive: false,
      sortOrder: 3,
    });
    expect(formValuesToResourceInput({ ...values, kind: "person", memberId: "m1" }, 0).memberId).toBe("m1");
  });

  it("links only a person to a team member", () => {
    const values = { ...resourceToFormValues(resource, 0), memberId: "m1" };
    expect(formValuesToResourceInput({ ...values, kind: "space" }, 0).memberId).toBeNull();
    expect(formValuesToResourceInput({ ...values, kind: "equipment" }, 0).memberId).toBeNull();
    expect(formValuesToResourceInput({ ...values, kind: "person" }, 0).memberId).toBe("m1");
  });

  it("round-trips through the schema", () => {
    expect(issues(resourceToFormValues(resource, 0))).toEqual([]);
    expect(issues({ ...resourceToFormValues(resource, 0), name: " " })).toEqual(["name: Enter a name"]);
    expect(issues({ ...resourceToFormValues(resource, 0), color: "red" })[0]).toMatch(/^color:/);
  });
});

describe("resourceFormSchema limits", () => {
  const base = resourceToFormValues(resource, 0);

  it("allows up to 1000 places, like the backend", () => {
    expect(issues({ ...base, capacity: 1000 })).toEqual([]);
    expect(issues({ ...base, capacity: 1001 })[0]).toMatch(/^capacity:/);
  });

  it("allows names up to 100 characters, like the backend", () => {
    expect(issues({ ...base, name: "x".repeat(100) })).toEqual([]);
    expect(issues({ ...base, name: "x".repeat(101) })[0]).toMatch(/^name:/);
  });
});

describe("resourceSwatches", () => {
  it("puts a custom colour first, otherwise the palette", () => {
    expect(resourceSwatches(null)).toEqual([...SERVICE_COLORS]);
    expect(resourceSwatches({ color: SERVICE_COLORS[2] })).toEqual([...SERVICE_COLORS]);
    expect(resourceSwatches(resource)).toEqual(["#123456", ...SERVICE_COLORS]);
  });
});
