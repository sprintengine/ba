import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentsStatus } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { mockApi, renderDashboard } from "../../test/render";
import { PaymentsSettings } from "../payments-settings";
import { apiError } from "./settings-fixtures";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  usePathname: () => "/dashboard/lumen-physio/settings/payments",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

const assign = vi.fn();
beforeEach(() => {
  nav.search = "";
  nav.replace.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
  assign.mockClear();
  vi.stubGlobal("location", {
    ...window.location,
    href: "http://localhost/dashboard/lumen-physio/settings/payments?stripe=return",
    assign,
  });
});
afterEach(() => vi.unstubAllGlobals());

const status = (patch: Partial<PaymentsStatus> = {}): PaymentsStatus => ({
  provider: "stripe",
  connected: false,
  chargesEnabled: false,
  detailsSubmitted: false,
  connectMethod: null,
  canConnectExisting: false,
  accountId: null,
  accountName: null,
  ...patch,
});

function api(
  state: () => unknown,
  connect: () => unknown = () => ({ url: "https://connect.stripe.test/o1" }),
  completed: () => unknown = () => ({ outcome: "connected", currency: null }),
) {
  const posts: unknown[] = [];
  mockApi((method, path, body) => {
    if (path.endsWith("/payments/status")) return state();
    if (path.endsWith("/payments/connect")) {
      posts.push(body);
      return connect();
    }
    if (path.endsWith("/payments/connect/existing/complete")) {
      posts.push({ complete: body });
      return completed();
    }
    if (path.endsWith("/payments/connect/existing")) {
      posts.push({ existing: body });
      return { url: "https://connect.stripe.com/oauth/authorize?state=s1" };
    }
    if (path.endsWith("/payments/disconnect")) {
      posts.push("disconnect");
      return status({ canConnectExisting: true });
    }
    return {};
  });
  return posts;
}

