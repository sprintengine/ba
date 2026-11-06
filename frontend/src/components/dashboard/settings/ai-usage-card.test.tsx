import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AiUsage } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { ASSISTANT_ON, json, mockApi, renderDashboard, SITES_ON } from "../test/render";
import { AiUsageCard } from "./ai-usage-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const usage = (patch: Partial<AiUsage> = {}): AiUsage => ({
  plan: "free",
  timezone: "Europe/Dublin",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  credits: {
    limit: 180,
    used: 152.4,
    remaining: 27.6,
    runningLow: true,
    limitReached: false,
    resetsOn: "2026-11-01",
    overage: false,
  },
  model: { configured: true, name: "claude-opus-5-5" },
  byFeature: [
    { feature: "business_draft", label: "Business setup draft", credits: 0, requests: 0 },
    { feature: "site_generate", label: "Site generation", credits: 40.2, requests: 3 },
    { feature: "site_edit", label: "Site edits", credits: 0, requests: 0 },
    { feature: "assistant", label: "Assistant", credits: 112.2, requests: 41 },
  ],
  daily: [
    { date: "2026-10-01", credits: 12.5 },
    { date: "2026-10-02", credits: 0 },
    { date: "2026-10-03", credits: 139.9 },
  ],
  ...patch,
});

describe("AI usage card", () => {
  it("shows the meter, what used the credits and a per-day table", async () => {
    mockApi((_m, path) => (path.endsWith("/ai/usage") ? usage() : {}));
    const user = userEvent.setup();
    const { container } = renderDashboard(<AiUsageCard />, "owner", ASSISTANT_ON);
    const meter = await screen.findByRole("meter", { name: "AI credits this month" });
    expect(meter).toHaveAttribute("aria-valuenow", "152.4");
    expect(meter).toHaveAttribute("aria-valuetext", "27 credits left");
    expect(screen.getByText("152 / 180")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Running low on AI credits: 27 left until Sun, 1 Nov.",
    );
    const features = within(screen.getByRole("list", { name: "Credits by feature" })).getAllByRole(
      "listitem",
    );
    expect(features.map((f) => f.textContent)).toEqual([
      "Assistant112 credits · 41 requests",
      "Site generation40 credits · 3 requests",
    ]);
    expect(await screen.findByRole("img", { name: /AI credits used per day, 3 days/ })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Table" }));
    const rows = within(screen.getByRole("table"))
      .getAllByRole("row")
      .map((r) => r.textContent);
    expect(rows).toEqual([
      "DateCredits",
      expect.stringMatching(/^Sat, 3 Oct( 2026)?139$/),
      expect.stringMatching(/^Fri, 2 Oct( 2026)?0$/),
      expect.stringMatching(/^Thu, 1 Oct( 2026)?12$/),
    ]);
    await expectNoAxeViolations(container);
  });

  it("says so when no AI was used and no model is connected", async () => {
    mockApi(() =>
      usage({
        model: { configured: false, name: null },
        byFeature: [],
        daily: [],
        credits: {
          limit: 180,
          used: 0,
          remaining: 180,
          runningLow: false,
          limitReached: false,
          resetsOn: "2026-11-01",
          overage: false,
        },
      }),
    );
    renderDashboard(<AiUsageCard />, "owner", ASSISTANT_ON);
    expect(await screen.findByText("No AI used yet this month.")).toBeInTheDocument();
    expect(screen.getByText(/No AI model is connected on this server/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says what the credits are for: Bo and the site builder where they're offered", () => {
    mockApi(() => usage());
    const description = /^One monthly allowance for (.+)\. Each AI request/;
    const uses = () => description.exec(screen.getByText(description).textContent)?.[1];
    const { unmount } = renderDashboard(<AiUsageCard />, "owner", { ...ASSISTANT_ON, ...SITES_ON });
    expect(uses()).toBe("Bo and the AI site builder");
    unmount();
    renderDashboard(<AiUsageCard />, "owner", SITES_ON);
    expect(uses()).toBe("the AI site builder");
  });

  it("isn't shown, nor asked for, where nothing uses the credits (no Bo, no site builder)", () => {
    const fetch = mockApi(() => usage());
    const { container } = renderDashboard(<AiUsageCard />);
    expect(container).toBeEmptyDOMElement();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a failure with a retry", async () => {
    let fail = true;
    mockApi(() =>
      fail
        ? json(
            { error: { code: "INTERNAL_SERVER_ERROR", message: "AI usage is unavailable.", fields: {} } },
            500,
          )
        : usage(),
    );
    const user = userEvent.setup();
    renderDashboard(<AiUsageCard />, "owner", ASSISTANT_ON);
    expect(await screen.findByText("AI usage is unavailable.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("meter", { name: "AI credits this month" })).toBeInTheDocument();
  });
});
