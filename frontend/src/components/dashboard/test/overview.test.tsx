import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking, Overview } from "@/lib/api/types";
import { BusinessContextProvider } from "@/lib/business/business-context";
import { VocabularyProvider } from "@/lib/vocabulary";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BookingActionsProvider } from "../booking/booking-actions-provider";
import { OverviewView } from "../overview/overview";
import { ShareCard } from "../overview/share-card";
import { bookingDetail, requestBody, requests } from "./booking-builders";
import { business, booking, json, me, mockApi, renderDashboard } from "./render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

/** The drawer and sheet are loaded on demand; instrumented (coverage) runs import them slowly. */
const LOAD = { timeout: 10_000 };
// Load them once up front, so a busy machine's first transform doesn't eat into a test's wait.
beforeAll(async () => {
  await Promise.all([import("../booking/booking-drawer"), import("../booking/new-booking-sheet")]);
}, 60_000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-10-01T12:00:00Z")); // 13:00 in Dublin
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  toast.success.mockClear();
  toast.error.mockClear();
});

const morning = booking({
  id: "early",
  start: "2099-10-01T09:00:00+01:00",
  end: "2099-10-01T09:45:00+01:00",
});
const afternoon = booking({
  id: "late",
  start: "2099-10-01T15:00:00+01:00",
  end: "2099-10-01T16:00:00+01:00",
  option: { id: "o1", name: "Long" },
});

const overview: Overview = {
  today: [
    afternoon,
    morning,
    booking({ id: "gone", status: "cancelled", customer: { ...booking().customer, name: "Cass Gone" } }),
  ],
  upcomingCount7d: 12,
  revenueCents30d: 123400,
  bookings30d: 40,
  checklist: [
    { key: "services", done: true },
    { key: "resources", done: false },
    { key: "payments", done: false },
  ],
};

const pendingBooking = booking({
  id: "p1",
  status: "pending_approval",
  customer: { id: "c3", name: "Riley Quinn", email: null, phone: null, groupId: null },
});

function api({ data = overview, pending = [pendingBooking] }: { data?: Overview; pending?: Booking[] } = {}) {
  return mockApi((method, path) => {
    if (path.endsWith("/overview")) return data;
    if (path.endsWith("/approve")) return { ...pendingBooking, status: "confirmed" };
    if (path.endsWith("/decline")) return { ...pendingBooking, status: "cancelled" };
    if (path.endsWith("/bookings")) return { items: pending, nextCursor: null };
    if (path.includes("/bookings/")) return bookingDetail();
    return [];
  });
}

const renderOverview = (role: "owner" | "admin" | "staff" = "owner") =>
  renderDashboard(
    <BookingActionsProvider>
      <OverviewView />
    </BookingActionsProvider>,
    role,
  );

const card = async (title: string) =>
  within(must((await screen.findByText(title)).closest<HTMLElement>("[data-slot=card]"), `${title} card`));

