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
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Each section's face, as its `data-face` index. */
const facesOf = (sections: HTMLElement[]) =>
  sections.map((section) => section.querySelector<HTMLElement>("[data-face]")?.dataset.face);

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
    expect(facesOf(sections)).toEqual(["1", "2", "3", "4", "5", "6"]);
    await expectNoAxeViolations(container);
  });

  it("by default, the fifth beat is the owner's own AI assistant, not Bo, with a link to the guide", () => {
    const { container } = render(<StoryBeats />);
    const beat = screen.getByRole("region", { name: /Ask your own AI assistant/ });
    expect(within(beat).getByRole("link", { name: "How to connect your assistant" })).toHaveAttribute(
      "href",
      "/help/ai-agents-for-business",
    );
    expect(beat.textContent).toContain("Approve on bookanything");
    expect(container.textContent).not.toMatch(/\bBo\b/);
  });

  it("presents Bo in the fifth beat where Bo is offered", () => {
    vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ENABLED", "true");
    render(<StoryBeats />);
    expect(screen.getAllByRole("region")).toHaveLength(6);
    expect(screen.getByRole("region", { name: /Ask Bo to sort it out/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /your own AI assistant/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "How to connect your assistant" })).not.toBeInTheDocument();
  });

  it("leaves the beat out, numbering the rest in order, when neither Bo nor the business server is on", () => {
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_MCP_ENABLED", "false");
    render(<StoryBeats />);
    const sections = screen.getAllByRole("region");
    expect(sections).toHaveLength(5);
    expect(screen.queryByRole("region", { name: /AI assistant|\bBo\b/ })).not.toBeInTheDocument();
    // The client's booking page keeps its own face (and its card's size) as it moves up to fifth.
    expect(facesOf(sections)).toEqual(["1", "2", "3", "4", "6"]);
    const last = must(sections[4], "last");
    expect(last).toHaveAccessibleName(/Your own booking page/);
    expect(last.textContent).toContain("05");
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
