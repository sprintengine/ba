import { describe, expect, it } from "vitest";
import { createDraft } from "../draft";
import { describeProblem } from "../problems";
import { fixture } from "./fixture";

const setup = () => createDraft(fixture()).setup;
const label = (path: string, s = setup()) => describeProblem(s, path, "x").label;

describe("describeProblem", () => {
  it("describes problems with a section and item for jump links", () => {
    const s = setup();
    expect(describeProblem(s, "services[1].depositCents", "x")).toMatchObject({
      section: "services",
      index: 1,
      label: "Full valet · Deposit",
    });
    expect(describeProblem(s, "resources[0].weeklyHours[6].endTime", "x")).toMatchObject({
      section: "resources",
      index: 0,
      label: "Bay 1 · Sunday · Closing time",
    });
    expect(describeProblem(s, "name", "x")).toMatchObject({ section: "business", label: "Business name" });
  });

  it("names options, add-ons and requirements by position", () => {
    expect(label("services[1].options[1].priceCents")).toBe("Full valet · Option 2 · Price");
    expect(label("services[1].addons[0].name")).toBe("Full valet · Add-on 1 · Name");
    expect(label("services[1].requirements[0].resourceKeys")).toBe("Full valet · Requirement 1 · Pool");
    expect(label("services[1]")).toBe("Full valet");
  });

  it("falls back to a numbered name for unnamed or missing items", () => {
    const s = setup();
    const unnamed = { ...s, services: s.services.map((x) => ({ ...x, name: " " })) };
    expect(label("services[0].name", unnamed)).toBe("Service 1 · Name");
    expect(label("resources[7].name")).toBe("Bay 8 · Name");
    expect(describeProblem(s, "customerGroups[0].name", "x")).toMatchObject({
      section: "groups",
      index: 0,
      label: "Members · Name",
    });
    expect(label("customerGroups[4].name")).toBe("Group 5 · Name");
    expect(label("resources[0].weeklyHours[40].startTime")).toBe("Bay 1 · Opening time");
  });

  it("shortens long questions", () => {
    const s = setup();
    const long = {
      ...s,
      questions: s.questions.map((q) => ({ ...q, label: "Tell us about your car ".repeat(3) })),
    };
    expect(describeProblem(long, "questions[0].helpText", "x")).toMatchObject({
      section: "questions",
      index: 0,
      label: "Tell us about your car Tell us about yo… · Help text",
    });
    expect(label("questions[3].label")).toBe("Question 4 · Question");
  });

  it("labels list-wide and business problems", () => {
    expect(describeProblem(setup(), "resources", "x")).toMatchObject({
      section: "resources",
      index: null,
      label: "Bays",
    });
    expect(label("services")).toBe("Services");
    expect(describeProblem(setup(), "customerGroups", "x").section).toBe("groups");
    expect(label("customerGroups")).toBe("Customer groups");
    expect(label("questions")).toBe("Questions");
    expect(describeProblem(setup(), "vocabulary.customers", "x")).toMatchObject({
      section: "business",
      label: "Wording · customers",
    });
    expect(label("branding.primaryColor")).toBe("Brand colour");
    expect(label("timezone")).toBe("Timezone");
    expect(label("policies.holdMinutes")).toBe("policies.holdMinutes");
  });
});