describe("OverviewView", () => {
  it("greets by first name and counts today's bookings that still stand", async () => {
    api();
    renderOverview();
    expect(await screen.findByText(/^Next at /)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /, Avery$/ })).toBeInTheDocument();
    expect(screen.getByText("Today").parentElement?.parentElement).toHaveTextContent("2");
    expect(screen.queryByText("Cass Gone")).not.toBeInTheDocument();
    expect(screen.getByText("€1,234")).toBeInTheDocument();
    // Revenue counts every payment received, in person as well as online.
    expect(screen.getByText("Last 30 days, after refunds")).toBeInTheDocument();
  });

  it("lists today's bookings in order with a “now” marker, and opens one", async () => {
    api();
    const user = userEvent.setup();
    renderOverview();
    const today = await card("Today's appointments");
    // What's ahead comes first; finished ones fold into a line above it.
    await today.findByRole("button", { name: /^15:00/ });
    expect(today.queryByRole("button", { name: /09:00.*Alex Morgan/ })).not.toBeInTheDocument();
    await user.click(today.getByRole("button", { name: "1 finished earlier today" }));
    const items = await today.findAllByRole("listitem");
    expect(items.map((li) => li.querySelector("button")?.textContent)).toEqual([
      "1 finished earlier today",
      expect.stringMatching(/^09:00.*Alex Morgan/),
      expect.stringMatching(/^15:00.*Follow-up · Long · Sam Rivers/),
    ]);
    expect(must(items[2])).toHaveTextContent(/Now · 13:00/);
    await user.click(today.getByRole("button", { name: /09:00.*Alex Morgan/ }));
    expect(await screen.findByRole("dialog", { name: "Alex Morgan" }, LOAD)).toBeInTheDocument();
  });

  it("says when nothing is booked today and offers to add a booking", async () => {
    api({ data: { ...overview, today: [] }, pending: [] });
    const user = userEvent.setup();
    renderOverview();
    expect(await screen.findByText("A quiet day")).toBeInTheDocument();
    const today = await card("Today's appointments");
    expect(today.getByRole("heading", { name: "Nothing booked today" })).toBeInTheDocument();
    await user.click(today.getByRole("button", { name: "New appointment" }));
    expect(await screen.findByRole("dialog", { name: "New appointment" }, LOAD)).toBeInTheDocument();
    expect(screen.queryByText("Needs you")).not.toBeInTheDocument();
  });

  it("shows the server's message with a retry when the overview fails", async () => {
    let fail = true;
    mockApi((method, path) => {
      if (path.endsWith("/overview"))
        return fail ? json({ error: { code: "INTERNAL", message: "Overview is down" } }, 500) : overview;
      return { items: [], nextCursor: null };
    });
    const user = userEvent.setup();
    renderOverview();
    expect(await screen.findByText("Overview is down")).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
    fail = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText(/^Next at /)).toBeInTheDocument();
  });

  it("keeps the figures it has when a later refresh fails", async () => {
    let fail = false;
    const calls = mockApi((method, path) => {
      if (path.endsWith("/overview"))
        return fail ? json({ error: { code: "INTERNAL", message: "Overview is down" } }, 500) : overview;
      return { items: [], nextCursor: null };
    });
    const overviewCalls = () => requests(calls).filter((r) => r.endsWith("/overview")).length;
    renderOverview();
    expect(await screen.findByText(/^Next at /)).toBeInTheDocument();
    fail = true;
    // Coming back to the tab refetches.
    window.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(overviewCalls()).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Overview is down")).not.toBeInTheDocument();
    expect(screen.getByText("€1,234")).toBeInTheDocument();
  });

  it("shows the setup checklist to admins, with owner-only steps locked", async () => {
    api();
    renderOverview("admin");
    const progress = await screen.findByRole("progressbar", { name: "Setup progress" });
    expect(progress).toHaveAttribute("aria-valuenow", "33");
    expect(screen.getByRole("link", { name: /Add therapists/ })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/resources",
    );
    expect(screen.queryByRole("link", { name: /Connect payments/ })).not.toBeInTheDocument();
    expect(screen.getByText("Ask the owner to do this.")).toBeInTheDocument();
  });

  it("hides the checklist from staff", async () => {
    api();
    renderOverview("staff");
    await screen.findByText(/^Next at /);
    expect(screen.queryByText("Get set up")).not.toBeInTheDocument();
  });

  it("approves a booking waiting for approval, naming whose it is", async () => {
    const calls = api();
    renderOverview();
    const pending = await card("Needs you");
    await userEvent.click(pending.getByRole("button", { name: "Approve Riley Quinn" }));
    await waitFor(() => expect(requests(calls)).toContain("POST /v1/businesses/b1/bookings/p1/approve"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Appointment approved"));
  });

  it("shows the server's message when approving fails", async () => {
    mockApi((method, path) => {
      if (path.endsWith("/overview")) return overview;
      if (path.endsWith("/approve"))
        return json({ error: { code: "CONFLICT", message: "Already declined" } }, 409);
      return { items: [pendingBooking], nextCursor: null };
    });
    renderOverview();
    const pending = await card("Needs you");
    await userEvent.click(pending.getByRole("button", { name: "Approve Riley Quinn" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Already declined"));
  });

  it("declines a booking waiting for approval from a dialog", async () => {
    const calls = api();
    const user = userEvent.setup();
    renderOverview();
    const pending = await card("Needs you");
    expect(pending.getByText("1")).toBeInTheDocument();
    await user.click(pending.getByRole("button", { name: "Decline Riley Quinn" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Decline this appointment?" });
    await user.type(within(dialog).getByRole("textbox", { name: /reason/i }), "Away that day");
    await user.click(within(dialog).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(requestBody(calls, "/decline")).toEqual({ reason: "Away that day" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("says when more are waiting than it lists, and links to them all", async () => {
    mockApi((method, path) => {
      if (path.endsWith("/overview")) return overview;
      return { items: [pendingBooking], nextCursor: "next" };
    });
    renderOverview();
    const pending = await card("Needs you");
    expect(pending.getByText("1+")).toBeInTheDocument();
    expect(pending.getByRole("link", { name: /See all/ })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/bookings?status=pending_approval",
    );
  });

  it("opens a pending booking from its row", async () => {
    api();
    const user = userEvent.setup();
    renderOverview();
    const pending = await card("Needs you");
    await user.click(pending.getByRole("button", { name: /^Riley Quinn/ }));
    expect(await screen.findByRole("dialog", {}, LOAD)).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    api();
    const { container } = renderOverview();
    await screen.findByText("Needs you");
    await expectNoAxeViolations(container);
  });
});

describe("ShareCard", () => {
  function renderCard(status: "active" | "draft", role: "owner" | "staff" = "owner") {
    return render(
      <BusinessContextProvider value={{ business: { ...business, status, myRole: role }, role, me }}>
        <VocabularyProvider vocabulary={business.vocabulary}>
          <TooltipProvider>
            <ShareCard />
          </TooltipProvider>
        </VocabularyProvider>
      </BusinessContextProvider>,
    );
  }

  it("copies and opens the live booking page", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const { container } = renderCard("active");
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("localhost:3000/lumen-physio")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/lumen-physio");
    expect(toast.success).toHaveBeenCalledWith("Link copied");
    await user.click(screen.getByRole("button", { name: "Open booking page" }));
    expect(open).toHaveBeenCalledWith("/lumen-physio", "_blank", "noopener");
    expect(screen.queryByRole("link", { name: "Publish settings" })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("says a draft page is private, and links to publishing for those who can", async () => {
    const { unmount } = renderCard("draft");
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("Only your team can see it until you publish.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Publish settings" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/settings/general",
    );
    unmount();
    renderCard("draft", "staff");
    expect(screen.queryByRole("link", { name: "Publish settings" })).not.toBeInTheDocument();
  });
});
