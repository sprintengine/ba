import { customerGroup, formQuestion, resource, service } from "@shared/api/__tests__/fixtures/catalog";
import { releaseSchedule } from "@shared/api/__tests__/fixtures/releases";
import { SERVICE_COLORS } from "@shared/services/service-form";
import {
  chooseHint,
  coveringSchedules,
  fromChoice,
  groupChipLabel,
  groupChoices,
  intervalOptions,
  newServiceValues,
  NONE,
  noticeOptions,
  questionsFor,
  resourceChipLabel,
  resourceChoices,
  toChoice,
} from "./editor";

describe("choice values", () => {
  it("maps null to the none choice and back", () => {
    expect(toChoice(null)).toBe(NONE);
    expect(toChoice(15)).toBe("15");
    expect(fromChoice(NONE)).toBeNull();
    expect(fromChoice("15")).toBe(15);
  });

  it("offers the website's intervals, and a saved value that isn't one of them", () => {
    const options = intervalOptions(null);
    expect(options[0]).toEqual({ value: NONE, label: "Same as duration" });
    expect(options.map((o) => o.value)).toContain("90");
    expect(options.find((o) => o.value === "90")?.label).toBe("1 h 30 min");
    const custom = intervalOptions(25);
    expect(custom.map((o) => o.value)).toEqual([
      "none",
      "5",
      "10",
      "15",
      "20",
      "25",
      "30",
      "45",
      "60",
      "90",
      "120",
    ]);
    expect(intervalOptions(30)).toHaveLength(options.length);
  });

  it("offers the notice choices, and a saved value that isn't one of them", () => {
    expect(noticeOptions(null)[0]).toEqual({ value: NONE, label: "Business default" });
    expect(noticeOptions(null).find((o) => o.value === "1440")?.label).toBe("1 day");
    const custom = noticeOptions(90);
    expect(custom.find((o) => o.value === "90")?.label).toBe("1 h 30 min");
    expect(noticeOptions(60)).toHaveLength(noticeOptions(null).length);
  });
});

describe("newServiceValues", () => {
  it("puts a new service last, in the next colour", () => {
    expect(newServiceValues([])).toMatchObject({ sortOrder: 0, color: SERVICE_COLORS[0], name: "" });
    const v = newServiceValues([{ ...service, sortOrder: 2 }]);
    expect(v.sortOrder).toBe(3);
    expect(v.color).toBe(SERVICE_COLORS[3]);
  });
});

describe("questionsFor", () => {
  it("lists active questions for every service or this one", () => {
    const all = { ...formQuestion, id: "q-all", serviceId: null };
    const other = { ...formQuestion, id: "q-other", serviceId: "someone-else" };
    const off = { ...formQuestion, id: "q-off", isActive: false };
    expect(questionsFor([formQuestion, all, other, off], service.id).map((q) => q.id)).toEqual([
      formQuestion.id,
      "q-all",
    ]);
    expect(questionsFor(undefined, service.id)).toEqual([]);
  });
});

describe("groups", () => {
  const off = { ...customerGroup, id: "g-off", name: "Old", isActive: false };
  const saved = { ...customerGroup, id: "g-saved", name: "Saved", isActive: false };
  it("lists active groups and inactive ones the service allows", () => {
    expect(groupChoices([customerGroup, off, saved], [], ["g-saved"]).map((g) => g.id)).toEqual([
      customerGroup.id,
      "g-saved",
    ]);
    expect(groupChoices([off], ["g-off"], []).map((g) => g.id)).toEqual(["g-off"]);
    expect(groupChoices(undefined, [], [])).toEqual([]);
  });

  it("says when a group is restricted or inactive", () => {
    expect(groupChipLabel(customerGroup)).toBe("Members");
    expect(groupChipLabel({ ...customerGroup, restricted: true, isActive: false })).toBe(
      "Members · Restricted · Inactive",
    );
  });
});

describe("resources", () => {
  const off = { ...resource, id: "r-off", name: "Sam", isActive: false };
  it("lists active resources and inactive ones already named", () => {
    expect(resourceChoices([resource, off], []).map((r) => r.id)).toEqual([resource.id]);
    expect(resourceChoices([resource, off], ["r-off"]).map((r) => r.id)).toEqual([resource.id, "r-off"]);
    expect(resourceChoices(undefined, [])).toEqual([]);
  });

  it("marks inactive ones in words", () => {
    expect(resourceChipLabel(resource)).toBe("Alex Morgan");
    expect(resourceChipLabel(off)).toBe("Sam · Inactive");
  });
});

describe("coveringSchedules", () => {
  it("finds the active schedules that cover the service", () => {
    const paused = { ...releaseSchedule, id: "paused", status: "paused" as const };
    const other = { ...releaseSchedule, id: "other", serviceIds: ["x"] };
    expect(coveringSchedules([releaseSchedule, paused, other], service.id).map((s) => s.id)).toEqual([
      releaseSchedule.id,
    ]);
    expect(coveringSchedules([releaseSchedule], null)).toEqual([]);
    expect(coveringSchedules(undefined, service.id)).toEqual([]);
  });
});

describe("chooseHint", () => {
  it("names what the customer picks", () => {
    expect(chooseHint(" Therapist ")).toBe("They pick their therapist when booking.");
    expect(chooseHint("")).toBe("They pick who they see when booking.");
    expect(chooseHint(undefined)).toBe("They pick who they see when booking.");
  });
});