describe("PaymentsSettings", () => {
  it("shows the error and retries", async () => {
    let fail = true;
    api(() => (fail ? apiError(500, "INTERNAL_SERVER_ERROR", "Payments status is unavailable.") : status()));
    const user = userEvent.setup();
    renderDashboard(<PaymentsSettings />);
    expect(await screen.findByText("Payments status is unavailable.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Not connected")).toBeInTheDocument();
  });

  it("explains a server without payments", async () => {
    api(() => status({ provider: "none" }));
    renderDashboard(<PaymentsSettings />);
    expect(await screen.findByText("Payments aren't available yet")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("explains test payments on a development server", async () => {
    api(() => status({ provider: "dev" }));
    renderDashboard(<PaymentsSettings />);
    expect(await screen.findByText("Test mode is on")).toBeInTheDocument();
  });

  it("connects Stripe, coming back to this page; axe-clean", async () => {
    const posts = api(() => status());
    const user = userEvent.setup();
    const { container } = renderDashboard(<PaymentsSettings />);
    expect(await screen.findByText("Not connected")).toBeInTheDocument();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Connect with Stripe" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://connect.stripe.test/o1"));
    expect(posts).toEqual([{ returnUrl: "http://localhost/dashboard/lumen-physio/settings/payments" }]);
  });

  it("asks to finish a started setup, and says when Stripe is reviewing it", async () => {
    api(() => status({ connected: true }));
    const { unmount } = renderDashboard(<PaymentsSettings />);
    expect(await screen.findByText("Finish your Stripe setup to start taking payments.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue setup" })).toBeInTheDocument();
    unmount();

    api(() => status({ connected: true, detailsSubmitted: true }));
    renderDashboard(<PaymentsSettings />);
    expect(await screen.findByText(/Stripe is reviewing your details/)).toBeInTheDocument();
  });

  it("when connected, lets the owner update the Stripe details", async () => {
    api(() => status({ connected: true, chargesEnabled: true, detailsSubmitted: true }));
    const user = userEvent.setup();
    renderDashboard(<PaymentsSettings />);
    expect(await screen.findByText("Ready to take payments")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Update Stripe details" }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
  });

  it("only owners can connect", async () => {
    api(() => status());
    const { unmount } = renderDashboard(<PaymentsSettings />, "admin");
    expect(await screen.findByText("Only an owner can connect payments.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect with Stripe" })).not.toBeInTheDocument();
    unmount();

    api(() => status({ connected: true, chargesEnabled: true }));
    renderDashboard(<PaymentsSettings />, "admin");
    expect(await screen.findByText("Ready to take payments")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update Stripe details" })).not.toBeInTheDocument();
  });

  it("offers both ways to connect when the server can connect an existing account", async () => {
    const posts = api(() => status({ canConnectExisting: true }));
    const user = userEvent.setup();
    const { container } = renderDashboard(<PaymentsSettings />);
    const existing = await screen.findByRole("button", { name: /I already have a Stripe account/ });
    expect(screen.getByRole("button", { name: /Create one for me/ })).toBeInTheDocument();
    await expectNoAxeViolations(container);
    await user.click(existing);
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://connect.stripe.com/oauth/authorize?state=s1"),
    );
    expect(posts).toEqual([
      { existing: { returnUrl: "http://localhost/dashboard/lumen-physio/settings/payments" } },
    ]);
  });

  it("finishes connecting when Stripe sends the owner back, then clears the query", async () => {
    nav.search = "stripe=complete&code=ac_1&state=s1";
    const posts = api(() =>
      status({ connected: true, chargesEnabled: true, connectMethod: "oauth", accountName: "Lumen Ltd" }),
    );
    const { unmount } = renderDashboard(<PaymentsSettings />);
    expect(await screen.findByText("Your Stripe account is connected.")).toBeInTheDocument();
    expect(posts).toEqual([{ complete: { code: "ac_1", state: "s1" } }]);
    expect(nav.replace).toHaveBeenCalledWith("/dashboard/lumen-physio/settings/payments");
    unmount();

    nav.search = "stripe=complete&code=ac_2&state=s2";
    api(
      () => status({ canConnectExisting: true }),
      undefined,
      () => ({ outcome: "currency", currency: "GBP" }),
    );
    const second = renderDashboard(<PaymentsSettings />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /pays out in GBP but this business charges in EUR/,
    );
    second.unmount();

    nav.search = "stripe=connect_error&reason=denied";
    api(() => status({ canConnectExisting: true }));
    renderDashboard(<PaymentsSettings />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/declined on Stripe's page/);
  });

  it("manages an existing account in Stripe's dashboard and can disconnect it", async () => {
    const posts = api(() =>
      status({
        connected: true,
        chargesEnabled: true,
        detailsSubmitted: true,
        connectMethod: "oauth",
        accountId: "acct_123",
        accountName: "Lumen Ltd",
        canConnectExisting: true,
      }),
    );
    const user = userEvent.setup();
    renderDashboard(<PaymentsSettings />);
    expect(await screen.findByText("Lumen Ltd")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Stripe dashboard/ })).toHaveAttribute(
      "href",
      "https://dashboard.stripe.com",
    );
    expect(screen.queryByRole("button", { name: "Update Stripe details" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(await screen.findByText(/Our access to your Stripe account ends/)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Disconnect" }).at(-1)!);
    await waitFor(() => expect(posts).toEqual(["disconnect"]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Stripe is disconnected."));
  });

  it("reports a failure to start the Stripe flow", async () => {
    api(
      () => status(),
      () => apiError(502, "INTERNAL_SERVER_ERROR", "Stripe didn't answer."),
    );
    const user = userEvent.setup();
    renderDashboard(<PaymentsSettings />);
    await user.click(await screen.findByRole("button", { name: "Connect with Stripe" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Stripe didn't answer."));
    expect(assign).not.toHaveBeenCalled();
  });
});
