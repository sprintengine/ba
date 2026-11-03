/**
 * My bookings' WebMCP tools, driven as a browser agent would through `document.modelContext`: list the customer's
 * bookings, and start a cancellation or a move, which the page shows in the booking's own dialog for the customer to
 * confirm. The agent never cancels or moves anything itself.
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerBooking, Me } from "@/lib/api/types";
import { must } from "@/test/must";
import { fakeModelContext, removeModelContext } from "@/test/model-context";
import { MyBookingsPage } from "../my-bookings";
import {
  availabilityFor,
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

let agent: ReturnType<typeof fakeModelContext>;

// Now is Thursday 1 October 2026, 10:00 in Dublin; the fixture booking is Thursday 8 October at 10:00.
beforeEach(() => {
  pinNow();
  nav.search = "";
  nav.replace.mockReset();
  vi.spyOn(window.history, "replaceState").mockImplementation((_state, _unused, url) =>
    nav.replace(String(url), { scroll: false }),
  );
  agent = fakeModelContext();
});
afterEach(() => {
  removeModelContext();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderPage(
  upcoming: CustomerBooking[],
  past: CustomerBooking[] = [],
  route?: (req: ApiRequest) => unknown,
) {
  const requests = stubApi((req) => {
    const custom = route?.(req);
    if (custom !== undefined) return custom;
    if (req.path === "/v1/me") return me;
    if (req.path === "/v1/me/bookings") return { upcoming, past };
    return undefined;
  });
  const view = renderWithProviders(<MyBookingsPage />);
  await waitFor(() => expect(agent.tools.size).toBe(3));
  return { requests, ...view };
}

const posts = (requests: ApiRequest[]) => requests.filter((r) => r.method === "POST");

describe("My bookings WebMCP tools", () => {
  it("lists the customer's bookings in words, upcoming or past", async () => {
    const upcoming = customerBooking({ id: "b-up", canCancel: true, canReschedule: true });
    const past = customerBooking({
      id: "b-past",
      start: "2026-09-01T09:00:00+01:00",
      end: "2026-09-01T10:00:00+01:00",
      status: "completed",
      canCancel: false,
      canReschedule: false,
      refundPreview: null,
    });
    const { unmount } = await renderPage([upcoming], [past]);
    await screen.findByRole("heading", { name: /Initial assessment/ });

    const listed = await agent.call("list_my_bookings");
    expect(listed.bookings).toEqual([
      expect.objectContaining({
        id: "b-up",
        business: "Lumen Physiotherapy",
        date: "2026-10-08",
        time: "10:00",
        timezone: "Europe/Dublin",
        canCancel: true,
        canReschedule: true,
      }),
    ]);
    const pastList = await agent.call("list_my_bookings", { which: "past" });
    expect(pastList.bookings).toEqual([
      expect.objectContaining({ id: "b-past", status: "completed", date: "2026-09-01" }),
    ]);
    expect(await agent.call("list_my_bookings", { which: "all" })).toEqual({
      error: "which must be upcoming or past.",
    });
    const cancelTool = must(agent.tools.get("cancel_booking"), "cancel tool").tool;
    expect(cancelTool.annotations).toEqual({ consequentialHint: true });
    unmount();
    expect(agent.tools.size).toBe(0);
  });

  it("opens the cancellation for the customer to confirm, and cancels only when they do", async () => {
    const user = userEvent.setup();
    const b = customerBooking({ id: "b1", status: "confirmed", canCancel: true });
    const { requests } = await renderPage([b], [], (req) =>
      req.method === "POST" && req.path.endsWith("/cancel") ? { ...b, status: "cancelled" } : undefined,
    );
    await screen.findByRole("heading", { name: /Initial assessment/ });

    const shown = await agent.call("cancel_booking", { bookingId: "b1" });
    expect(shown).toEqual({ shown: expect.stringContaining("Nothing is cancelled until they do") });
    const dialog = await screen.findByRole("alertdialog", { name: "Cancel your booking?" });
    expect(posts(requests)).toEqual([]);

    // The customer keeps it: nothing happens, and the dialog can be opened again later.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(posts(requests)).toEqual([]);

    await agent.call("cancel_booking", { bookingId: "b1" });
    const again = await screen.findByRole("alertdialog", { name: "Cancel your booking?" });
    expect(again).not.toBe(dialog);
    await user.click(within(again).getByRole("button", { name: "Cancel booking" }));
    await waitFor(() => expect(posts(requests).map((r) => r.path)).toEqual(["/v1/me/bookings/b1/cancel"]));
  });

  it("opens the move for the customer to choose a time and confirm", async () => {
    const user = userEvent.setup();
    const b = customerBooking({ id: "b1" });
    const { requests } = await renderPage([b], [], (req) =>
      req.method === "POST" && req.path.endsWith("/reschedule")
        ? { ...b, start: (req.body as { start: string }).start }
        : req.path.endsWith("/availability")
          ? availabilityFor(req.query, (d) => [slotAt(d, "15:00")])
          : undefined,
    );
    await screen.findByRole("heading", { name: /Initial assessment/ });
    await agent.call("reschedule_booking", { bookingId: "b1" });
    const dialog = await screen.findByRole("dialog", { name: "Reschedule Initial assessment" });
    expect(posts(requests)).toEqual([]);
    const times = await within(dialog).findByRole("group", { name: "Available times" });
    await user.click(within(times).getByRole("button", { name: "15:00" }));
    await user.click(within(dialog).getByRole("button", { name: /^Move to .*, 15:00$/ }));
    await waitFor(() =>
      expect(posts(requests).map((r) => r.path)).toEqual(["/v1/me/bookings/b1/reschedule"]),
    );
  });

  it("switches to the upcoming tab for the dialog", async () => {
    nav.search = "tab=past";
    // Next's router follows the URL useUrlParams sets.
    nav.replace.mockImplementation((url: string) => {
      nav.search = new URL(url, "http://localhost").search.slice(1);
    });
    const b = customerBooking({ id: "b1", canCancel: true });
    await renderPage([b]);
    await screen.findByText("No past bookings yet");
    expect(await agent.call("cancel_booking", { bookingId: "b1" })).toHaveProperty("shown");
    expect(nav.search).not.toContain("tab=past");
    expect(await screen.findByRole("alertdialog", { name: "Cancel your booking?" })).toBeInTheDocument();
    // Behind the modal dialog, so hidden from the accessibility tree.
    expect(screen.getByRole("tab", { name: /Upcoming/, hidden: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows one change at a time, and lets the next through once the customer closed it", async () => {
    const user = userEvent.setup();
    const a = customerBooking({ id: "a", canCancel: true, canReschedule: true });
    const b = customerBooking({
      id: "b",
      canCancel: true,
      canReschedule: true,
      start: "2026-10-09T10:00:00+01:00",
    });
    await renderPage([a, b]);
    await screen.findAllByRole("heading", { name: /Initial assessment/ });
    await agent.call("cancel_booking", { bookingId: "a" });
    await screen.findByRole("alertdialog");
    expect(await agent.call("reschedule_booking", { bookingId: "b" })).toEqual({
      error: expect.stringContaining("wait until they finish it"),
    });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await agent.call("cancel_booking", { bookingId: "b" })).toHaveProperty("shown");
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("refuses bookings that aren't upcoming or can't be changed online", async () => {
    const fixed = customerBooking({ id: "b1", canCancel: false, canReschedule: false });
    await renderPage([fixed]);
    await screen.findByRole("heading", { name: /Initial assessment/ });
    expect(await agent.call("cancel_booking", { bookingId: "b1" })).toEqual({
      error: "This booking can't be cancelled online any more; the customer can contact the business.",
    });
    expect(await agent.call("reschedule_booking", { bookingId: "b1" })).toEqual({
      error: "This booking can't be moved online any more; the customer can contact the business.",
    });
    expect(await agent.call("cancel_booking", { bookingId: "nope" })).toEqual({
      error: "No upcoming booking has that id. Call list_my_bookings for the ids.",
    });
    expect(await agent.call("cancel_booking", { bookingId: 7 })).toEqual({
      error: "bookingId must be a string",
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
