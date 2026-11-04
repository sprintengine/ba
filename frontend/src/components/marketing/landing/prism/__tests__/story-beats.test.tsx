import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { SlabFaces } from "../faces";
import { StoryBeats } from "../story-beats";

beforeEach(() =>
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(() => vi.unstubAllGlobals());

describe("StoryBeats", () => {
  it("is six named sections, each a heading beside a decorative face, axe-clean", async () => {
    const { container } = render(<StoryBeats />);
    const sections = screen.getAllByRole("region");
    expect(sections).toHaveLength(6);
    expect(
      within(must(sections[0], "first")).getByRole("heading", { name: /Today’s bookings and takings/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /One calendar/ })).toBeInTheDocument();
    // The faces are pictures of the product: hidden from assistive tech, which gets the copy beside them.
    for (const section of sections)
      expect(section.querySelector('[aria-hidden="true"] [data-face]')).not.toBeNull();
    await expectNoAxeViolations(container);
  });
});

describe("SlabFaces", () => {
  it("renders a face for the hero and one for the closing slab", () => {
    const { container } = render(<SlabFaces />);
    const faces = [...container.querySelectorAll<HTMLElement>("[data-face]")].map((f) => f.dataset.face);
    expect(faces).toContain("0");
    expect(faces).toContain("7");
  });

  it("puts Lumen in Dublin, where the demo business is, on every face", () => {
    const { container } = render(
      <>
        <SlabFaces />
        <StoryBeats />
      </>,
    );
    expect(container.textContent).toContain("Lumen Physio · Dublin");
    expect(container.textContent).not.toContain("Galway");
  });
});
