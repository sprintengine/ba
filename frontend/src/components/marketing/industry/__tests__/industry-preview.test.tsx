import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "@/components/shells/industries";
import { TooltipProvider } from "@/components/ui/tooltip";
import { must } from "@/test/must";
import { INDUSTRY_CONTENT } from "../../industry-content";
import { IndustryPreview } from "../industry-preview";
import {
  bookedSummary,
  nextOpenDays,
  previewCta,
  previewTimes,
  visiblePreviewServices,
} from "../preview-logic";

const renderPreview = (slug: (typeof INDUSTRIES)[number]["slug"]) =>
  render(
    <TooltipProvider>
      <IndustryPreview slug={slug} />
    </TooltipProvider>,
  );

describe("IndustryPreview", () => {
  it.each(INDUSTRIES.map((i) => i.slug))("renders the %s example business", (slug) => {
    renderPreview(slug);
    expect(screen.getByText(INDUSTRY_CONTENT[slug].business.name)).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Service" })).toBeInTheDocument();
  });

  it("prices the chosen size and extras, then confirms", async () => {
    const user = userEvent.setup();
    renderPreview("car-wash");
    // Defaults: the second size with the first extra.
    expect(screen.getByRole("button", { name: /^Pay €20 deposit$/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Small car/ }));
    expect(screen.getByRole("button", { name: /^Small car/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /deposit/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Next: secure checkout");
    await user.click(screen.getByRole("button", { name: /start over/i }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("hides restricted services for other customer groups", async () => {
    const user = userEvent.setup();
    renderPreview("music-lessons");
    const content = INDUSTRY_CONTENT["music-lessons"];
    const groups = must(content.preview.groups, "music groups");
    const restricted = content.services.find((s) => s.restriction);
    await user.click(screen.getByRole("radio", { name: must(groups[1], "second group").label }));
    if (restricted)
      expect(screen.queryByRole("radio", { name: new RegExp(restricted.name) })).not.toBeInTheDocument();
    expect(screen.getByText(must(groups[1], "second group").hint)).toBeInTheDocument();
  });
});

describe("preview logic", () => {
  it("lists the next open days of the demo schedule", () => {
    const days = nextOpenDays("2026-09-29", 5);
    expect(days).toHaveLength(5);
    expect(days.every((d) => d > "2026-09-29")).toBe(true);
    expect(days).not.toContain("2026-10-04"); // Sunday
  });

  it("drops restricted services outside the first group", () => {
    const music = INDUSTRY_CONTENT["music-lessons"];
    const all = visiblePreviewServices(music, 0);
    const others = visiblePreviewServices(music, 1);
    expect(all.map((v) => v.index)).toEqual(music.preview.serviceIndexes);
    expect(others.every((v) => !v.service.restriction)).toBe(true);
  });

  it("words the button by payment mode", () => {
    const base = must(INDUSTRY_CONTENT.physio.services[0], "physio service");
    expect(previewCta({ ...base, paymentMode: "full" }, 7000, "Appointment")).toBe("Pay €70 and book");
    expect(previewCta({ ...base, paymentMode: "deposit" }, 2000, "Appointment")).toBe("Pay €20 deposit");
    expect(previewCta({ ...base, paymentMode: "at_venue" }, 0, "Appointment")).toBe("Book appointment");
    expect(previewCta({ ...base, name: "Trial lesson", paymentMode: "free" }, 0, "Lesson")).toBe(
      "Book free trial lesson",
    );
  });

  it("offers GP medical card holders only the reserved times", () => {
    const gp = INDUSTRY_CONTENT["gp-practice"];
    const reserved = previewTimes(gp, 1, null);
    expect(reserved).toMatchObject({
      reserved: true,
      slots: gp.preview.slots.slice(0, 3),
      slot: gp.preview.slots[1],
    });
    const picked = must(gp.preview.slots[2], "third time");
    expect(previewTimes(gp, 0, picked)).toMatchObject({ reserved: false, slot: picked });
    expect(previewTimes(INDUSTRY_CONTENT.physio, 1, null).reserved).toBe(false);
  });

  it("summarises the booking for the confirmation", () => {
    const base = must(INDUSTRY_CONTENT.physio.services[0], "physio service");
    expect(bookedSummary({ ...base, paymentMode: "deposit" }, "2026-10-06", "10:30", "Appointment")).toEqual({
      title: "Next: secure checkout",
      detail: `${base.name} · Tuesday, 6 October at 10:30`,
    });
    expect(bookedSummary({ ...base, paymentMode: "at_venue" }, undefined, undefined, "Appointment")).toEqual({
      title: "Appointment confirmed",
      detail: `${base.name} at `,
    });
  });
});
