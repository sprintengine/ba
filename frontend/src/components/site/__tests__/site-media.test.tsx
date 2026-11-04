import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SiteImage } from "@/lib/api/types";
import { SiteImageFill } from "../site-media";

const photo: SiteImage = {
  kind: "upload",
  url: "https://uploads.example/hero.jpg",
  alt: "The studio",
  pattern: null,
  attribution: null,
};

describe("SiteImageFill", () => {
  it("fetches an eager image (the hero) at high priority, and lazy ones lazily", () => {
    const { unmount } = render(<SiteImageFill image={photo} fallbackPattern="mesh" eager />);
    const hero = screen.getByRole("img", { name: "The studio" });
    expect(hero).toHaveAttribute("loading", "eager");
    expect(hero).toHaveAttribute("fetchpriority", "high");
    unmount();

    render(<SiteImageFill image={photo} fallbackPattern="mesh" />);
    const card = screen.getByRole("img", { name: "The studio" });
    expect(card).toHaveAttribute("loading", "lazy");
    expect(card).not.toHaveAttribute("fetchpriority");
  });
});
