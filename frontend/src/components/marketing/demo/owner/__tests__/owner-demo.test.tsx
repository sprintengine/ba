import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalState } from "../../engine/types";
import { OwnerApp } from "../owner-app";
import { OWNER_TOUR, OWNER_TOUR_WITH_BO, ownerChapters } from "../script";
import type { OwnerState } from "../state";

afterEach(() => vi.unstubAllEnvs());

const marketBo = () => vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ENABLED", "true");

/** Render a state and report which `data-demo` targets it shows. */
function targetsIn(s: OwnerState) {
  const { container, unmount } = render(<OwnerApp s={s} />);
  const ids = new Set(
    [...container.querySelectorAll("[data-demo]")].map((el) => el.getAttribute("data-demo")),
  );
  unmount();
  return ids;
}

describe.each([
  { bo: false, chapters: OWNER_TOUR },
  { bo: true, chapters: OWNER_TOUR_WITH_BO },
])("owner demo script (Bo marketed: $bo)", ({ bo, chapters }) => {
  beforeEach(() => {
    if (bo) marketBo();
  });

  it.each(chapters.map((c) => [c.id, c] as const))(
    "chapter %s only points the cursor at things on screen",
    (_, chapter) => {
      let s = chapter.initial;
      for (const step of chapter.steps) {
        if (step.kind === "move" || step.kind === "click" || step.kind === "type") {
          expect(targetsIn(s), `${chapter.id}: ${step.target}`).toContain(step.target);
        }
        if (step.kind === "click" && step.apply) s = step.apply(s);
        if (step.kind === "type") s = step.apply(s, step.text);
        if (step.kind === "set") s = step.apply(s);
      }
    },
  );

  it("renders every chapter's poster (reduced motion)", () => {
    for (const chapter of chapters) {
      const { container, unmount } = render(<OwnerApp s={finalState(chapter)} />);
      expect(container.textContent).toContain("Lumen Physiotherapy");
      unmount();
    }
  });
});

describe("owner demo tour", () => {
  it("leaves Bo out by default: no chapter, launcher or panel", () => {
    const chapters = ownerChapters();
    expect(chapters).toBe(OWNER_TOUR);
    expect(chapters.map((c) => c.id)).toEqual(["service", "hours", "calendar"]);
    for (const chapter of chapters) {
      expect(`${chapter.label} ${chapter.caption}`).not.toMatch(/\bBo\b/);
      for (const s of [chapter.initial, finalState(chapter)]) {
        const ids = targetsIn(s);
        expect(ids).not.toContain("bo-launcher");
        expect(ids).not.toContain("bo-input");
      }
    }
  });

  it("ends on asking Bo where Bo is offered, with the launcher on every screen", () => {
    marketBo();
    const chapters = ownerChapters();
    expect(chapters).toBe(OWNER_TOUR_WITH_BO);
    expect(chapters.map((c) => c.label)).toEqual([
      "Add a service",
      "Set opening hours",
      "Bookings roll in",
      "Ask Bo",
    ]);
    for (const chapter of chapters) expect(targetsIn(chapter.initial)).toContain("bo-launcher");
  });

  it("each chapter ends where the next one starts", () => {
    const [service, hours, calendar] = OWNER_TOUR;
    expect(finalState(service).services.map((x) => x.name)).toEqual(
      hours.initial.services.map((x) => x.name),
    );
    expect(finalState(hours).hours).toEqual(calendar.initial.hours);
  });

  it("creates the service the script typed", () => {
    const end = finalState(OWNER_TOUR[0]);
    expect(end.sheet).toBeNull();
    expect(end.services).toContainEqual(
      expect.objectContaining({ name: "Dry needling", duration: "40 min", price: "€55" }),
    );
  });
});
