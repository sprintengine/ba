import { describe, expect, it } from "vitest";
import type { PublicBusiness } from "@/lib/api/types";
import {
  agentDetails,
  agentSelection,
  availabilityRange,
  readInput,
  type AgentSelectionInput,
} from "./agent";
import { EMPTY_DETAILS } from "./details-schema";
import { assessment, business, consult, massage } from "./__tests__/fixtures";

const services = [assessment, massage, consult];
const now = { today: "2026-10-01", nowTime: "10:00" };
const input = (patch: Partial<AgentSelectionInput>): AgentSelectionInput => ({
  groupId: null,
  serviceId: null,
  optionId: null,
  addonIds: [],
  resourceId: null,
  date: null,
  time: null,
  ...patch,
});
const errorOf = (r: { ok: boolean; error?: string }) => (r.ok ? null : r.error);

describe("agentSelection", () => {
  it("chooses a service with nothing else to choose", () => {
    expect(agentSelection(business, services, input({ serviceId: "s3" }), now)).toEqual({
      ok: true,
      value: {
        groupId: null,
        serviceId: "s3",
        optionId: null,
        addonIds: [],
        resource: null,
        date: null,
        time: null,
      },
    });
  });

  it("names the services when the service is missing or unknown", () => {
    expect(errorOf(agentSelection(business, services, input({}), now))).toMatch(
      /"s1" \(Initial assessment\)/,
    );
    expect(errorOf(agentSelection(business, services, input({ serviceId: "nope" }), now))).toMatch(
      /Unknown serviceId "nope"/,
    );
  });

  it("asks for an option when there are several, and checks the option and add-ons belong", () => {
    expect(errorOf(agentSelection(business, services, input({ serviceId: "s2" }), now))).toMatch(
      /Choose an option of Sports massage.*"o1" \(30 minutes\)/,
    );
    expect(
      errorOf(agentSelection(business, services, input({ serviceId: "s2", optionId: "o9" }), now)),
    ).toMatch(/Unknown optionId "o9"/);
    expect(
      errorOf(
        agentSelection(business, services, input({ serviceId: "s2", optionId: "o1", addonIds: ["x"] }), now),
      ),
    ).toMatch(/Unknown addonId "x"/);
    const ok = agentSelection(
      business,
      services,
      input({ serviceId: "s2", optionId: "o2", addonIds: ["a1"] }),
      now,
    );
    expect(ok.ok && ok.value).toMatchObject({ optionId: "o2", addonIds: ["a1"] });
  });

  it("chooses the only option for the customer", () => {
    const single = { ...massage, options: massage.options.slice(0, 1) };
    const r = agentSelection(business, [single], input({ serviceId: "s2" }), now);
    expect(r.ok && r.value.optionId).toBe("o1");
  });

  it("defaults the resource to any, checks a chosen one, and refuses one where there's no choice", () => {
    const any = agentSelection(business, services, input({ serviceId: "s1" }), now);
    expect(any.ok && any.value.resource).toBe("any");
    const named = agentSelection(business, services, input({ serviceId: "s1", resourceId: "r2" }), now);
    expect(named.ok && named.value.resource).toBe("r2");
    expect(
      errorOf(agentSelection(business, services, input({ serviceId: "s1", resourceId: "r9" }), now)),
    ).toMatch(/Unknown resourceId "r9"/);
    expect(
      errorOf(agentSelection(business, services, input({ serviceId: "s3", resourceId: "r1" }), now)),
    ).toMatch(/doesn't offer a choice/);
  });

  it("requires a customer group when the business has groups, and one that may book the service", () => {
    const grouped: PublicBusiness = {
      ...business,
      customerGroups: [
        { id: "g1", name: "Members", description: null },
        { id: "g2", name: "Guests", description: null },
      ],
    };
    const membersOnly = { ...consult, allowedGroupIds: ["g1"] };
    expect(errorOf(agentSelection(grouped, [membersOnly], input({ serviceId: "s3" }), now))).toMatch(
      /Choose a customer group first.*"g1" \(Members\)/,
    );
    expect(
      errorOf(agentSelection(grouped, [membersOnly], input({ serviceId: "s3", groupId: "g2" }), now)),
    ).toMatch(/can't be booked by that customer group/);
    const ok = agentSelection(grouped, [membersOnly], input({ serviceId: "s3", groupId: "g1" }), now);
    expect(ok.ok && ok.value.groupId).toBe("g1");
    expect(
      errorOf(agentSelection(business, services, input({ serviceId: "s3", groupId: "g1" }), now)),
    ).toMatch(/has no customer groups/);
  });

  it("checks the date and time: real, in the bookable range, not passed", () => {
    const at = (date: string | null, time: string | null) =>
      errorOf(agentSelection(business, services, input({ serviceId: "s3", date, time }), now));
    expect(at("2026-10-02", "09:30")).toBeNull();
    expect(at("2026-10-02", null)).toBeNull();
    expect(at(null, "09:30")).toMatch(/A time needs a date/);
    expect(at("2026-02-30", null)).toMatch(/YYYY-MM-DD/);
    expect(at("2026-10-02", "9:30")).toMatch(/HH:mm/);
    expect(at("2026-09-30", null)).toMatch(/has passed/);
    expect(at("2026-10-01", "09:00")).toMatch(/09:00 today has passed/);
    // 60 days' notice at most (the business's policy).
    expect(at("2026-11-30", null)).toBeNull();
    expect(at("2026-12-01", null)).toMatch(/can be booked up to 2026-11-30/);
  });
});

describe("availabilityRange", () => {
  const bounds = { today: "2026-10-01", max: "2026-11-30" };

  it("defaults to a week from today, and never starts before today", () => {
    expect(availabilityRange(null, null, bounds)).toEqual({
      ok: true,
      value: { from: "2026-10-01", to: "2026-10-07" },
    });
    expect(availabilityRange("2026-09-01", "2026-10-03", bounds)).toEqual({
      ok: true,
      value: { from: "2026-10-01", to: "2026-10-03" },
    });
  });

  it("covers 31 days at most and stops at the last bookable date", () => {
    expect(availabilityRange("2026-10-01", "2026-12-31", bounds)).toEqual({
      ok: true,
      value: { from: "2026-10-01", to: "2026-10-31" },
    });
    expect(availabilityRange("2026-11-20", "2026-12-31", bounds)).toEqual({
      ok: true,
      value: { from: "2026-11-20", to: "2026-11-30" },
    });
  });

  it("refuses bad dates, a range ending first, and a start past the last bookable date", () => {
    expect(errorOf(availabilityRange("tomorrow", null, bounds))).toMatch(/from must be YYYY-MM-DD/);
    expect(errorOf(availabilityRange("2026-10-10", "2026-10-05", bounds))).toMatch(/before 2026-10-10/);
    expect(errorOf(availabilityRange("2026-12-05", null, bounds))).toMatch(/up to 2026-11-30/);
  });
});

describe("agentDetails", () => {
  const questions = [
    ...assessment.questions,
    { ...assessment.questions[0]!, id: "q2", label: "Consent", kind: "checkbox" as const, sensitive: false },
    {
      ...assessment.questions[0]!,
      id: "q3",
      label: "How did you hear of us?",
      kind: "select" as const,
      options: ["Friend", "Search"],
      sensitive: false,
    },
  ];

  it("merges the given fields and answers, keeping the rest", () => {
    const current = { ...EMPTY_DETAILS, phone: "+353 1 555 0101" };
    const r = agentDetails(
      current,
      { name: " Alex Morgan ", email: "alex@example.com", answers: { q1: "Knee", q2: true, q3: "Friend" } },
      questions,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        name: "Alex Morgan",
        email: "alex@example.com",
        phone: "+353 1 555 0101",
        notes: "",
        answers: { q1: "Knee", q2: "true", q3: "Friend" },
      },
    });
  });

  it("refuses unknown questions, a checkbox not given as true/false, a choice not offered, wrong types", () => {
    expect(errorOf(agentDetails(EMPTY_DETAILS, { answers: { q9: "x" } }, questions))).toMatch(
      /Unknown question "q9"/,
    );
    expect(errorOf(agentDetails(EMPTY_DETAILS, { answers: { q1: "x" } }, []))).toMatch(/asks no questions/);
    expect(errorOf(agentDetails(EMPTY_DETAILS, { answers: { q2: "yes" } }, questions))).toMatch(
      /true or false/,
    );
    expect(errorOf(agentDetails(EMPTY_DETAILS, { answers: { q3: "Radio" } }, questions))).toMatch(
      /one of: "Friend", "Search"/,
    );
    expect(errorOf(agentDetails(EMPTY_DETAILS, { name: 42 }, questions))).toMatch(/name must be a string/);
  });
});

describe("readInput", () => {
  it("reads blanks as absent and notes values of the wrong type", () => {
    const read = readInput({ a: "  ", b: [" x ", "x", ""], c: "yes", d: [] });
    expect(read.string("a")).toBeNull();
    expect(read.strings("b")).toEqual(["x"]);
    expect(read.boolean("c")).toBeNull();
    expect(read.object("d")).toBeNull();
    expect(read.problems).toEqual(["c must be true or false", "d must be an object"]);
  });
});
