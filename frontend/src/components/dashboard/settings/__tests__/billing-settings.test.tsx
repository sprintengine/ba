import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BillingInfo } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { mockApi, renderDashboard } from "../../test/render";
import { BillingSettings } from "../billing-settings";
import { apiError } from "./settings-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio/settings/billing",
  useSearchParams: () => new URLSearchParams(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

const assign = vi.fn();
beforeEach(() => {
  toast.error.mockClear();
  assign.mockClear();
  vi.stubGlobal("location", {
    ...window.location,
    href: "http://localhost/dashboard/lumen-physio/settings/billing?checkout=done",
    assign,
  });
});
afterEach(() => vi.unstubAllGlobals());

const billing = (patch: Partial<BillingInfo> = {}): BillingInfo => ({
  plan: "free",
  status: "active",
  usage: { bookingsThisMonth: 40, limit: 100 },
  prices: [
    {
      plan: "business",
      name: "Business",
      amountCents: 3900,
      currency: "EUR",
      interval: "month",
      features: ["Priority support"],
    },
    {
      plan: "free",
      name: "Free",
      amountCents: 0,
      currency: "EUR",
      interval: "month",
      features: ["100 bookings"],
    },
    { plan: "pro", name: "Pro", amountCents: 1200, currency: "EUR", interval: "month", features: [] },
  ],
  ...patch,
});

type Routes = { info?: () => unknown; checkout?: () => unknown; portal?: () => unknown };

function api(routes: Routes = {}) {
  const posts: { path: string; body: unknown }[] = [];
  const fetchMock = mockApi((method, path, body) => {
    if (path.endsWith("/ai/usage")) return apiError(500, "INTERNAL_SERVER_ERROR", "AI usage is unavailable.");
    if (path.endsWith("/billing/checkout")) {
      posts.push({ path, body });
      return routes.checkout ? routes.checkout() : { url: "https://checkout.stripe.test/c1" };
    }
    if (path.endsWith("/billing/portal")) {
      posts.push({ path, body });
      return routes.portal ? routes.portal() : { url: "https://billing.stripe.test/p1" };
    }
    if (path.endsWith("/billing")) return routes.info ? routes.info() : billing();
    return {};
  });
  return { fetchMock, posts };
}

const planNames = () =>
  screen
    .getAllByText(/^(Free|Pro|Business)$/)
    .map((el) => el.textContent)
    .filter((t, i, all) => all.indexOf(t) === i);

describe("BillingSettings", () => {
  it("tells admins that only owners manage billing, without asking for billing data", () => {
    const { fetchMock } = api();
    renderDashboard(<BillingSettings />, "admin");
    expect(screen.getByText("Only owners manage billing")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/billing"))).toBe(false);
  });

  it("shows the error and retries", async () => {
    let fail = true;
    api({
      info: () => (fail ? apiError(500, "INTERNAL_SERVER_ERROR", "Billing is unavailable.") : billing()),
    });
    const user = userEvent.setup();
    renderDashboard(<BillingSettings />);
    expect(await screen.findByText("Billing is unavailable.")).toBeInTheDocument();
    fail = false;
    const [retry] = screen.getAllByRole("button", { name: "Try again" });
    await user.click(must(retry, "retry button"));
    expect(await screen.findByText(/Current plan:/)).toBeInTheDocument();
  });

  it("on Free: the usage meter, the plans in order and upgrade buttons; axe-clean", async () => {
    api();
    const { container } = renderDashboard(<BillingSettings />);
    const meter = await screen.findByRole("meter", { name: "Appointments this month" });
    expect(meter).toHaveAttribute("aria-valuenow", "40");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("40 / 100")).toBeInTheDocument();
    expect(screen.queryByText(/getting close/)).not.toBeInTheDocument();
    expect(screen.getByText("Free forever for small businesses.")).toBeInTheDocument();
    expect(planNames()).toEqual(["Free", "Pro", "Business"]);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade to Pro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade to Business" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Manage subscription/ })).not.toBeInTheDocument();
    // The AI card fails on its own without taking the page down.
    expect(await screen.findByText("AI usage is unavailable.")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("warns as the free limit gets close, and when it's reached", async () => {
    api({ info: () => billing({ usage: { bookingsThisMonth: 75, limit: 100 } }) });
    const { unmount } = renderDashboard(<BillingSettings />);
    expect(await screen.findByText("You're getting close to the free limit.")).toBeInTheDocument();
    unmount();

    api({ info: () => billing({ usage: { bookingsThisMonth: 120, limit: 100 } }) });
    renderDashboard(<BillingSettings />);
    expect(await screen.findByText(/Limit reached/)).toBeInTheDocument();
  });

  it("sends the owner to checkout, coming back to this page", async () => {
    const { posts } = api();
    const user = userEvent.setup();
    renderDashboard(<BillingSettings />);
    await user.click(await screen.findByRole("button", { name: "Upgrade to Pro" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/c1"));
    expect(posts).toEqual([
      {
        path: "/v1/businesses/b1/billing/checkout",
        body: { plan: "pro", returnUrl: "http://localhost/dashboard/lumen-physio/settings/billing" },
      },
    ]);
  });

  it("explains when plan changes aren't set up on the server", async () => {
    api({ checkout: () => apiError(503, "PAYMENTS_NOT_CONFIGURED", "Stripe isn't configured.") });
    const user = userEvent.setup();
    renderDashboard(<BillingSettings />);
    await user.click(await screen.findByRole("button", { name: "Upgrade to Business" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Plan changes aren't available on this server yet.");
    expect(alert).toHaveTextContent("Stripe isn't configured.");
    expect(assign).not.toHaveBeenCalled();
  });

  it("reports other checkout failures", async () => {
    api({ checkout: () => apiError(409, "CONFLICT", "A checkout is already open.") });
    const user = userEvent.setup();
    renderDashboard(<BillingSettings />);
    await user.click(await screen.findByRole("button", { name: "Upgrade to Pro" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A checkout is already open."));
  });

  it("on a paid plan: status, unlimited usage, the portal and switching plans", async () => {
    const { posts } = api({
      info: () => billing({ plan: "pro", status: "past_due", usage: { bookingsThisMonth: 1, limit: null } }),
    });
    const user = userEvent.setup();
    renderDashboard(<BillingSettings />);
    expect(await screen.findByText("past due")).toBeInTheDocument();
    expect(screen.getByText("Thanks for supporting bookanything.")).toBeInTheDocument();
    expect(screen.getByText(/1 appointment this month · unlimited/)).toBeInTheDocument();
    expect(screen.queryByRole("meter", { name: /this month/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to Business" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /to Pro/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Manage subscription and invoices" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://billing.stripe.test/p1"));
    expect(posts[0]?.path).toBe("/v1/businesses/b1/billing/portal");
  });

  it("on a paid plan, switching plans goes through the portal (a second checkout is refused)", async () => {
    const { posts } = api({ info: () => billing({ plan: "pro", status: "active" }) });
    const user = userEvent.setup();
    renderDashboard(<BillingSettings />);
    await user.click(await screen.findByRole("button", { name: "Switch to Business" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://billing.stripe.test/p1"));
    expect(posts.map((p) => p.path)).toEqual(["/v1/businesses/b1/billing/portal"]);
  });

  it("after a paid plan was cancelled, switching starts a new checkout", async () => {
    const { posts } = api({ info: () => billing({ plan: "pro", status: "canceled" }) });
    const user = userEvent.setup();
    renderDashboard(<BillingSettings />);
    await user.click(await screen.findByRole("button", { name: "Switch to Business" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/c1"));
    expect(posts.map((p) => p.path)).toEqual(["/v1/businesses/b1/billing/checkout"]);
  });

  it("falls back to the published prices when the server lists none", async () => {
    api({ info: () => billing({ prices: [] }) });
    renderDashboard(<BillingSettings />);
    expect(await screen.findByText("Unlimited bookings")).toBeInTheDocument();
    expect(planNames()).toEqual(["Free", "Pro", "Business"]);
  });
});
