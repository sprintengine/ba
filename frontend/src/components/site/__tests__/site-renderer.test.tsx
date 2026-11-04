import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { must } from "@/test/must";
import type { SectionContentMap, SitePlan, SiteSectionType } from "@/lib/api/types";
import { SITE_THEME_KEYS } from "@/lib/site/themes";
import { SAMPLE_BUSINESS, SAMPLE_CONTEXT, SAMPLE_SERVICES, samplePlan } from "../sample-site";
import { SiteRenderer, type SiteRendererProps } from "../site-renderer";

function renderSite(plan: SitePlan, props: Partial<SiteRendererProps> = {}) {
  return render(
    <SiteRenderer
      plan={plan}
      business={SAMPLE_BUSINESS}
      services={SAMPLE_SERVICES}
      context={SAMPLE_CONTEXT}
      {...props}
    />,
  );
}

/** A plan with just one section of `type` (enabled), with the given content. */
function only<T extends SiteSectionType>(
  type: T,
  content: SectionContentMap[T],
  theme: SitePlan["theme"] = "minimal",
): SitePlan {
  return {
    ...samplePlan(theme),
    sections: [{ id: type, type, enabled: true, content } as SitePlan["sections"][number]],
  };
}

const main = () => screen.getByRole("main");
const sample = <T extends SiteSectionType>(type: T) =>
  samplePlan().sections.find((s) => s.type === type)!.content as SectionContentMap[T];

