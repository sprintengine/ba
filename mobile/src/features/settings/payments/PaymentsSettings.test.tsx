import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { business } from "@shared/api/__tests__/fixtures/business";
import { paymentsStatus } from "@shared/api/__tests__/fixtures/dashboard";
import type { PaymentsStatus } from "@shared/api/types";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import { PaymentsSettings } from "./PaymentsSettings";

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: "dismiss" })),
  maybeCompleteAuthSession: jest.fn(),
}));

const openBrowser = jest.mocked(WebBrowser.openBrowserAsync);
const PATH = `/v1/businesses/${business.id}/payments`;
const STRIPE_URL = "https://connect.stripe.test/setup/abc";

const notConnected: PaymentsStatus = {
  provider: "stripe",
  connected: false,
  chargesEnabled: false,
  detailsSubmitted: false,
};

function api(
  status: PaymentsStatus | (() => unknown),
  connect: (body: unknown) => unknown = () => ({ url: STRIPE_URL }),
) {
  const bodies: unknown[] = [];
  const fetch = mockApi((method, path, body) => {
    if (method === "GET" && path === `${PATH}/status`)
      return typeof status === "function" ? status() : status;
    if (method === "POST" && path === `${PATH}/connect`) {
      bodies.push(body);
      return connect(body);
    }
    if (path === "/v1/me") return { memberships: [] };
    return undefined;
  });
  return { fetch, bodies };
}

const render = (role: "owner" | "admin" = "owner") =>
  renderBusinessScreen(<PaymentsSettings />, { path: "settings/payments", role });

describe("Settings › Payments", () => {
  beforeEach(() => openBrowser.mockClear());

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
