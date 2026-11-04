import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerBooking, Me } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { Toaster } from "@/components/ui/toast";
import { MyBookingsPage } from "../my-bookings";
import {
  apiError,
  availabilityFor,
  calls,
  customerBooking,
  pinNow,
  renderWithProviders,
  slotAt,
  stubApi,
  type ApiRequest,
} from "./booking-test-utils";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => "/my/bookings",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const me: Me = {
  user: { id: "u1", email: "rowan@example.test", name: "Rowan Example", emailVerified: true },
  memberships: [],
  pendingInvitations: [],
  hasCustomerBookings: true,
};

// Now is Thursday 1 October 2026, 10:00 in Dublin; the fixture booking is Thursday 8 October at 10:00.
beforeEach(() => {
  pinNow();
  nav.search = "";
  nav.push.mockReset();
  nav.replace.mockReset();
  // useUrlParams changes the URL with history.replaceState (Next's router follows it): record it as a replace.
  vi.spyOn(window.history, "replaceState").mockImplementation((_state, _unused, url) =>
    nav.replace(String(url), { scroll: false }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPage({
  upcoming = [],
  past = [],
  profile = me,
  route,
}: {
  upcoming?: CustomerBooking[];
  past?: CustomerBooking[];
  profile?: Me;
  route?: (req: ApiRequest) => unknown;
} = {}) {
  const requests = stubApi((req) => {
    const custom = route?.(req);
    if (custom !== undefined) return custom;
    if (req.path === "/v1/me") return profile;
    if (req.path === "/v1/me/bookings") return { upcoming, past };
    return undefined;
  });
  const view = renderWithProviders(
    <>
      <MyBookingsPage />
      <Toaster />
    </>,
  );
  return { requests, ...view };
}

const card = (service: string) =>
  must(screen.getByRole("heading", { name: new RegExp(service) }).closest("article"), `${service} card`);

describe("My bookings states", () => {
  it("shows a loading state, then the bookings", async () => {
    const { container } = renderPage({ upcoming: [customerBooking()] });
    expect(screen.getByRole("status", { name: "Loading bookings" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
    expect(await screen.findByRole("heading", { name: "Initial assessment" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading bookings" })).not.toBeInTheDocument();
  });

  it("shows the API's error with a retry", async () => {
    const user = userEvent.setup();
    let fail = true;
    const { requests, container } = renderPage({
      upcoming: [customerBooking()],
      route: (req) =>
        req.path === "/v1/me/bookings" && fail
          ? apiError(500, "INTERNAL", "Bookings are unavailable.")
          : undefined,
    });
    expect(await screen.findByText("Bookings are unavailable.")).toBeInTheDocument();
    await expectNoAxeViolations(container);
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Initial assessment" })).toBeInTheDocument();
    expect(calls(requests).filter((c) => c === "GET /v1/me/bookings")).toHaveLength(2);
  });

  it("offers to book again with businesses from past bookings when nothing is coming up", async () => {
    const lumen = customerBooking({ id: "p1", start: "2026-09-01T09:00:00Z", end: "2026-09-01T10:00:00Z" });
    renderPage({ past: [lumen, { ...lumen, id: "p2" }] });
    expect(await screen.findByText("Nothing coming up")).toBeInTheDocument();
    expect(screen.getByText("Book again with")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /Lumen Physiotherapy/ });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/lumen-physio");
  });

  it("points newcomers to discover businesses", async () => {
    const { container } = renderPage();
    expect(await screen.findByText("Nothing coming up")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find somewhere to book" })).toHaveAttribute("href", "/explore");
    await expectNoAxeViolations(container);
  });

  it("lists past bookings, most recent first, with only 'Book again'", async () => {
    nav.search = "tab=past";
    const older = customerBooking({
      id: "p1",
      service: { id: "s1", name: "Initial assessment" },
      start: "2026-08-01T09:00:00Z",
      end: "2026-08-01T10:00:00Z",
    });
    const newer = customerBooking({
      id: "p2",
      service: { id: "s2", name: "Sports massage" },
      start: "2026-09-01T09:00:00Z",
      end: "2026-09-01T10:00:00Z",
    });
    const { container } = renderPage({ past: [older, newer] });
    await screen.findAllByRole("article");
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(["Sports massage", "Initial assessment"]);
    expect(screen.getByRole("tab", { name: /Past/ })).toHaveAttribute("aria-selected", "true");
    expect(within(card("Sports massage")).getByRole("link", { name: "Book again" })).toHaveAttribute(
      "href",
      "/lumen-physio",
    );
    expect(
      within(card("Sports massage")).queryByRole("button", { name: /Cancel|Reschedule/ }),
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("says when there are no past bookings", async () => {
    nav.search = "tab=past";
    renderPage({ upcoming: [customerBooking()] });
    expect(await screen.findByText("No past bookings yet")).toBeInTheDocument();
  });

  it("switches tabs with the keyboard, keeping the choice in the URL", async () => {
    const user = userEvent.setup();
    renderPage({ upcoming: [customerBooking()] });
    const upcoming = await screen.findByRole("tab", { name: /Upcoming/ });
    await waitFor(() => expect(upcoming).toHaveTextContent(/^Upcoming\s*1$/));
    upcoming.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/my/bookings?tab=past", { scroll: false }));
  });
});

describe("a booking card", () => {
  it("says when, with whom and where, with the payment status", async () => {
    const b = customerBooking({ option: { id: "o1", name: "60 minutes" } });
    const { container } = renderPage({ upcoming: [b] });
    const c = within(await screen.findByRole("article"));
    expect(c.getByRole("heading", { level: 2 })).toHaveTextContent("Initial assessment · 60 minutes");
    expect(c.getByText(/10:00.*11:00/)).toHaveTextContent("(1 h)");
    expect(c.getByText("Alex Morgan")).toBeInTheDocument();
    expect(c.getByText("Unit 4, Lantern Quay, Dublin")).toBeInTheDocument();
    expect(c.getByText("Confirmed")).toBeInTheDocument();
    expect(c.getByText("Paid")).toBeInTheDocument();
    expect(c.getByRole("link", { name: /Lumen Physiotherapy/ })).toHaveAttribute("href", "/lumen-physio");
    await expectNoAxeViolations(container);
  });

  it("says a paid deposit is a deposit, with the rest due at the appointment", async () => {
    renderPage({ upcoming: [customerBooking({ depositCents: 2000, amountPaidCents: 2000 })] });
    const c = within(await screen.findByRole("article"));
    expect(c.getByText("Deposit paid")).toBeInTheDocument();
    expect(c.queryByText("Paid")).not.toBeInTheDocument();
    expect(c.getByText(/€50 due at your appointment/)).toBeInTheDocument();
  });

  it("doesn't ask for the rest of a deposit once the booking is in the past", async () => {
    nav.search = "tab=past";
    renderPage({
      past: [customerBooking({ status: "completed", depositCents: 2000, amountPaidCents: 2000 })],
    });
    const c = within(await screen.findByRole("article"));
    expect(c.getByText("Deposit paid")).toBeInTheDocument();
    expect(c.queryByText(/due at your appointment/)).not.toBeInTheDocument();
  });

  it("offers only what the business allows", async () => {
    renderPage({
      upcoming: [customerBooking({ status: "pending_approval", canCancel: false, canReschedule: false })],
    });
    await screen.findByRole("article");
    expect(screen.getByText("Needs approval")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to calendar/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel|Reschedule/ })).not.toBeInTheDocument();
  });
});

describe("paying for a held booking", () => {
  const held = (patch: Partial<CustomerBooking> = {}) =>
    customerBooking({
      status: "held",
      paymentStatus: "pending",
      amountPaidCents: 0,
      holdExpiresAt: "2026-10-01T09:10:00Z",
      ...patch,
    });

  it("counts down the hold and pays what is due", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const b = held({ depositCents: 1500 });
    const { requests } = renderPage({
      upcoming: [b],
      route: (req) =>
        req.method === "POST" && req.path.endsWith("/pay")
          ? { checkoutUrl: "https://pay.example/cs_1" }
          : undefined,
    });
    expect(await screen.findByText(/^Held for/)).toHaveTextContent("Held for 10:00. Pay now to confirm it.");
    // A held booking isn't in calendars yet.
    expect(screen.queryByRole("button", { name: /Add to calendar/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pay now · €15" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://pay.example/cs_1"));
    expect(calls(requests)).toContain(`POST /v1/me/bookings/${b.id}/pay`);
  });

  it("asks for the full price when there is no deposit, and shows a failure", async () => {
    const user = userEvent.setup();
    renderPage({
      upcoming: [held()],
      route: (req) =>
        req.path.endsWith("/pay")
          ? apiError(409, "PAYMENTS_NOT_CONFIGURED", "Payments are off for now.")
          : undefined,
    });
    await user.click(await screen.findByRole("button", { name: "Pay now · €70" }));
    expect(await screen.findByText("Payments are off for now.")).toBeInTheDocument();
  });

  it("stops offering payment once the hold has lapsed", async () => {
    renderPage({
      upcoming: [held({ holdExpiresAt: "2026-10-01T08:59:00Z", canCancel: false, canReschedule: false })],
    });
    await screen.findByRole("article");
    expect(screen.queryByRole("button", { name: /Pay now/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/held for/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("cancelling", () => {
  it("cancels from the card after confirming, with the reason", async () => {
    const user = userEvent.setup();
    const b = customerBooking({ status: "confirmed", canCancel: true });
    const { requests } = renderPage({
      upcoming: [b],
      route: (req) =>
        req.method === "POST" && req.path.endsWith("/cancel") ? { ...b, status: "cancelled" } : undefined,
    });
    await user.click(await screen.findByRole("button", { name: /^cancel$/i }));
    const dialog = await screen.findByRole("alertdialog", { name: "Cancel your booking?" });
    expect(dialog).toHaveTextContent("You'll get a full refund of €70.");
    await expectNoAxeViolations(document.body);
    await user.type(within(dialog).getByRole("textbox", { name: /Reason/ }), "Away that week");
    await user.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    const cancel = must(
      requests.find((r) => r.path.endsWith("/cancel")),
      "cancel request",
    );
    expect(cancel.body).toEqual({ reason: "Away that week" });
    expect(
      await screen.findByText("Initial assessment with Lumen Physiotherapy was cancelled"),
    ).toBeInTheDocument();
  });

  it("shows why cancelling failed and keeps the dialog open; Escape keeps the booking", async () => {
    const user = userEvent.setup();
    renderPage({
      upcoming: [customerBooking()],
      route: (req) =>
        req.path.endsWith("/cancel")
          ? apiError(422, "POLICY_VIOLATION", "It's too late to cancel online.")
          : undefined,
    });
    await user.click(await screen.findByRole("button", { name: /^cancel$/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("It's too late to cancel online.");

    // Focus stays inside the dialog.
    for (let i = 0; i < 4; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    // Opening it again starts without the old error.
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(within(await screen.findByRole("alertdialog")).queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("rescheduling", () => {
  const availability = (req: ApiRequest) =>
    req.path.endsWith("/availability") ? availabilityFor(req.query, (d) => [slotAt(d, "15:00")]) : undefined;

  it("moves the booking to a time from its own availability", async () => {
    const user = userEvent.setup();
    const b = customerBooking();
    const { requests } = renderPage({
      upcoming: [b],
      route: (req) =>
        req.method === "POST" && req.path.endsWith("/reschedule")
          ? { ...b, start: (req.body as { start: string }).start }
          : availability(req),
    });
    await user.click(await screen.findByRole("button", { name: /Reschedule/ }));
    const dialog = await screen.findByRole("dialog", { name: "Reschedule Initial assessment" });
    expect(dialog).toHaveTextContent(/With Lumen Physiotherapy · currently Thu,? 8 Oct at 10:00/);
    expect(within(dialog).getByRole("button", { name: "Choose a new time" })).toBeDisabled();

    const times = await within(dialog).findByRole("group", { name: "Available times" });
    await user.click(within(times).getByRole("button", { name: "15:00" }));
    await expectNoAxeViolations(document.body);
    await user.click(within(dialog).getByRole("button", { name: /^Move to .*, 15:00$/ }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText(/^Moved to .*, 15:00$/)).toBeInTheDocument();
    const move = must(
      requests.find((r) => r.path.endsWith("/reschedule")),
      "reschedule request",
    );
    expect(move.body).toEqual({ start: "2026-10-01T15:00:00+01:00" });
    expect(calls(requests).some((c) => c.includes("/v1/public/"))).toBe(false);
  });

  it("refreshes the times when the new time was just taken", async () => {
    const user = userEvent.setup();
    const { requests } = renderPage({
      upcoming: [customerBooking()],
      route: (req) =>
        req.path.endsWith("/reschedule") ? apiError(409, "SLOT_UNAVAILABLE", "Taken.") : availability(req),
    });
    await user.click(await screen.findByRole("button", { name: /Reschedule/ }));
    const dialog = await screen.findByRole("dialog");
    const times = await within(dialog).findByRole("group", { name: "Available times" });
    await user.click(within(times).getByRole("button", { name: "15:00" }));
    const before = requests.filter((r) => r.path.endsWith("/availability")).length;
    await user.click(within(dialog).getByRole("button", { name: /^Move to/ }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "That time was just taken. We've refreshed the available times.",
    );
    await waitFor(() =>
      expect(requests.filter((r) => r.path.endsWith("/availability")).length).toBeGreaterThan(before),
    );
    expect(within(dialog).getByRole("button", { name: "Choose a new time" })).toBeDisabled();
  });

  it("shows other failures and closes with 'Keep current time' or Escape", async () => {
    const user = userEvent.setup();
    renderPage({
      upcoming: [customerBooking()],
      route: (req) =>
        req.path.endsWith("/reschedule")
          ? apiError(422, "POLICY_VIOLATION", "Too close to the appointment.")
          : availability(req),
    });
    await user.click(await screen.findByRole("button", { name: /Reschedule/ }));
    let dialog = await screen.findByRole("dialog");
    await user.click(
      within(must(await within(dialog).findByRole("group", { name: "Available times" }))).getByRole(
        "button",
        { name: "15:00" },
      ),
    );
    await user.click(within(dialog).getByRole("button", { name: /^Move to/ }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Too close to the appointment.");
    await user.click(within(dialog).getByRole("button", { name: "Keep current time" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Reschedule/ }));
    dialog = await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("add to calendar", () => {
  it("opens with the keyboard and offers Google Calendar and an .ics download", async () => {
    const user = userEvent.setup();
    const created: Blob[] = [];
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        created.push(blob);
        return "blob:ics";
      },
      revokeObjectURL: () => {},
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderPage({ upcoming: [customerBooking()] });
    const trigger = await screen.findByRole("button", { name: /Add to calendar/ });
    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    const google = within(menu).getByRole("menuitem", { name: "Google Calendar" });
    expect(google).toHaveAttribute("target", "_blank");
    expect(new URL(must(google.getAttribute("href"))).searchParams.get("text")).toBe(
      "Initial assessment · Lumen Physiotherapy",
    );
    await expectNoAxeViolations(document.body);
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    await waitFor(() => expect(created).toHaveLength(1));
    expect(await must(created[0]).text()).toContain("SUMMARY:Initial assessment · Lumen Physiotherapy");
  });
});

describe("team invitations", () => {
  const invited: Me = {
    ...me,
    pendingInvitations: [{ token: "inv1", businessName: "Harbour Lane Studio", role: "admin" }],
  };

  // Invitations for the user's email are accepted when /v1/me loads; one still pending is waiting for a seat.
  it("explains that the team is full instead of offering an accept that can only fail", async () => {
    renderPage({ profile: invited });
    expect(await screen.findByText("You're invited to join Harbour Lane Studio")).toBeInTheDocument();
    expect(screen.getByText(/As an admin, but their team is full/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept/i })).not.toBeInTheDocument();
  });

  it("names a staff invitation's role", async () => {
    renderPage({
      profile: {
        ...invited,
        pendingInvitations: [{ ...must(invited.pendingInvitations[0]), role: "staff" }],
      },
    });
    expect(await screen.findByText(/As a staff/)).toBeInTheDocument();
  });
});
