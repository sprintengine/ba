import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";
import { business } from "@shared/api/__tests__/fixtures/business";
import { paymentsStatus } from "@shared/api/__tests__/fixtures/dashboard";
import type { PaymentsStatus } from "@shared/api/types";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import { PaymentsSettings } from "./PaymentsSettings";

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: "dismiss" })),
  openAuthSessionAsync: jest.fn(() => Promise.resolve({ type: "dismiss" })),
  maybeCompleteAuthSession: jest.fn(),
}));
// The website on https, as in production: its address closes an authentication session.
jest.mock("~/lib/links", () => ({
  ...jest.requireActual<object>("~/lib/links"),
  websiteUrl: (path: string) => `https://bookanything.example${path}`,
}));

const openBrowser = jest.mocked(WebBrowser.openBrowserAsync);
const openAuthSession = jest.mocked(WebBrowser.openAuthSessionAsync);
const BACK = "https://bookanything.example/dashboard/lumen-physio/settings/payments";
const PATH = `/v1/businesses/${business.id}/payments`;
const STRIPE_URL = "https://connect.stripe.test/setup/abc";
const OAUTH_URL = "https://connect.stripe.com/oauth/authorize?state=s1";

const notConnected: PaymentsStatus = {
  provider: "stripe",
  connected: false,
  chargesEnabled: false,
  detailsSubmitted: false,
  connectMethod: null,
  canConnectExisting: false,
  accountId: null,
  accountName: null,
};

function api(
  status: PaymentsStatus | (() => unknown),
  connect: (body: unknown) => unknown = () => ({ url: STRIPE_URL }),
  completed: () => unknown = () => ({ outcome: "connected", currency: null }),
) {
  const bodies: unknown[] = [];
  const fetch = mockApi((method, path, body) => {
    if (method === "GET" && path === `${PATH}/status`)
      return typeof status === "function" ? status() : status;
    if (method === "POST" && path === `${PATH}/connect`) {
      bodies.push(body);
      return connect(body);
    }
    if (method === "POST" && path === `${PATH}/connect/existing/complete`) {
      bodies.push({ complete: body });
      return completed();
    }
    if (method === "POST" && path === `${PATH}/connect/existing`) {
      bodies.push({ existing: body });
      return { url: OAUTH_URL };
    }
    if (method === "POST" && path === `${PATH}/disconnect`) {
      bodies.push("disconnect");
      return { ...notConnected, canConnectExisting: true };
    }
    if (path === "/v1/me") return { memberships: [] };
    return undefined;
  });
  return { fetch, bodies };
}

const render = (role: "owner" | "admin" = "owner") =>
  renderBusinessScreen(<PaymentsSettings />, { path: "settings/payments", role });

