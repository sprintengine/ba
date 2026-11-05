import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { BookingActionsBar } from "../booking/booking-actions-bar";
import { requestBody, requests } from "./booking-builders";
import { booking, json, mockApi, renderDashboard } from "./render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-09-20T09:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  toast.success.mockClear();
  toast.error.mockClear();
});

/** Started an hour before "now" (2099-09-20 10:00 in Dublin). */
const started = { start: "2099-09-20T08:00:00Z", end: "2099-09-20T08:45:00Z" };

const lastButton = (name: RegExp) => must(screen.getAllByRole("button", { name }).at(-1), `${name} button`);

describe("BookingActionsBar", () => {
  it("offers approve/decline for pending bookings and approves", async () => {
    const onDone = vi.fn();
    const api = mockApi((method, path) =>
      path.endsWith("/approve") ? booking({ status: "confirmed" }) : {},
    );
    renderDashboard(<BookingActionsBar booking={booking({ status: "pending_approval" })} onDone={onDone} />);
    expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(requests(api)).toContain("POST /v1/businesses/b1/bookings/bk1/approve"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Appointment approved"));
    expect(onDone).toHaveBeenCalled();
  });

  it("shows the server's message when approving fails", async () => {
    mockApi(() => json({ error: { code: "CONFLICT", message: "Someone else approved it" } }, 409));
    renderDashboard(<BookingActionsBar booking={booking({ status: "pending_approval" })} />);
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Someone else approved it"));
  });

  it("declines with a reason from the confirm dialog", async () => {
    const onDone = vi.fn();
    const api = mockApi((method, path) =>
      path.endsWith("/decline") ? booking({ status: "cancelled" }) : {},
    );
    renderDashboard(<BookingActionsBar booking={booking({ status: "pending_approval" })} onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: /^decline$/i }));
    const dialog = await screen.findByRole("alertdialog", { name: /decline this appointment/i });
    expect(dialog).toHaveTextContent(/€45 they paid online is refunded in full/);
    await expectNoAxeViolations(document.body);
    await userEvent.type(screen.getByRole("textbox", { name: /reason/i }), "Fully booked that week");
    await userEvent.click(lastButton(/^decline$/i));
    await waitFor(() => expect(requests(api)).toContain("POST /v1/businesses/b1/bookings/bk1/decline"));
    expect(requestBody(api, "/decline")).toEqual({ reason: "Fully booked that week" });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Appointment declined");
  });

  it("keeps the decline dialog open with the server's message when declining fails", async () => {
    mockApi(() => json({ error: { code: "CONFLICT", message: "Already cancelled" } }, 409));
    renderDashboard(
      <BookingActionsBar booking={booking({ status: "pending_approval", amountPaidCents: 0 })} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /^decline$/i }));
    const dialog = await screen.findByRole("alertdialog", { name: /decline this appointment/i });
    expect(dialog).not.toHaveTextContent(/refunded/);
    await userEvent.click(lastButton(/^decline$/i));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Already cancelled"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep request" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("offers reschedule and cancel (not completed) before a confirmed booking starts", () => {
    mockApi(() => ({}));
    renderDashboard(<BookingActionsBar booking={booking()} />);
    expect(screen.getByRole("button", { name: /reschedule/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel appointment/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /completed/i })).not.toBeInTheDocument();
  });

  it("marks a started booking completed", async () => {
    const api = mockApi((method, path, body) =>
      path.endsWith("/status") ? booking({ status: (body as { status: "completed" }).status }) : {},
    );
    renderDashboard(<BookingActionsBar booking={booking(started)} />);
    await userEvent.click(screen.getByRole("button", { name: /completed/i }));
    await waitFor(() => expect(requests(api)).toContain("POST /v1/businesses/b1/bookings/bk1/status"));
    expect(requestBody(api, "/status")).toEqual({ status: "completed" });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Marked as completed"));
  });

  it("marks a started booking as a no-show, and reports a failure", async () => {
    const api = mockApi(() => json({ error: { code: "INVALID_REQUEST", message: "Too early" } }, 400));
    renderDashboard(<BookingActionsBar booking={booking(started)} />);
    await userEvent.click(screen.getByRole("button", { name: /no-show/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Too early"));
    expect(requestBody(api, "/status")).toEqual({ status: "no_show" });
  });

  it("sends one outcome while the first is in flight, however fast the clicks", async () => {
    let release: (r: Response) => void = () => {};
    const api = mockApi(() => ({}));
    api.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const user = userEvent.setup();
    renderDashboard(<BookingActionsBar booking={booking(started)} />);
    await user.click(screen.getByRole("button", { name: /completed/i }));
    await user.click(screen.getByRole("button", { name: /no-show/i }));
    await user.click(screen.getByRole("button", { name: /completed/i }));
    expect(screen.getByRole("button", { name: /no-show/i })).toBeDisabled();
    expect(requests(api).filter((r) => r.endsWith("/status"))).toHaveLength(1);
    expect(requestBody(api, "/status")).toEqual({ status: "completed" });
    release(json(booking({ ...started, status: "completed" })));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Marked as completed"));
    expect(screen.getByRole("button", { name: /no-show/i })).toBeEnabled();
  });

  it("corrects a recorded outcome to the other one", async () => {
    const api = mockApi((method, path, body) => (path.endsWith("/status") ? booking(body as object) : {}));
    const { unmount } = renderDashboard(
      <BookingActionsBar booking={booking({ ...started, status: "completed" })} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Change to no-show" }));
    await waitFor(() => expect(requestBody(api, "/status")).toEqual({ status: "no_show" }));
    unmount();

    renderDashboard(<BookingActionsBar booking={booking({ ...started, status: "no_show" })} />);
    await userEvent.click(screen.getByRole("button", { name: "Change to completed" }));
    await waitFor(() => expect(requestBody(api, "/status")).toEqual({ status: "completed" }));
  });

  it("tucks reschedule and cancel into a keyboard-operable menu beside the primary actions", async () => {
    mockApi(() => ({}));
    const user = userEvent.setup();
    renderDashboard(<BookingActionsBar booking={booking(started)} />);
    const more = screen.getByRole("button", { name: "More actions" });
    more.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent.trim()),
    ).toEqual(["Reschedule", "Cancel appointment"]);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(await screen.findByRole("dialog", { name: /cancel this appointment/i })).toBeInTheDocument();
  });

  it("opens reschedule from the overflow menu", async () => {
    mockApi((method, path) => (path.endsWith("/availability") ? { days: [] } : {}));
    const user = userEvent.setup();
    renderDashboard(<BookingActionsBar booking={booking(started)} />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Reschedule" }));
    expect(await screen.findByRole("dialog", { name: "Reschedule" })).toBeInTheDocument();
  });

  it("cancels with the chosen refund and notification settings", async () => {
    const api = mockApi((method, path) => (path.endsWith("/cancel") ? booking({ status: "cancelled" }) : {}));
    renderDashboard(<BookingActionsBar booking={booking()} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel appointment/i }));
    const dialog = await screen.findByRole("dialog", { name: /cancel this appointment/i });
    expect(dialog).toHaveTextContent("€45");
    await expectNoAxeViolations(document.body);
    await userEvent.click(screen.getByRole("radio", { name: /full refund/i }));
    expect(dialog).toHaveTextContent(/€45 will be refunded in full/);
    await userEvent.click(screen.getByRole("radio", { name: /no refund/i }));
    expect(dialog).toHaveTextContent(/No refund. The €45 already paid online is kept/);
    const notify = screen.getByRole("switch", { name: /email the patient/i });
    expect(within(dialog).getByText(/Included in the email/)).toBeInTheDocument();
    await userEvent.click(notify);
    expect(within(dialog).getByText("Kept in the history.")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: /reason/i }), "Closed for training");
    await userEvent.click(lastButton(/^cancel appointment$/i));
    await waitFor(() => expect(requests(api)).toContain("POST /v1/businesses/b1/bookings/bk1/cancel"));
    expect(requestBody(api, "/cancel")).toEqual({
      reason: "Closed for training",
      refund: "none",
      notifyCustomer: false,
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Appointment cancelled", undefined));
  });

  it("refunds per the policy by default and says how much", async () => {
    const api = mockApi((method, path) => (path.endsWith("/cancel") ? booking({ status: "cancelled" }) : {}));
    renderDashboard(<BookingActionsBar booking={booking()} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel appointment/i }));
    await screen.findByRole("dialog", { name: /cancel this appointment/i });
    await userEvent.click(lastButton(/^cancel appointment$/i));
    await waitFor(() =>
      expect(requestBody(api, "/cancel")).toEqual({ reason: null, refund: "policy", notifyCustomer: true }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Appointment cancelled", {
        description: "€45 refund on its way.",
      }),
    );
  });

  it("asks for no refund choice when nothing was paid, and reports a failed cancel", async () => {
    const api = mockApi(() => json({ error: { code: "CONFLICT", message: "Already started" } }, 409));
    renderDashboard(
      <BookingActionsBar booking={booking({ amountPaidCents: 0, paymentStatus: "pay_at_venue" })} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel appointment/i }));
    const dialog = await screen.findByRole("dialog", { name: /cancel this appointment/i });
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent("Nothing has been paid online");
    await userEvent.click(lastButton(/^cancel appointment$/i));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Already started"));
    expect(requestBody(api, "/cancel")).toMatchObject({ refund: "none" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("offers no online refund for money taken in person, and says to return it at the venue", async () => {
    const api = mockApi((method, path) => (path.endsWith("/cancel") ? booking({ status: "cancelled" }) : {}));
    renderDashboard(
      <BookingActionsBar
        booking={booking({ amountPaidCents: 4500, amountPaidInPersonCents: 4500, paymentStatus: "paid" })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel appointment/i }));
    const dialog = await screen.findByRole("dialog", { name: /cancel this appointment/i });
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      "Nothing has been paid online, so there's nothing to refund. €45 paid in person isn't refunded online — return it at the venue.",
    );
    await userEvent.click(lastButton(/^cancel appointment$/i));
    await waitFor(() => expect(requestBody(api, "/cancel")).toMatchObject({ refund: "none" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Appointment cancelled", undefined));
  });

  it("traps focus in the cancel dialog and closes it on Escape or “Keep”", async () => {
    mockApi(() => ({}));
    const user = userEvent.setup();
    renderDashboard(<BookingActionsBar booking={booking()} />);
    await user.click(screen.getByRole("button", { name: /cancel appointment/i }));
    const dialog = await screen.findByRole("dialog", { name: /cancel this appointment/i });
    for (let i = 0; i < 12; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /cancel appointment/i }));
    await user.click(await screen.findByRole("button", { name: "Keep appointment" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("says a cancelled booking is closed", () => {
    mockApi(() => ({}));
    renderDashboard(<BookingActionsBar booking={booking({ status: "cancelled" })} />);
    expect(screen.getByText(/this appointment is closed/i)).toBeInTheDocument();
  });

  it("says there is nothing to do yet for an outcome recorded before the start", () => {
    mockApi(() => ({}));
    renderDashboard(<BookingActionsBar booking={booking({ status: "completed" })} />);
    expect(screen.getByText("No actions available yet.")).toBeInTheDocument();
  });
});
