/** The offer editor sheet as a form: dialog keyboard behaviour, client rules, server field errors, editing, axe. */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Offer, OfferInput } from "@/lib/api/types";
import { mockApi, renderDashboard } from "@/components/dashboard/test/render";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { OffersPage } from "../offers-page";
import { apiError, offer, preview, service } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

type Call = { method: string; path: string; body: unknown };

/** The offers API: [offers] listed, POST/PUT answered by [save] (or echoed back). */
function api({ offers = [], save }: { offers?: Offer[]; save?: (body: OfferInput) => unknown } = {}) {
  const calls: Call[] = [];
  mockApi((method, path, body) => {
    calls.push({ method, path, body });
    if (path.endsWith("/offers/preview")) return preview;
    if (method === "POST" || method === "PUT") return save ? save(body as OfferInput) : offer();
    if (path.endsWith("/offers")) return offers;
    if (path.endsWith("/services"))
      return [service(), service({ id: "s2", name: "Physio assessment", isPublic: false })];
    return {};
  });
  return calls;
}

const saves = (calls: Call[]) =>
  calls.filter((c) => c.method === "POST" || c.method === "PUT").filter((c) => !c.path.endsWith("/preview"));

async function openNew() {
  const user = userEvent.setup();
  renderDashboard(<OffersPage previewDelay={0} />);
  await user.click(await screen.findByRole("button", { name: /new offer/i }));
  const sheet = await screen.findByRole("dialog", { name: "New offer" });
  return { user, sheet, form: within(sheet) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Offers page states", () => {
  it("is axe-clean while loading, empty and listing", async () => {
    api();
    const empty = renderDashboard(<OffersPage previewDelay={0} />);
    expect(screen.getByRole("status", { name: "Loading offers" })).toBeInTheDocument();
    await expectNoAxeViolations(empty.container);
    expect(await screen.findByRole("heading", { level: 2, name: "No offers yet" })).toBeInTheDocument();
    await expectNoAxeViolations(empty.container);
    empty.unmount();

    api({ offers: [offer()] });
    const listed = renderDashboard(<OffersPage previewDelay={0} />);
    expect(await screen.findByRole("button", { name: "Edit Quiet Tuesdays" })).toBeInTheDocument();
    await expectNoAxeViolations(listed.container);
  });

  it("shows the API error with a retry", async () => {
    mockApi((_m, path) =>
      path.endsWith("/offers") ? apiError(500, "INTERNAL_SERVER_ERROR", "Offers are unavailable") : [],
    );
    renderDashboard(<OffersPage previewDelay={0} />);
    expect(await screen.findByText("Offers are unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("is only for owners and admins", () => {
    api();
    renderDashboard(<OffersPage />, "staff");
    expect(screen.getByText("Offers are for admins")).toBeInTheDocument();
  });
});

describe("Offer editor sheet", () => {
  it("is an axe-clean, described dialog that keeps focus inside and closes on Escape", async () => {
    api();
    const { user, sheet, form } = await openNew();
    expect(sheet).toHaveAccessibleDescription(/Discount quiet times automatically/);
    await waitFor(() =>
      expect(form.getByRole("region", { name: "Affected times" })).toHaveTextContent(/2 of 12/),
    );
    await expectNoAxeViolations(document.body);

    // Tabbing from the last control wraps to the first, inside the sheet.
    form.getByRole("button", { name: "Create offer" }).focus();
    await user.tab();
    expect(sheet).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /new offer/i })).toHaveFocus();
  });

  it("validates the discount, hours, last-minute window, dates and limit", async () => {
    const calls = api();
    const { user, form } = await openNew();
    await user.click(form.getByRole("textbox", { name: /^name/i }));
    await user.paste("Quiet afternoons");
    expect(form.getByRole("textbox", { name: /^name/i })).toHaveAttribute("maxLength", "80");

    const percent = form.getByRole("textbox", { name: /percentage off/i });
    await user.clear(percent);
    await user.type(percent, "12.5");

    await user.click(form.getByRole("button", { name: /add hours/i }));
    const to = form.getByRole("textbox", { name: "Window 1 to" });
    await user.clear(to);
    await user.type(to, "12:00");
    await user.tab();
    await user.click(form.getByRole("button", { name: /add hours/i }));

    await user.click(form.getByRole("switch", { name: /last-minute only/i }));
    const within_ = form.getByRole("textbox", { name: /starting within/i });
    await user.clear(within_);

    await user.click(form.getByRole("button", { name: "Create offer" }));

    expect(await form.findByText("Use a whole number")).toBeInTheDocument();
    expect(percent).toHaveAttribute("aria-invalid", "true");
    expect(percent).toHaveAccessibleDescription("Use a whole number");
    expect(to).toHaveAccessibleDescription("Must end after it starts");
    expect(form.getByRole("textbox", { name: "Window 2 to" })).toHaveAccessibleDescription(
      /Enter an end time/,
    );
    expect(within_).toHaveAccessibleDescription("Enter a number of hours");
    expect(saves(calls)).toHaveLength(0);

    // Fixing the discount clears its error as you type (the form was submitted).
    await user.clear(percent);
    await user.type(percent, "15");
    await waitFor(() => expect(percent).not.toHaveAttribute("aria-invalid"));

    await user.click(form.getByRole("button", { name: "Remove window 2" }));
    await user.click(form.getByRole("button", { name: "Remove window 1" }));
    expect(form.queryByRole("textbox", { name: /^Window/ })).not.toBeInTheDocument();
  });

  it("picks days with presets and the keyboard", async () => {
    api();
    const { user, form } = await openNew();
    const days = form.getByRole("group", { name: "Days of the week" });
    const everyDay = form.getByRole("button", { name: "Every day" });
    expect(everyDay).toHaveAttribute("aria-pressed", "true");

    await user.click(form.getByRole("button", { name: "Weekends" }));
    expect(within(days).getByRole("button", { name: "Saturday" })).toHaveAttribute("aria-pressed", "true");
    expect(within(days).getByRole("button", { name: "Sunday" })).toHaveAttribute("aria-pressed", "true");
    expect(form.getByRole("button", { name: "Weekends" })).toHaveAttribute("aria-pressed", "true");

    within(days).getByRole("button", { name: "Monday" }).focus();
    await user.keyboard(" ");
    expect(within(days).getByRole("button", { name: "Monday" })).toHaveAttribute("aria-pressed", "true");
    expect(form.getByRole("button", { name: "Weekends" })).toHaveAttribute("aria-pressed", "false");

    await user.click(form.getByRole("button", { name: "Weekdays" }));
    expect(within(days).getByRole("button", { name: "Sunday" })).toHaveAttribute("aria-pressed", "false");
    await user.click(everyDay);
    expect(within(days).queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });

  it("selects all services or none, and marks private services", async () => {
    api();
    const { user, form } = await openNew();
    const group = form.getByRole("group", { name: "Applies to" });
    expect(within(group).getByText("Private — not on your booking page")).toBeInTheDocument();
    await user.click(form.getByRole("button", { name: "Clear all" }));
    expect(within(group).getByRole("checkbox", { name: /sports massage/i })).not.toBeChecked();
    await user.click(form.getByRole("button", { name: "Create offer" }));
    expect(await within(group).findByRole("alert")).toHaveTextContent("Choose at least one service");
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAccessibleDescription("Choose at least one service");

    await user.click(form.getByRole("button", { name: "Select all" }));
    expect(within(group).getByRole("checkbox", { name: /physio assessment/i })).toBeChecked();
  });

  it("puts server field errors under their fields and shows the message", async () => {
    api({
      save: () =>
        apiError(400, "INVALID_REQUEST", "Please check the highlighted fields.", {
          name: "You already have a deal with this name",
          serviceIds: "Sports massage is archived",
        }),
    });
    const { user, form } = await openNew();
    const name = form.getByRole("textbox", { name: /^name/i });
    await user.click(name);
    await user.paste("Quiet Tuesdays");
    await user.click(form.getByRole("button", { name: "Create offer" }));

    await waitFor(() => expect(name).toHaveAccessibleDescription(/You already have a deal with this name/));
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(form.getByRole("group", { name: "Applies to" })).toHaveAccessibleDescription(
      "Sports massage is archived",
    );
    expect(name).toHaveFocus();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows an error the form can't place as a message above the buttons", async () => {
    api({
      save: () => apiError(409, "CONFLICT", "Another admin just changed this deal.", { version: "Stale" }),
    });
    const { user, form } = await openNew();
    await user.click(form.getByRole("textbox", { name: /^name/i }));
    await user.paste("Quiet Tuesdays");
    await user.click(form.getByRole("button", { name: "Create offer" }));
    expect(await form.findByText("Another admin just changed this deal.")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("edits an existing deal: dates, limit, paused, and saves with PUT", async () => {
    let sent: OfferInput | null = null;
    const calls = api({
      offers: [offer({ validFrom: "2026-10-05", validUntil: "2026-10-31", maxRedemptions: 50 })],
      save: (body) => {
        sent = body;
        return offer({ name: body.name });
      },
    });
    const user = userEvent.setup();
    renderDashboard(<OffersPage previewDelay={0} />);
    await user.click(await screen.findByRole("button", { name: "Edit Quiet Tuesdays" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit Quiet Tuesdays" });
    const form = within(sheet);
    expect(form.getByRole("textbox", { name: "Window 1 from" })).toHaveValue("13:00");

    await user.click(form.getByRole("button", { name: "Clear start date" }));
    await user.click(form.getByRole("button", { name: "Clear end date" }));
    expect(form.queryByRole("button", { name: /^Clear (start|end) date$/ })).not.toBeInTheDocument();
    await user.clear(form.getByRole("textbox", { name: /limit/i }));
    await user.click(form.getByRole("switch", { name: "Active" }));
    await user.click(form.getByRole("radio", { name: /fixed amount/i }));
    await user.type(form.getByRole("textbox", { name: /amount off/i }), "7.50");
    // Switching back restores the percentage.
    await user.click(form.getByRole("radio", { name: /percentage/i }));
    expect(form.getByRole("textbox", { name: /percentage off/i })).toHaveValue("20");
    await user.click(form.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(sent).not.toBeNull());
    expect(must(saves(calls)[0], "a save").method).toBe("PUT");
    expect(sent).toMatchObject({ validFrom: null, validUntil: null, maxRedemptions: null, active: false });
    expect(toast.success).toHaveBeenCalledWith("Quiet Tuesdays saved");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("asks for a fixed amount when that type is chosen", async () => {
    api();
    const { user, form } = await openNew();
    await user.click(form.getByRole("textbox", { name: /^name/i }));
    await user.paste("Fiver off");
    await user.click(form.getByRole("radio", { name: /fixed amount/i }));
    await user.click(form.getByRole("button", { name: "Create offer" }));
    expect(await form.findByText("Enter an amount")).toBeInTheDocument();
    expect(form.getByRole("textbox", { name: /amount off/i })).toHaveAttribute("aria-invalid", "true");
  });

  it("shows the preview error with a retry", async () => {
    let fail = true;
    mockApi((method, path) => {
      if (path.endsWith("/offers/preview"))
        return fail ? apiError(500, "INTERNAL_SERVER_ERROR", "Preview is down") : preview;
      if (path.endsWith("/offers")) return [];
      if (path.endsWith("/services")) return [service()];
      return {};
    });
    const { user, form } = await openNew();
    const alert = await form.findByRole("alert");
    expect(alert).toHaveTextContent("Preview is down");
    fail = false;
    await user.click(within(alert).getByRole("button", { name: /try again/i }));
    await waitFor(() =>
      expect(form.getByRole("region", { name: "Affected times" })).toHaveTextContent(/2 of 12/),
    );
  });
});
