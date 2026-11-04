import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { finalState } from "../../engine/types";
import { OwnerApp } from "../owner-app";
import { OWNER_CHAPTERS } from "../script";
import type { OwnerState } from "../state";

/** Render a state and report which `data-demo` targets it shows. */
function targetsIn(s: OwnerState) {
  const { container, unmount } = render(<OwnerApp s={s} />);
  const ids = new Set(
    [...container.querySelectorAll("[data-demo]")].map((el) => el.getAttribute("data-demo")),
  );
  unmount();
  return ids;
}

describe("owner demo script", () => {
  it.each(OWNER_CHAPTERS.map((c) => [c.id, c] as const))(
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

  it("each chapter ends where the next one starts", () => {
    const [service, hours, calendar] = OWNER_CHAPTERS;
    expect(finalState(service).services.map((x) => x.name)).toEqual(
      hours.initial.services.map((x) => x.name),
    );
    expect(finalState(hours).hours).toEqual(calendar.initial.hours);
  });

  it("creates the service the script typed", () => {
    const end = finalState(OWNER_CHAPTERS[0]);
    expect(end.sheet).toBeNull();
    expect(end.services).toContainEqual(
      expect.objectContaining({ name: "Dry needling", duration: "40 min", price: "€55" }),
    );
  });

  it("renders every chapter's poster (reduced motion)", () => {
    for (const chapter of OWNER_CHAPTERS) {
      const { container, unmount } = render(<OwnerApp s={finalState(chapter)} />);
      expect(container.textContent).toContain("Lumen Physiotherapy");
      unmount();
    }
  });
});
