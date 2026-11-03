import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { business } from "@shared/api/__tests__/fixtures/business";
import type { PaymentsStatus } from "@shared/api/types";
import { json, mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import { PoliciesSettings } from "./PoliciesSettings";
import { noticeLabel, noticeOptions, refundOptions } from "./policies";

const PATH = `/v1/businesses/${business.id}`;

const payments = (provider: PaymentsStatus["provider"]): PaymentsStatus => ({
  provider,
  connectMethod: null,
  canConnectExisting: false,
  accountId: null,
  accountName: null,
  connected: provider === "stripe",
  chargesEnabled: provider === "stripe",
  detailsSubmitted: provider === "stripe",
});

function api({
  provider = "dev",
  patch,
}: { provider?: PaymentsStatus["provider"]; patch?: (body: unknown) => unknown } = {}) {
  const patches: unknown[] = [];
  const fetch = mockApi((method, path, body) => {
    if (path.endsWith("/payments/status")) return payments(provider);
    if (method === "PATCH" && path === PATH) {
      patches.push(body);
      if (patch) return patch(body);
      const input = body as { policies: object };
      return { ...business, policies: { ...business.policies, ...input.policies } };
    }
    if (path === "/v1/me") return { memberships: [] };
    return undefined;
  });
  return { fetch, patches };
}

const render = (role: "owner" | "admin" = "owner") =>
  renderBusinessScreen(<PoliciesSettings />, { path: "settings/policies", role });

const summary = () => screen.getByText(/refund if they cancel|can't cancel online|cancel any time/);

async function choose(testID: string, option: string) {
  fireEvent.press(screen.getByTestId(testID));
  fireEvent.press(await screen.findByRole("button", { name: option }));
}

describe("Settings › Policies", () => {
  it("shows the current policies with their help and a plain-language summary", async () => {
    api();
    render("admin");
    expect(await screen.findByTestId("policies-notice")).toHaveAccessibleName("Minimum notice: 1 h");
    expect(screen.getByTestId("policies-max-advance")).toHaveDisplayValue("60");
    expect(screen.getByTestId("policies-cancel-hours")).toHaveDisplayValue("24");
    expect(screen.getByTestId("policies-hold")).toHaveDisplayValue("30");
    expect(screen.getByTestId("policies-refund")).toHaveAccessibleName("Refund for late cancellations: 50%");
    expect(screen.getByTestId("policies-require-phone")).toHaveProp("value", false);
    expect(screen.getByTestId("policies-max-advance")).toHaveAccessibleName("How far ahead, days");
    expect(screen.getByTestId("policies-cancel-hours")).toHaveAccessibleName(
      "Free cancellation up to, hours",
    );
    expect(screen.getByTestId("policies-hold")).toHaveAccessibleName("Hold the slot for, minutes");
    expect(screen.getByText("Long enough to pay, short enough not to block others.")).toBeOnTheScreen();
    expect(screen.getByTestId("policies-next-only").props.accessibilityHint).toMatch(
      /patients are offered the earliest one/,
    );
    expect(summary()).toHaveTextContent(
      "Patients get a full refund if they cancel at least 24 hours before. Later than that, they get 50% back.",
    );
    expect(screen.getByTestId("settings-save")).toBeDisabled();
  });

  it("updates the summary as the policy changes", async () => {
    api();
    render();
    fireEvent(await screen.findByTestId("policies-allow-cancel"), "valueChange", false);
    expect(summary()).toHaveTextContent("Patients can't cancel online — they need to contact you.");
    fireEvent(screen.getByTestId("policies-allow-cancel"), "valueChange", true);
    fireEvent.changeText(screen.getByTestId("policies-cancel-hours"), "0");
    expect(summary()).toHaveTextContent("Patients can cancel any time before the start for a full refund.");
  });

  it("saves every policy with the exact body", async () => {
    const { patches } = api();
    render();
    await choose("policies-notice", "2 h");
    expect(screen.getByTestId("policies-notice")).toHaveAccessibleName("Minimum notice: 2 h");
    await choose("policies-refund", "Full refund");
    fireEvent(screen.getByTestId("policies-require-phone"), "valueChange", true);
    fireEvent(screen.getByTestId("policies-next-only"), "valueChange", true);
    fireEvent(screen.getByTestId("policies-allow-reschedule"), "valueChange", false);
    fireEvent.changeText(screen.getByTestId("policies-max-advance"), "90");
    fireEvent.changeText(screen.getByTestId("policies-hold"), "45");
    await act(async () => fireEvent.press(screen.getByTestId("settings-save")));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      policies: {
        ...business.policies,
        minNoticeMinutes: 120,
        maxAdvanceDays: 90,
        lateCancellationRefundPercent: 100,
        requireCustomerPhone: true,
        nextAvailableOnly: true,
        allowCustomerReschedule: false,
        holdMinutes: 45,
      },
    });
    expect(await screen.findByText("Policies saved")).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId("settings-save")).toBeDisabled());
    expect(screen.queryByTestId("save-bar")).toBeNull();
  });

  it("validates against the backend's limits before saving", async () => {
    const { patches } = api();
    render();
    fireEvent.changeText(await screen.findByTestId("policies-max-advance"), "1000");
    fireEvent.changeText(screen.getByTestId("policies-hold"), "");
    await act(async () => fireEvent.press(screen.getByTestId("save-bar-save")));
    expect(await screen.findByText("At most 2 years")).toBeOnTheScreen();
    expect(screen.getByText("Enter minutes")).toBeOnTheScreen();
    expect(patches).toEqual([]);
  });

  it("puts the server's policies.* errors on the matching field", async () => {
    api({
      patch: () =>
        json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "Check the highlighted fields.",
              fields: { "policies.holdMinutes": "Must be between 5 and 1440" },
            },
          },
          400,
        ),
    });
    render();
    fireEvent.changeText(await screen.findByTestId("policies-hold"), "45");
    await act(async () => fireEvent.press(screen.getByTestId("settings-save")));
    expect(await screen.findByText("Must be between 5 and 1440")).toBeOnTheScreen();
    expect(screen.queryByTestId("form-error")).toBeNull();
  });

  it("with Stripe, explains and enforces the 30-minute hold", async () => {
    const { patches } = api({ provider: "stripe" });
    render();
    expect(await screen.findByText("Stripe needs at least 30 minutes.")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId("policies-hold"), "10");
    await act(async () => fireEvent.press(screen.getByTestId("settings-save")));
    expect(screen.getAllByText("Stripe needs at least 30 minutes.")).toHaveLength(1);
    expect(patches).toEqual([]);
  });

  it("discards unsaved changes", async () => {
    api();
    render();
    fireEvent(await screen.findByTestId("policies-allow-reschedule"), "valueChange", false);
    expect(screen.getByTestId("save-bar")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByTestId("policies-allow-reschedule")).toHaveProp("value", true);
    expect(screen.queryByTestId("save-bar")).toBeNull();
  });
});

describe("policy choices", () => {
  it("label notice and refunds as the website does, keeping an unusual current value", () => {
    expect(noticeLabel(0)).toBe("No notice");
    expect(noticeLabel(90)).toBe("1 h 30 min");
    expect(noticeLabel(1440)).toBe("1 day");
    expect(noticeLabel(2880)).toBe("2 days");
    expect(noticeOptions(90).map((o) => o.value)).toContain("90");
    expect(noticeOptions(60)).toHaveLength(9);
    expect(refundOptions(10).map((o) => o.label)).toEqual([
      "No refund",
      "10%",
      "25%",
      "50%",
      "75%",
      "Full refund",
    ]);
  });
});