beforeEach(() => {
  // Wednesday 30 September 2026, 10:00 in Dublin.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("SiteRenderer", () => {
  it("applies the theme as a data-theme scope with tokens, fonts and a container", () => {
    const { container } = renderSite(samplePlan("editorial", "#be185d"));
    const scope = container.querySelector("[data-theme]") as HTMLElement;
    expect(scope).toHaveAttribute("data-theme", "editorial");
    expect(scope.className).toContain("@container/site");
    expect(scope.className).toContain("var-mock--font-instrument-serif");
    expect(scope.style.getPropertyValue("--radius-button")).toBe("0");
    expect(scope.style.getPropertyValue("--tl-brand")).toMatch(/^#/);
    expect(scope.style.getPropertyValue("--td-brand")).toMatch(/^#/);
    expect(scope).not.toHaveAttribute("data-mode");
  });

  it("forces light or dark for previews", () => {
    const { container } = renderSite(samplePlan(), { colorMode: "dark" });
    expect(container.querySelector("[data-theme]")).toHaveAttribute("data-mode", "dark");
  });

  it.each(SITE_THEME_KEYS)("renders the full sample site in the %s theme", (theme) => {
    renderSite(samplePlan(theme));
    expect(
      screen.getByRole("heading", { level: 1, name: "Feel at home from the first visit" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Services" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Book First visit/ })[0]).toHaveAttribute(
      "href",
      "/harbour-lane-studio/book?service=svc-intro",
    );
  });

  it("renders enabled sections in order, skips disabled ones and builds the nav from them", () => {
    const plan = samplePlan();
    renderSite({
      ...plan,
      sections: plan.sections.map((s) => (s.id === "faq" ? { ...s, enabled: false } : s)),
    });
    const ids = [...main().querySelectorAll("[data-section-id]")].map((el) =>
      el.getAttribute("data-section-id"),
    );
    expect(ids).toEqual(["hero", "services", "about", "team", "testimonials", "hours", "cta", "contact"]);
    const nav = screen.getByRole("navigation", { name: "Site" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["Services", "About", "Team", "Reviews", "Visit", "Contact"]);
    expect(within(nav).getByRole("link", { name: "Services" })).toHaveAttribute("href", "#services");
  });

  it("offers the sections in a menu on narrow pages, closed by a link or Escape", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    renderSite(samplePlan("calm"));
    const toggle = screen.getByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    // The inline nav and the menu's panel (CSS shows one of them by width).
    const menu = must(screen.getAllByRole("navigation", { name: "Site" })[1], "menu");
    await user.click(within(menu).getByRole("link", { name: "About" }));
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.keyboard("{Escape}");
    expect(screen.getAllByRole("navigation", { name: "Site" })).toHaveLength(1);
  });

  it("has a Book link in the header, the footer and a mobile bar, all into the booking flow", () => {
    renderSite(samplePlan());
    const books = screen.getAllByRole("link", { name: /^Book (now|online)/ });
    expect(books.length).toBeGreaterThanOrEqual(4);
    books.forEach((a) => expect(a).toHaveAttribute("href", "/harbour-lane-studio/book"));
  });

  it("thumbnail mode renders only the hero, with no chrome", () => {
    renderSite(samplePlan(), { mode: "thumbnail" });
    expect(main().querySelectorAll("[data-section-id]")).toHaveLength(1);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("marks the selected section in the editor preview", () => {
    const { container } = renderSite(samplePlan(), { mode: "preview", selectedSectionId: "faq" });
    expect(container.querySelector("[data-selected] [data-section-id]")).toHaveAttribute(
      "data-section-id",
      "faq",
    );
  });
});

describe("section blocks", () => {
  describe("hero", () => {
    it.each(["split", "cover", "minimal"] as const)(
      "%s variant renders headline, intro, CTA and place",
      (variant) => {
        const { container } = renderSite(only("hero", { ...sample("hero"), variant }));
        expect(container.querySelector("[data-hero-variant]")).toHaveAttribute("data-hero-variant", variant);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Feel at home");
        expect(screen.getByText(/Friendly, unhurried/)).toBeInTheDocument();
        expect(screen.getByText("Dublin 2 · Book online")).toBeInTheDocument();
        expect(screen.getByText("4 Harbour Lane, Dublin")).toBeInTheDocument();
      },
    );

    it("minimal content: headline only, default CTA, generated background", () => {
      const { container } = renderSite(
        only("hero", {
          variant: "split",
          eyebrow: null,
          headline: "Hello",
          subheadline: null,
          ctaLabel: null,
          image: null,
        }),
      );
      expect(screen.getByRole("heading", { level: 1, name: "Hello" })).toBeInTheDocument();
      expect(within(main()).getByRole("link", { name: /Book now/ })).toBeInTheDocument();
      expect(within(main()).queryByRole("link", { name: "View services" })).not.toBeInTheDocument();
      expect(container.querySelector("[data-pattern]")).toBeInTheDocument();
    });

    it("shows uploaded and stock photos, crediting Unsplash photographers", () => {
      renderSite(
        only("hero", {
          ...sample("hero"),
          image: {
            kind: "stock",
            url: "https://images.unsplash.com/photo-1",
            alt: "A bright room",
            pattern: null,
            attribution: { name: "Pat Doe", url: "https://unsplash.com/@pat" },
          },
        }),
      );
      const photo = screen.getByRole("img", { name: "A bright room" });
      expect(photo).toHaveAttribute("src", "https://images.unsplash.com/photo-1");
      // The hero is the largest paint: fetched first, not lazily.
      expect(photo).toHaveAttribute("loading", "eager");
      expect(photo).toHaveAttribute("fetchpriority", "high");
      expect(screen.getByRole("link", { name: "Pat Doe" })).toHaveAttribute(
        "href",
        "https://unsplash.com/@pat",
      );
      expect(screen.getByRole("link", { name: "Unsplash" })).toBeInTheDocument();
    });
  });

  describe("services", () => {
    it.each(SITE_THEME_KEYS)("%s layout shows live names, prices and durations", (theme) => {
      renderSite(only("services", sample("services"), theme));
      expect(screen.getByText("First visit")).toBeInTheDocument();
      expect(screen.getAllByText("From €40").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
      expect(screen.getAllByText("1 h").length).toBeGreaterThan(0);
    });

    it("shows only chosen services, in order, and can hide prices and durations", () => {
      renderSite(
        only("services", {
          heading: "Menu",
          intro: null,
          serviceIds: ["svc-chat", "svc-intro"],
          showPrices: false,
          showDurations: false,
        }),
      );
      const links = within(main()).getAllByRole("link", { name: /^Book / });
      expect(links.map((l) => l.getAttribute("aria-label"))).toEqual([
        "Book Free intro call",
        "Book First visit",
      ]);
      expect(screen.queryByText("€70")).not.toBeInTheDocument();
      expect(screen.queryByText("10 min")).not.toBeInTheDocument();
    });

    it("is hidden publicly without services and shows a hint in the preview", () => {
      const plan = only("services", sample("services"));
      const { unmount } = render(
        <SiteRenderer plan={plan} business={SAMPLE_BUSINESS} services={[]} context={SAMPLE_CONTEXT} />,
      );
      expect(main().querySelector("[data-section-id]")).toBeNull();
      unmount();
      render(
        <SiteRenderer
          plan={plan}
          business={SAMPLE_BUSINESS}
          services={[]}
          context={SAMPLE_CONTEXT}
          mode="preview"
        />,
      );
      expect(screen.getByText("No services to show")).toBeInTheDocument();
    });
  });

  describe("team", () => {
    it("shows everyone from resources with their descriptions", () => {
      renderSite(only("team", sample("team")));
      expect(screen.getByRole("heading", { name: "Robin Vale" })).toBeInTheDocument();
      expect(screen.getByText("Works with clients of every age and pace.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Jules Moreno" })).toBeInTheDocument();
    });

    it("shows chosen people with section bios", () => {
      renderSite(
        only("team", {
          heading: "Team",
          intro: "Hi",
          members: [{ resourceId: "res-3", bio: "Plays the cello.", photo: null }],
        }),
      );
      expect(screen.getByText("Plays the cello.")).toBeInTheDocument();
      expect(screen.queryByText("Robin Vale")).not.toBeInTheDocument();
    });

    it("is hidden publicly when there are no people", () => {
      render(
        <SiteRenderer
          plan={only("team", sample("team"))}
          business={SAMPLE_BUSINESS}
          services={SAMPLE_SERVICES}
          context={{ ...SAMPLE_CONTEXT, team: [] }}
        />,
      );
      expect(main().querySelector("[data-section-id]")).toBeNull();
    });
  });

  describe("about", () => {
    it("renders paragraphs and highlights", () => {
      renderSite(only("about", sample("about")));
      expect(screen.getByText(/We opened on Harbour Lane/)).toBeInTheDocument();
      expect(screen.getByText(/Every appointment starts/)).toBeInTheDocument();
      expect(screen.getByText("Step-free access")).toBeInTheDocument();
    });

    it("minimal: text only; empty: hidden publicly, hint in preview", () => {
      renderSite(only("about", { heading: "About", body: "Just us.", highlights: [], image: null }));
      expect(screen.getByText("Just us.")).toBeInTheDocument();
      const empty = only("about", { heading: "About", body: "", highlights: [], image: null });
      const { container } = renderSite(empty);
      expect(container.querySelector("main [data-section-id]")).toBeNull();
      renderSite(empty, { mode: "preview" });
      expect(screen.getByText("Tell your story")).toBeInTheDocument();
    });
  });

  describe("gallery", () => {
    it("renders photos and hides when empty", () => {
      const img = (n: number) => ({
        kind: "upload" as const,
        url: `https://x.test/${n}.jpg`,
        alt: `Photo ${n}`,
        pattern: null,
        attribution: null,
      });
      renderSite(only("gallery", { heading: "Our space", images: [img(1), img(2), img(3)] }));
      expect(screen.getAllByRole("img").map((i) => i.getAttribute("alt"))).toEqual([
        "Photo 1",
        "Photo 2",
        "Photo 3",
      ]);
      const { container } = renderSite(only("gallery", { heading: null, images: [] }));
      expect(container.querySelector("main [data-section-id]")).toBeNull();
    });
  });

  describe("testimonials", () => {
    it("renders owner-provided quotes with attribution", () => {
      renderSite(only("testimonials", sample("testimonials")));
      expect(screen.getByText("“Booking took a minute and the visit was lovely.”")).toBeInTheDocument();
      expect(screen.getAllByText("Demo customer")).toHaveLength(2);
    });

    it("features a single quote", () => {
      renderSite(
        only("testimonials", {
          heading: "Kind words",
          items: [{ quote: "Lovely.", author: "Alex", detail: null }],
        }),
      );
      expect(screen.getByText("“Lovely.”")).toBeInTheDocument();
    });

    it("stays hidden publicly until there is one", () => {
      const empty = only("testimonials", { heading: "What people say", items: [] });
      const { container } = renderSite(empty);
      expect(container.querySelector("main [data-section-id]")).toBeNull();
      renderSite(empty, { mode: "preview" });
      expect(screen.getByText("No testimonials yet")).toBeInTheDocument();
    });
  });

  describe("faq", () => {
    it("renders questions as native disclosures", () => {
      const { container } = renderSite(only("faq", sample("faq")));
      expect(container.querySelectorAll("details")).toHaveLength(2);
      expect(screen.getByText("How do I book?")).toBeInTheDocument();
      expect(screen.getByText(/You'll get an email/)).toBeInTheDocument();
    });

    it("hides when empty", () => {
      const { container } = renderSite(only("faq", { heading: "FAQ", items: [] }));
      expect(container.querySelector("main [data-section-id]")).toBeNull();
    });
  });

  describe("hours", () => {
    it("lists the week from real availability and highlights today", () => {
      renderSite(only("hours", sample("hours")));
      const today = screen.getByText("Today").closest("div")!;
      expect(today).toHaveTextContent("Wednesday");
      expect(today).toHaveTextContent("09:00 – 13:00, 14:00 – 20:00");
      expect(within(main()).getByText("Closed")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Get directions/ })).toHaveAttribute(
        "href",
        expect.stringContaining("google.com/maps"),
      );
    });

    it("can hide the address and map link and show a note", () => {
      renderSite(
        only("hours", {
          heading: "Hours",
          note: "Free parking behind the building",
          showAddress: false,
          showMapLink: false,
        }),
      );
      expect(screen.getByText("Free parking behind the building")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Get directions/ })).not.toBeInTheDocument();
    });
  });

  describe("cta", () => {
    it("renders the band with a Book link", () => {
      renderSite(only("cta", { headline: "Ready?", body: null, buttonLabel: "Pick a time" }));
      expect(screen.getByRole("heading", { name: "Ready?" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Pick a time/ })).toHaveAttribute(
        "href",
        "/harbour-lane-studio/book",
      );
    });
  });

  describe("contact", () => {
    it("links phone, email and address", () => {
      renderSite(only("contact", sample("contact")));
      expect(within(main()).getByRole("link", { name: /\+353 1 555 0199/ })).toHaveAttribute(
        "href",
        "tel:+35315550199",
      );
      expect(within(main()).getByRole("link", { name: /hello@harbour-lane.test/ })).toHaveAttribute(
        "href",
        "mailto:hello@harbour-lane.test",
      );
    });

    it("respects the toggles and hides without any details", () => {
      renderSite(
        only("contact", {
          heading: "Contact",
          body: null,
          showPhone: false,
          showEmail: true,
          showAddress: false,
        }),
      );
      expect(within(main()).queryByRole("link", { name: /\+353/ })).not.toBeInTheDocument();
      const bare = {
        ...SAMPLE_BUSINESS,
        contactEmail: null,
        contactPhone: null,
        address: { line1: null, line2: null, city: null, postcode: null },
      };
      render(
        <SiteRenderer
          plan={only("contact", sample("contact"))}
          business={bare}
          services={SAMPLE_SERVICES}
          context={SAMPLE_CONTEXT}
        />,
      );
      expect(screen.getAllByRole("main")[1]?.querySelector("[data-section-id]")).toBeNull();
    });
  });
});
