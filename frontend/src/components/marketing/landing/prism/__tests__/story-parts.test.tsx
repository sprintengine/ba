import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeeItWorkSection } from "../../see-it-work";
import { HeroCopy } from "../story-parts";

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

describe("HeroCopy", () => {
  it("sends See it work to the dashboard demo", () => {
    const { container } = render(
      <>
        <HeroCopy ref={null} />
        <SeeItWorkSection />
      </>,
    );
    const href = screen.getByRole("link", { name: "See it work" }).getAttribute("href") ?? "";
    expect(href).toMatch(/^#/);
    expect(container.querySelector(href)).toHaveAccessibleName(/Watch a clinic get set up/);
  });
});
