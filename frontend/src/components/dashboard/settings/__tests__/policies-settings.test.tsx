import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Business, PaymentsStatus, UpdateBusiness } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { business, mockApi, renderDashboard } from "../../test/render";
import { PoliciesSettings } from "../policies-settings";
import { invalidRequest } from "./settings-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio/settings/policies",
  useSearchParams: () => new URLSearchParams(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => toast.success.mockClear());
afterEach(() => vi.unstubAllGlobals());

const payments = (provider: PaymentsStatus["provider"]): PaymentsStatus => ({
  provider,
  connected: provider === "stripe",
  chargesEnabled: provider === "stripe",
  detailsSubmitted: provider === "stripe",
});

function api({
  provider = "dev",
  patch,
}: { provider?: PaymentsStatus["provider"]; patch?: (b: UpdateBusiness) => unknown } = {}) {
  const patches: UpdateBusiness[] = [];
  mockApi((method, path, body) => {
    if (path.endsWith("/payments/status")) return payments(provider);
    if (path === "/v1/businesses/b1" && method === "PATCH") {
      const input = body as UpdateBusiness;
      patches.push(input);
      if (patch) return patch(input);
      return { ...business, policies: { ...business.policies, ...input.policies } } satisfies Business;
    }
    return {};
  });
  return patches;
}

const summary = () => screen.getByText(/refund if they cancel|can't cancel online|cancel any time/);

describe("PoliciesSettings", () => {
  it("shows the current policies and a plain-language summary, axe-clean", async () => {
    api();
    const { container } = renderDashboard(<PoliciesSettings />);
    expect(screen.getByRole("heading", { name: "Appointment policies" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Minimum notice" })).toHaveTextContent("1 h");
    expect(screen.getByRole("textbox", { name: "How far ahead" })).toHaveValue("60");
    expect(screen.getByRole("switch", { name: "Ask for a phone number" })).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "Refund for late cancellations" })).toHaveTextContent(
      "No refund",
    );
    expect(summary()).toHaveTextContent(
      "Patients get a full refund if they cancel at least 24 hours before. Later than that, they get no refund.",
    );
    await expectNoAxeViolations(container);
  });

  it("updates the summary as the policy changes", async () => {
    api();
    const user = userEvent.setup();
    renderDashboard(<PoliciesSettings />);
    await user.click(screen.getByRole("switch", { name: "Let people cancel online" }));
    expect(summary()).toHaveTextContent("Patients can't cancel online — they need to contact you.");
    await user.click(screen.getByRole("switch", { name: "Let people cancel online" }));
    const hours = screen.getByRole("textbox", { name: "Free cancellation up to" });
    await user.clear(hours);
    await user.type(hours, "0");
    expect(summary()).toHaveTextContent("Patients can cancel any time before the start for a full refund.");
  });

  it("saves the policies chosen with the keyboard", async () => {
    const patches = api();
    const user = userEvent.setup();
    renderDashboard(<PoliciesSettings />);
    const notice = screen.getByRole("combobox", { name: "Minimum notice" });
    notice.focus();
    await user.keyboard("{Enter}");
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "2 h" }));
    expect(notice).toHaveTextContent("2 h");

    const refund = screen.getByRole("combobox", { name: "Refund for late cancellations" });
    await user.click(refund);
    await user.click(within(await screen.findByRole("listbox")).getByRole("option", { name: "50%" }));
    await user.click(screen.getByRole("switch", { name: "Ask for a phone number" }));
    const nextOnly = screen.getByRole("switch", { name: "Offer the next available time only" });
    expect(nextOnly).toHaveAccessibleDescription(/patients are offered the earliest one/);
    await user.click(nextOnly);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      policies: {
        ...business.policies,
        minNoticeMinutes: 120,
        lateCancellationRefundPercent: 50,
        requireCustomerPhone: true,
        nextAvailableOnly: true,
      },
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Policies saved"));
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("validates on the client against the backend's limits", async () => {
    const patches = api();
    const user = userEvent.setup();
    renderDashboard(<PoliciesSettings />);
    const ahead = screen.getByRole("textbox", { name: "How far ahead" });
    await user.clear(ahead);
    await user.type(ahead, "1000");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(ahead).toHaveAccessibleDescription(/At most 2 years/);
    expect(ahead).toHaveAttribute("aria-invalid", "true");
    expect(ahead).toHaveFocus();
    expect(patches).toEqual([]);
  });

  it("puts the server's policies.* field errors under the matching field", async () => {
    api({ patch: () => invalidRequest({ "policies.holdMinutes": "Must be between 5 and 1440" }) });
    const user = userEvent.setup();
    renderDashboard(<PoliciesSettings />);
    const hold = screen.getByRole("textbox", { name: "Hold the slot for" });
    await user.clear(hold);
    await user.type(hold, "45");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByRole("textbox", { name: "Hold the slot for", description: /between 5 and 1440/ }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(hold).toHaveFocus();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("with Stripe, explains and enforces the 30-minute hold", async () => {
    api({ provider: "stripe" });
    const user = userEvent.setup();
    renderDashboard(<PoliciesSettings />);
    const hold = screen.getByRole("textbox", { name: "Hold the slot for" });
    expect(await screen.findByText("Stripe needs at least 30 minutes.")).toBeInTheDocument();
    await user.clear(hold);
    await user.type(hold, "10");
    await user.tab();
    expect(hold).toHaveValue("30");
  });

  it("discards unsaved changes", async () => {
    api();
    const user = userEvent.setup();
    renderDashboard(<PoliciesSettings />);
    await user.click(screen.getByRole("switch", { name: "Let people reschedule online" }));
    expect(screen.getByRole("switch", { name: "Let people reschedule online" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("switch", { name: "Let people reschedule online" })).toBeChecked();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
  });
});
