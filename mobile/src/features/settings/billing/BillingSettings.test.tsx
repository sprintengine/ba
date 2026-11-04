import { act, fireEvent, screen, within } from "@testing-library/react-native";
import { aiUsage, aiUsageSparse } from "@shared/api/__tests__/fixtures/ai";
import { business } from "@shared/api/__tests__/fixtures/business";
import { billing, billingSparse } from "@shared/api/__tests__/fixtures/dashboard";
import type { AiUsage, BillingInfo } from "@shared/api/types";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import { BillingSettings } from "./BillingSettings";
import { currentPlan, planStatus } from "./plans";

const PATH = `/v1/businesses/${business.id}`;

function api({
  info = billing,
  usage = aiUsage,
}: { info?: BillingInfo | (() => unknown); usage?: AiUsage | (() => unknown) } = {}) {
  return mockApi((method, path) => {
    if (path === `${PATH}/billing`) return typeof info === "function" ? info() : info;
    if (path === `${PATH}/ai/usage`) return typeof usage === "function" ? usage() : usage;
    if (path === "/v1/me") return { memberships: [] };
    return undefined;
  });
}

const render = (role: "owner" | "admin" = "owner") =>
  renderBusinessScreen(<BillingSettings />, { path: "settings/billing", role });

describe("Settings › Billing (read-only)", () => {
  it("shows the plan, its status, what it includes and this month's bookings", async () => {
    api();
    render();
    const plan = await screen.findByTestId("billing-plan");
    expect(within(plan).getByText("Current plan: Pro")).toBeOnTheScreen();
    expect(within(plan).getByText("Active")).toBeOnTheScreen();
    expect(within(plan).getByText("Thanks for supporting bookanything.")).toBeOnTheScreen();
    expect(screen.queryByTestId("billing-status")).toBeNull();
    expect(screen.getByTestId("billing-bookings-meter")).toHaveAccessibleName("Appointments this month");
    expect(screen.getByTestId("billing-bookings-meter").props.accessibilityValue).toEqual({
      min: 0,
      max: 500,
      now: 41,
      text: "41 / 500",
    });
    expect(within(plan).getByLabelText("Online payments")).toBeOnTheScreen();
    expect(screen.getByTestId("billing-no-changes")).toHaveTextContent(
      "Plan changes aren't available in the app.",
    );
  });

  it("never offers buying, other plans, prices or the website", async () => {
    const fetch = api();
    render();
    await screen.findByTestId("billing-plan");
    expect(
      screen.queryByText(/Upgrade|Switch to|Subscribe|Manage subscription|See plans|€|\/ month/i),
    ).toBeNull();
    expect(screen.queryByText("Free")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    // The only buttons are the AI usage list's own.
    expect(screen.queryAllByRole("button").map((b) => b.props.accessibilityLabel)).not.toContainEqual(
      expect.stringMatching(/plan|billing|stripe|subscri/i),
    );
    expect(calls(fetch).filter((c) => /checkout|portal/.test(c))).toEqual([]);
  });

  it.each([
    ["trialing", "Trial", "You're on a free trial of this plan."],
    ["past_due", "Past due", "The latest payment for this plan didn't go through."],
    ["canceled", "Canceled", "This subscription has been canceled."],
  ])("explains a %s subscription", async (status, badge, text) => {
    api({ info: { ...billing, status } });
    render();
    expect(await screen.findByText(badge)).toBeOnTheScreen();
    expect(screen.getByTestId("billing-status")).toHaveTextContent(text);
  });

  it("shows unlimited bookings without a meter", async () => {
    api({ info: billingSparse });
    render();
    expect(await screen.findByText("41 appointments this month · unlimited")).toBeOnTheScreen();
    expect(screen.queryByTestId("billing-bookings-meter")).toBeNull();
  });

  it("warns near and at the free limit, and falls back to the plan's usual features", async () => {
    api({ info: { ...billing, plan: "free", prices: [], usage: { bookingsThisMonth: 80, limit: 100 } } });
    const view = render();
    expect(await screen.findByText("Current plan: Free")).toBeOnTheScreen();
    expect(screen.getByText("Free forever for small businesses.")).toBeOnTheScreen();
    expect(screen.getByText("You're getting close to the free limit.")).toBeOnTheScreen();
    expect(screen.getByLabelText("100 bookings a month")).toBeOnTheScreen();
    view.unmount();

    api({ info: { ...billing, plan: "free", prices: [], usage: { bookingsThisMonth: 100, limit: 100 } } });
    render();
    expect(
      await screen.findByText("Limit reached — new online appointments are paused until next month."),
    ).toBeOnTheScreen();
  });

  it("shows this month's AI credits, what used them, and per day", async () => {
    api();
    render();
    const meter = await screen.findByTestId("ai-credits-meter");
    expect(meter).toHaveAccessibleName("AI credits this month");
    expect(meter.props.accessibilityValue).toEqual({
      min: 0,
      max: 500,
      now: 120.5,
      text: "379 credits left",
    });
    expect(screen.getByText(/379 left · resets/)).toBeOnTheScreen();
    expect(screen.queryByTestId("ai-credits-notice")).toBeNull();
    expect(screen.getByTestId("ai-feature-site_generate")).toHaveAccessibleName(
      "Website builder: 80 credits, 3 requests",
    );
    expect(screen.getByTestId("ai-feature-assistant")).toHaveAccessibleName(
      "Assistant: 40 credits, 12 requests",
    );
    expect(screen.getByTestId("ai-day-2026-10-02")).toHaveAccessibleName(/2026: 20 credits$/);
    expect(screen.queryByText(/No AI model is connected/)).toBeNull();
  });

  it("says when credits run low or out, with no way to buy more", async () => {
    api({
      usage: { ...aiUsage, credits: { ...aiUsage.credits, runningLow: true, remaining: 50, used: 450 } },
    });
    const view = render();
    expect(await screen.findByTestId("ai-credits-notice")).toHaveTextContent(
      /Running low on AI credits: 50 left until/,
    );
    view.unmount();

    api({
      usage: {
        ...aiUsageSparse,
        credits: { ...aiUsage.credits, limitReached: true, remaining: 0, used: 500, overage: true },
        byFeature: [],
      },
    });
    render();
    expect(await screen.findByTestId("ai-credits-notice")).toHaveTextContent(
      /This month's AI credits are used up/,
    );
    expect(screen.queryByText(/See plans/)).toBeNull();
    expect(screen.getByText(/usage past the allowance is billed/)).toBeOnTheScreen();
    expect(screen.getByText(/No AI model is connected/)).toBeOnTheScreen();
    expect(screen.getByText("No AI used yet this month.")).toBeOnTheScreen();
  });

  it("shows the last week of days until asked for all of them", async () => {
    const daily = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      credits: i,
    }));
    api({ usage: { ...aiUsage, daily } });
    render();
    expect(await screen.findByTestId("ai-day-2026-10-10")).toBeOnTheScreen();
    expect(screen.queryByTestId("ai-day-2026-10-01")).toBeNull();
    fireEvent.press(screen.getByTestId("ai-days-toggle"));
    expect(screen.getByTestId("ai-day-2026-10-01")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Show the last week" })).toBeOnTheScreen();
  });

  it("shows errors with a retry", async () => {
    let fail = true;
    api({
      info: () => (fail ? apiError(500, "INTERNAL", "Billing is down") : billing),
      usage: () => (fail ? apiError(500, "INTERNAL", "Usage is down") : aiUsage),
    });
    render();
    expect(await screen.findByText("Billing is down")).toBeOnTheScreen();
    fail = false;
    await act(async () => fireEvent.press(screen.getByRole("button", { name: /try again/i })));
    expect(await screen.findByTestId("billing-plan")).toBeOnTheScreen();
  });

  it("shows the AI usage error inside its card", async () => {
    api({ usage: () => apiError(500, "INTERNAL", "Usage is down") });
    render();
    expect(await screen.findByText("Usage is down")).toBeOnTheScreen();
    expect(screen.getByTestId("billing-plan")).toBeOnTheScreen();
  });

  it("tells admins that only owners manage billing, without loading it", async () => {
    const fetch = api();
    render("admin");
    expect(await screen.findByText("Only owners manage billing")).toBeOnTheScreen();
    expect(
      screen.getByText("Ask an owner of this business to change the plan or see invoices."),
    ).toBeOnTheScreen();
    expect(calls(fetch).filter((c) => c.includes("/billing"))).toEqual([]);
  });
});

describe("plan helpers", () => {
  it("names the plan and humanises unknown statuses", () => {
    expect(currentPlan({ ...billing, plan: "business", prices: [] }).name).toBe("Business");
    expect(currentPlan(billing)).toEqual({ name: "Pro", features: ["Online payments"] });
    expect(planStatus("incomplete_expired")).toEqual({ label: "Incomplete expired", tone: "neutral" });
    expect(planStatus("")).toEqual({ label: "Unknown", tone: "neutral" });
  });
});