describe("Settings › Payments", () => {
  beforeEach(() => {
    openBrowser.mockClear();
    openAuthSession.mockReset().mockResolvedValue({ type: "dismiss" } as never);
  });

  it("connects Stripe in an in-app browser and reads the status again when it closes", async () => {
    let status = notConnected;
    const { fetch, bodies } = api(() => status);
    render();
    expect(await screen.findByText("Not connected")).toBeOnTheScreen();
    expect(screen.getByText("0% platform fee")).toBeOnTheScreen();
    status = paymentsStatus;
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Connect with Stripe" })));

    await waitFor(() => expect(openBrowser).toHaveBeenCalledWith(STRIPE_URL));
    expect(bodies).toEqual([
      { returnUrl: expect.stringMatching(/\/dashboard\/lumen-physio\/settings\/payments$/) },
    ]);
    expect(await screen.findByText("Ready to take payments")).toBeOnTheScreen();
    expect(calls(fetch).filter((c) => c.endsWith("/payments/status")).length).toBeGreaterThanOrEqual(2);
  });

  it("offers both ways to connect, and finishes connecting an existing account signed in", async () => {
    let status: PaymentsStatus = { ...notConnected, canConnectExisting: true };
    const { bodies } = api(() => status);
    openAuthSession.mockResolvedValue({ type: "success", url: `${BACK}?stripe=complete&code=ac_1&state=s1` });
    render();
    expect(await screen.findByText("Create one for me")).toBeOnTheScreen();
    status = {
      ...paymentsStatus,
      connectMethod: "oauth",
      accountId: "acct_123",
      accountName: "Lumen Ltd",
      canConnectExisting: true,
    };
    await act(async () => fireEvent.press(screen.getByTestId("payments-connect-existing")));
    await waitFor(() =>
      expect(openAuthSession).toHaveBeenCalledWith(OAUTH_URL, BACK, { preferUniversalLinks: true }),
    );
    expect(await screen.findByText("Your Stripe account is connected.")).toBeOnTheScreen();
    expect(bodies).toEqual([{ existing: { returnUrl: BACK } }, { complete: { code: "ac_1", state: "s1" } }]);
    expect(await screen.findByText(/Stripe account Lumen Ltd/)).toBeOnTheScreen();
    expect(screen.queryByTestId("payments-connect")).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId("payments-dashboard")));
    expect(openBrowser).toHaveBeenLastCalledWith("https://dashboard.stripe.com");
  });

  it("says why an existing account wasn't connected", async () => {
    const status: PaymentsStatus = { ...notConnected, canConnectExisting: true };
    api(status, undefined, () => ({ outcome: "currency", currency: "GBP" }));
    openAuthSession.mockResolvedValue({ type: "success", url: `${BACK}?stripe=complete&code=ac_2&state=s2` });
    render();
    await act(async () => fireEvent.press(await screen.findByTestId("payments-connect-existing")));
    expect(await screen.findByText(/pays out in GBP but this business charges in EUR/)).toBeOnTheScreen();

    openAuthSession.mockResolvedValue({ type: "success", url: `${BACK}?stripe=connect_error&reason=denied` });
    await act(async () => fireEvent.press(screen.getByTestId("payments-connect-existing")));
    expect(await screen.findByText(/declined on Stripe's page/)).toBeOnTheScreen();
  });

  it("finishes connecting when the website's payments page opens the app with Stripe's answer", async () => {
    const { bodies } = api({ ...notConnected, canConnectExisting: true });
    renderBusinessScreen(<PaymentsSettings />, {
      path: "settings/payments",
      query: "stripe=complete&code=ac_9&state=s9",
    });
    expect(await screen.findByText("Your Stripe account is connected.")).toBeOnTheScreen();
    expect(bodies).toEqual([{ complete: { code: "ac_9", state: "s9" } }]);
    expect(openAuthSession).not.toHaveBeenCalled();
  });

  it("disconnects after the owner confirms", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    const { fetch, bodies } = api({ ...paymentsStatus, connectMethod: "oauth", accountId: "acct_123" });
    render();
    await act(async () => fireEvent.press(await screen.findByTestId("payments-disconnect")));
    expect(alert).toHaveBeenCalledWith(
      "Disconnect Stripe?",
      expect.stringMatching(/Our access to your Stripe account ends/),
      expect.anything(),
    );
    await waitFor(() => expect(bodies).toEqual(["disconnect"]));
    expect(await screen.findByText("Stripe is disconnected")).toBeOnTheScreen();
    // The status is read again (this mock still answers connected).
    await waitFor(() =>
      expect(calls(fetch).filter((c) => c.endsWith("/payments/status")).length).toBeGreaterThanOrEqual(2),
    );
    await waitFor(() => expect(screen.getByTestId("payments-disconnect")).toBeEnabled());
    alert.mockRestore();
  });

  it("lets the owner update a connected account", async () => {
    api(paymentsStatus);
    render();
    expect(await screen.findByText("Stripe is connected")).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Ready to take payments\. Refunds/)).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByTestId("payments-connect")));
    await waitFor(() => expect(openBrowser).toHaveBeenCalledWith(STRIPE_URL));
    expect(screen.getByTestId("payments-connect")).toHaveAccessibleName("Update Stripe details");
  });

  it.each([
    [false, "Finish your Stripe setup to start taking payments."],
    [true, "Stripe is reviewing your details. This usually takes a few minutes."],
  ])("explains an unfinished setup (details submitted: %s)", async (detailsSubmitted, text) => {
    api({ ...notConnected, connected: true, detailsSubmitted });
    render();
    expect(await screen.findByText(text)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Continue setup" })).toBeOnTheScreen();
  });

  it("says when connecting fails, without opening the browser", async () => {
    api(notConnected, () => apiError(503, "PAYMENTS_NOT_CONFIGURED", "Stripe isn't set up on this server"));
    render();
    fireEvent.press(await screen.findByRole("button", { name: "Connect with Stripe" }));
    expect(await screen.findByText("Stripe isn't set up on this server")).toBeOnTheScreen();
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it("tells admins only an owner can connect", async () => {
    api(notConnected);
    render("admin");
    expect(await screen.findByText("Only an owner can connect payments.")).toBeOnTheScreen();
    expect(screen.queryByTestId("payments-connect")).toBeNull();
  });

  it("doesn't offer updating a connected account to admins", async () => {
    api(paymentsStatus);
    render("admin");
    expect(await screen.findByText("Stripe is connected")).toBeOnTheScreen();
    expect(screen.queryByTestId("payments-connect")).toBeNull();
  });

  it.each([
    ["none", "Payments aren't available yet", "Not configured"],
    ["dev", "Test payments", "Test mode is on"],
  ] as const)("explains the %s provider", async (provider, title, line) => {
    api({ ...notConnected, provider });
    render();
    expect(await screen.findByText(title)).toBeOnTheScreen();
    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(screen.queryByTestId("payments-connect")).toBeNull();
  });

  it("shows loading, then an error with a retry", async () => {
    let fail = true;
    api(() => (fail ? apiError(500, "INTERNAL", "Payments are down") : paymentsStatus));
    render();
    expect(screen.getByTestId("payments-loading")).toBeOnTheScreen();
    expect(await screen.findByText("Payments are down")).toBeOnTheScreen();
    fail = false;
    await act(async () => fireEvent.press(screen.getByRole("button", { name: /try again/i })));
    expect(await screen.findByText("Stripe is connected")).toBeOnTheScreen();
  });
});
