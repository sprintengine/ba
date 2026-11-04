import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { must } from "@/test/must";
import type { SiteSection } from "@/lib/api/types";
import { SAMPLE_CONTEXT, SAMPLE_SERVICES, samplePlan } from "@/components/site/sample-site";
import { durationLabel, priceLabel } from "@/lib/booking/quote";
import {
  formatIntervals,
  groupedHours,
  mapLink,
  newSectionId,
  paragraphs,
  resolveServices,
  resolveTeam,
  sectionAnchor,
} from "./plan";
import { SECTION_META } from "./section-meta";
import { SECTION_DEFS, SECTION_TYPES, sectionHasContent } from "./sections";

describe("plan helpers", () => {
  it("resolves services live: [] means all in sort order, otherwise the chosen order, unknown ids skipped", () => {
    expect(resolveServices([], SAMPLE_SERVICES).map((s) => s.id)).toEqual([
      "svc-intro",
      "svc-follow",
      "svc-short",
      "svc-chat",
    ]);
    expect(resolveServices(["svc-chat", "gone", "svc-intro"], SAMPLE_SERVICES).map((s) => s.id)).toEqual([
      "svc-chat",
      "svc-intro",
    ]);
  });

  it("resolves the team from real people, with section bios and without removed people", () => {
    expect(resolveTeam([], SAMPLE_CONTEXT).map((m) => m.name)).toEqual([
      "Robin Vale",
      "Sam Ashby",
      "Jules Moreno",
    ]);
    const chosen = resolveTeam(
      [
        { resourceId: "res-2", bio: "Custom bio", photo: null },
        { resourceId: "deleted", bio: "x", photo: null },
      ],
      SAMPLE_CONTEXT,
    );
    expect(chosen).toEqual([{ id: "res-2", name: "Sam Ashby", bio: "Custom bio", photo: null }]);
    expect(resolveTeam([{ resourceId: "res-1", bio: null, photo: null }], SAMPLE_CONTEXT)[0]?.bio).toBe(
      "Works with clients of every age and pace.",
    );
  });

  it("labels the sample services' prices and durations as the site's service cards do", () => {
    const intro = must(SAMPLE_SERVICES[0], "intro");
    const short = must(SAMPLE_SERVICES[2], "short");
    const chat = must(SAMPLE_SERVICES[3], "chat");
    expect(priceLabel(intro, "EUR", { capitalize: true })).toBe("€70");
    expect(priceLabel(short, "EUR", { capitalize: true })).toBe("From €40");
    expect(priceLabel(chat, "EUR", { capitalize: true })).toBe("Free");
    expect(durationLabel(intro)).toBe("1 h");
    expect(durationLabel(short)).toBe("30 min – 1 h");
  });

  it("formats and groups opening hours", () => {
    expect(formatIntervals(SAMPLE_CONTEXT.openingHours[2])).toBe("09:00 – 13:00, 14:00 – 20:00");
    expect(formatIntervals({ dayOfWeek: 7, intervals: [] })).toBeNull();
    expect(groupedHours(SAMPLE_CONTEXT.openingHours)).toEqual([
      { label: "Mon – Tue", hours: "09:00 – 18:00" },
      { label: "Wed", hours: "09:00 – 13:00, 14:00 – 20:00" },
      { label: "Thu", hours: "09:00 – 18:00" },
      { label: "Fri", hours: "09:00 – 17:00" },
      { label: "Sat", hours: "10:00 – 14:00" },
      { label: "Sun", hours: null },
    ]);
  });

  it("gives the first section of a type the plain anchor", () => {
    const sections = samplePlan().sections;
    const faq2: SiteSection = { ...sections.find((s) => s.type === "faq")!, id: "faq-2" };
    const all = [...sections, faq2];
    expect(
      sectionAnchor(
        all.find((s) => s.id === "faq")!,
        all,
      ),
    ).toBe("faq");
    expect(sectionAnchor(faq2, all)).toBe("faq-faq-2");
  });

  it("creates unique section ids", () => {
    const sections = samplePlan().sections;
    expect(newSectionId("faq", sections)).toBe("faq-2");
    expect(
      newSectionId(
        "gallery",
        sections.filter((s) => s.type !== "gallery"),
      ),
    ).toBe("gallery");
  });

  it("builds map links and paragraphs", () => {
    expect(mapLink(["Studio", null, "Dublin"])).toBe(
      "https://www.google.com/maps/search/?api=1&query=Studio%2C%20Dublin",
    );
    expect(mapLink([null, ""])).toBeNull();
    expect(paragraphs("One.\n\n  Two.\n \nThree.")).toEqual(["One.", "Two.", "Three."]);
    expect(paragraphs(null)).toEqual([]);
  });
});

describe("section registry", () => {
  const data = {
    services: SAMPLE_SERVICES,
    context: SAMPLE_CONTEXT,
    hasContactDetails: true,
    hasAddress: true,
  };
  const empty = {
    services: [],
    context: { team: [], openingHours: [] },
    hasContactDetails: false,
    hasAddress: false,
  };
  const defaults = {
    businessName: "Harbour Lane Studio",
    pattern: "aurora" as const,
    bookingNoun: "appointment",
  };

  it("covers every section type, and every default passes its own schema", () => {
    expect(SECTION_TYPES).toHaveLength(10);
    for (const type of SECTION_TYPES) {
      const def = SECTION_DEFS[type];
      const content = def.defaults(defaults);
      // About starts empty on purpose (the owner writes it); everything else is valid as added.
      expect(def.schema.safeParse(content).success, type).toBe(type !== "about");
    }
  });

  it("keeps the schema-free registry the public site uses in step with the full one, and free of zod", () => {
    for (const type of SECTION_TYPES) {
      const { schema, ...meta } = SECTION_DEFS[type];
      expect(schema, type).toBeDefined();
      expect(meta, type).toEqual(SECTION_META[type]);
    }
    const source = readFileSync(path.join(import.meta.dirname, "section-meta.ts"), "utf8");
    expect(source).not.toMatch(/from "(zod|\.\/schema|\.\/sections)"/);
  });

  it("knows which sections have something to show publicly", () => {
    for (const section of samplePlan().sections) {
      expect(sectionHasContent(section, data), section.type).toBe(section.type !== "gallery");
    }
    const hidden = samplePlan()
      .sections.filter((s) => !sectionHasContent(s, empty))
      .map((s) => s.type);
    expect(hidden.sort()).toEqual(["contact", "gallery", "hours", "services", "team"]);
  });
});
