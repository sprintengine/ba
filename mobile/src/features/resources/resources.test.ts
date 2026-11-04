import { resource, resourceSparse } from "@shared/api/__tests__/fixtures/catalog";
import { teamMember } from "@shared/api/__tests__/fixtures/business";
import type { AvailabilityOverride, Resource } from "@shared/api/types";
import { Box, DoorOpen, User } from "lucide-react-native";
import {
  COPY_TARGETS,
  KIND_ICON,
  memberName,
  myMemberId,
  overrideDetail,
  periodError,
  resourceA11yLabel,
  resourceRows,
  resourceSubtitle,
  scheduleLabel,
  sortResources,
  upcomingOverrides,
} from "./resources";

const r = (patch: Partial<Resource>): Resource => ({ ...resource, ...patch });

describe("resources helpers", () => {
  it("has an icon per kind", () => {
    expect(KIND_ICON).toEqual({ person: User, space: DoorOpen, equipment: Box });
  });

  it("sorts active first, then by sort order and name", () => {
    const list = [
      r({ id: "c", name: "Cleo", sortOrder: 1, isActive: false }),
      r({ id: "b", name: "Ben", sortOrder: 1 }),
      r({ id: "a", name: "Abe", sortOrder: 1 }),
      r({ id: "z", name: "Zed", sortOrder: 0 }),
    ];
    expect(sortResources(list).map((x) => x.id)).toEqual(["z", "a", "b", "c"]);
    expect(sortResources(undefined)).toEqual([]);
  });

  it("finds the signed-in member and members' names", () => {
    const team = [teamMember, { ...teamMember, id: "m2", userId: "u2", name: null, email: "x@example.test" }];
    expect(myMemberId(team, teamMember.userId)).toBe(teamMember.id);
    expect(myMemberId(team, "nobody")).toBeNull();
    expect(myMemberId(undefined, "nobody")).toBeNull();
    expect(memberName(team, teamMember.id)).toBe("Avery Morgan");
    expect(memberName(team, "m2")).toBe("x@example.test");
    expect(memberName(team, null)).toBeNull();
  });

  it("describes a resource under its name", () => {
    expect(resourceSubtitle(resource, "Avery")).toBe("Linked to Avery");
    expect(resourceSubtitle(resourceSparse, null)).toBe("Not linked");
    expect(resourceSubtitle(r({ isActive: false }), "Avery")).toBe("Inactive");
    expect(resourceSubtitle(r({ kind: "space", capacity: 4 }), null)).toBe("Space · 4 places");
    expect(resourceSubtitle(r({ kind: "equipment", capacity: 1 }), null)).toBe("Equipment");
    expect(resourceA11yLabel(resource, "Avery")).toBe("Alex Morgan, Person, Linked to Avery");
  });

  it("keeps upcoming overrides in date and time order", () => {
    const o = (id: string, date: string, startTime: string | null): AvailabilityOverride => ({
      id,
      resourceId: "r",
      date,
      isAvailable: false,
      startTime,
      endTime: startTime ? "18:00" : null,
      reason: null,
    });
    const list = [
      o("late", "2026-10-20", "14:00"),
      o("past", "2026-10-01", null),
      o("early", "2026-10-20", null),
    ];
    expect(upcomingOverrides(list, "2026-10-15").map((x) => x.id)).toEqual(["early", "late"]);
    expect(upcomingOverrides(undefined, "2026-10-15")).toEqual([]);
  });

  it("describes an override", () => {
    expect(overrideDetail({ startTime: "09:00", endTime: "13:00", reason: "Course" })).toBe(
      "09:00–13:00 · Course",
    );
    expect(overrideDetail({ startTime: null, endTime: null, reason: null })).toBe("All day");
  });

  it("names a schedule by its period", () => {
    const tz = "Europe/Dublin";
    expect(scheduleLabel({ validFrom: null, validUntil: null }, tz, "en-IE")).toBe("Regular hours");
    expect(scheduleLabel({ validFrom: "2026-06-01", validUntil: "2026-08-31" }, tz, "en-IE")).toMatch(
      /^1 Jun – 31 Aug 2026$/,
    );
    expect(scheduleLabel({ validFrom: "2026-06-01", validUntil: null }, tz, "en-IE")).toMatch(
      /^1 Jun onwards$/,
    );
    expect(scheduleLabel({ validFrom: null, validUntil: "2026-08-31" }, tz, "en-IE")).toMatch(
      /^Until 31 Aug 2026$/,
    );
  });

  it("offers copy targets and checks a new period", () => {
    expect(COPY_TARGETS.map((t) => t.days)).toEqual([
      [1, 2, 3, 4, 5, 6, 7],
      [1, 2, 3, 4, 5],
      [6, 7],
    ]);
    expect(periodError("2026-06-01", "2026-05-01")).toBe("The end is before the start");
    expect(periodError("2026-06-01", null)).toBeNull();
    expect(periodError(null, "2026-05-01")).toBeNull();
  });

  it("groups the list's rows: active, then the inactive ones under a heading", () => {
    const rows = resourceRows([r({ id: "a" }), r({ id: "b" }), r({ id: "c", isActive: false })]);
    expect(
      rows.map((x) => (x.kind === "header" ? x.title : `${x.key}${x.first ? "<" : ""}${x.last ? ">" : ""}`)),
    ).toEqual(["a<", "b>", "Inactive", "c<>"]);
    expect(resourceRows([r({ id: "a" })]).map((x) => x.key)).toEqual(["a"]);
  });
});
