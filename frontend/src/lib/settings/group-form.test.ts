import { describe, expect, it } from "vitest";
import type { CustomerGroup } from "@/lib/api/types";
import { formValuesToGroupInput, groupFormSchema, groupToFormValues } from "./group-form";

const group: CustomerGroup = {
  id: "g1",
  name: "Members",
  description: null,
  restricted: true,
  sortOrder: 2,
  isActive: false,
};

describe("group form", () => {
  it("defaults a new group to an active, unrestricted one", () => {
    expect(groupToFormValues(null)).toEqual({ name: "", description: "", restricted: false, isActive: true });
  });

  it("round-trips a group, trimming and turning a blank description into null", () => {
    const values = groupToFormValues(group);
    expect(values).toEqual({ name: "Members", description: "", restricted: true, isActive: false });
    expect(formValuesToGroupInput({ ...values, name: " Members " }, 2)).toEqual({
      name: "Members",
      description: null,
      restricted: true,
      isActive: false,
      sortOrder: 2,
    });
  });

  it("allows names up to 100 and descriptions up to 500 characters, like the backend", () => {
    const ok = { ...groupToFormValues(null), name: "x".repeat(100), description: "x".repeat(500) };
    expect(groupFormSchema.safeParse(ok).success).toBe(true);
    expect(groupFormSchema.safeParse({ ...ok, name: "x".repeat(101) }).success).toBe(false);
    expect(groupFormSchema.safeParse({ ...ok, description: "x".repeat(501) }).success).toBe(false);
  });

  it("needs a name", () => {
    const r = groupFormSchema.safeParse(groupToFormValues(null));
    expect(r.success ? [] : r.error.issues.map((i) => i.message)).toEqual(["Name the group"]);
  });
});
