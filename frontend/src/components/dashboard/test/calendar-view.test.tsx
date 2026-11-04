import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking, ResourceAvailability } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { CalendarView } from "../calendar/calendar-view";
import { resource } from "./booking-builders";
import { booking, json, mockApi, renderDashboard } from "./render";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/dashboard/lumen-physio/calendar",
  useSearchParams: () => new URLSearchParams(search),
}));

/** The calendar opens bookings and the new-booking sheet through the shared provider; record what it asks for. */
const actions = vi.hoisted(() => ({ openBooking: vi.fn(), openNewBooking: vi.fn() }));
vi.mock("../booking/booking-actions-provider", () => ({ useBookingActions: () => actions }));

beforeEach(() => {
  replace.mockClear();
  // useUrlParams changes the URL with history.replaceState (Next's router follows it): record it as a replace.
  vi.spyOn(window.history, "replaceState").mockImplementation((_state, _unused, url) =>
    replace(String(url), { scroll: false }),
  );
  actions.openBooking.mockClear();
  actions.openNewBooking.mockClear();
  search = "date=2099-10-01";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-10-01T11:30:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const PATH = "/dashboard/lumen-physio/calendar";
const lastUrl = () => must(replace.mock.lastCall, "a URL change")[0] as string;

/** Weekdays 09:00–17:00 for every resource. */
const weekdays: ResourceAvailability = {
  rules: ([1, 2, 3, 4, 5] as const).map((dayOfWeek) => ({
    id: `rule-${dayOfWeek}`,
    resourceId: "r1",
    dayOfWeek,
    startTime: "09:00",
    endTime: "17:00",
    validFrom: null,
    validUntil: null,
    audienceGroupIds: [],
  })),
  overrides: [],
};

function api(bookings: Booking[] = [booking()]) {
  return mockApi((method, path) => {
    if (path.endsWith("/resources")) return [resource("r2", "Jo Park", 1), resource("r1", "Sam Rivers", 0)];
    if (path.endsWith("/bookings")) return { items: bookings, nextCursor: null };
    if (path.endsWith("/availability")) return weekdays;
    if (path.endsWith("/closures")) return [];
    return {};
  });
}

const render = () => renderDashboard(<CalendarView />);
const columns = () =>
  screen
    .getAllByRole("group")
    .filter((g) => g.hasAttribute("aria-label") && /, /.test(g.getAttribute("aria-label") ?? ""));

describe("CalendarView", () => {
  it("shows a column per resource in sort order, with the day's bookings", async () => {
    const calls = api();
    render();
    await waitFor(() => expect(columns()).toHaveLength(2));
    expect(columns().map((c) => c.getAttribute("aria-label"))).toEqual([
      expect.stringMatching(/^Sam Rivers, /),
      expect.stringMatching(/^Jo Park, /),
    ]);
    expect(await screen.findByRole("button", { name: /Alex Morgan/ })).toBeInTheDocument();
    expect(screen.getByText(/1 appointment ·/)).toBeInTheDocument();
    expect(screen.getByText("Sam Rivers").parentElement).toHaveTextContent("1 booked");
    const list = calls.mock.calls
      .map(([u]) => new URL(String(u), "http://x"))
      .find((u) => u.pathname.endsWith("/bookings"));
    expect(list?.searchParams.get("from")).toBe("2099-10-01");
    expect(list?.searchParams.get("to")).toBe("2099-10-01");
    expect(list?.searchParams.getAll("status").join(",")).not.toContain("cancelled");
  });

  it("keeps a column for a deactivated resource while it has bookings that day, marked inactive", async () => {
    mockApi((method, path) => {
      if (path.endsWith("/resources"))
        return [
          resource("r1", "Sam Rivers", 0),
          resource("r3", "Old Room", 1, { isActive: false }),
          resource("r4", "Gone Desk", 2, { isActive: false }),
        ];
      if (path.endsWith("/bookings"))
        return {
          items: [
            booking({ resources: [{ id: "r3", name: "Old Room", kind: "space", requirementId: null }] }),
          ],
          nextCursor: null,
        };
      if (path.endsWith("/availability")) return weekdays;
      if (path.endsWith("/closures")) return [];
      return {};
    });
    render();
    await waitFor(() => expect(columns()).toHaveLength(2));
    expect(columns().map((c) => c.getAttribute("aria-label"))).toEqual([
      expect.stringMatching(/^Sam Rivers, /),
      expect.stringMatching(/^Old Room, /),
    ]);
    expect(screen.getByText("Old Room").parentElement).toHaveTextContent("Inactive · 1 booked");
    expect(within(must(columns()[1])).getByRole("button", { name: /Alex Morgan/ })).toBeInTheDocument();
  });

  it("loads the whole week in week view and opens a day from its header", async () => {
    search = "date=2099-10-01&view=week";
    const calls = api();
    const user = userEvent.setup();
    render();
    await waitFor(() => expect(columns()).toHaveLength(7));
    const list = calls.mock.calls
      .map(([u]) => new URL(String(u), "http://x"))
      .find((u) => u.pathname.endsWith("/bookings"));
    expect(list?.searchParams.get("from")).toBe("2099-09-28");
    expect(list?.searchParams.get("to")).toBe("2099-10-04");
    await user.click(screen.getByRole("button", { name: /^2\s*Fri/ }));
    expect(lastUrl()).toBe(`${PATH}?date=2099-10-02`);
    expect(screen.getByRole("button", { name: "Next week" })).toBeInTheDocument();
  });

  it("moves with the toolbar", async () => {
    api();
    const user = userEvent.setup();
    render();
    await screen.findByRole("button", { name: /Alex Morgan/ });
    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(lastUrl()).toBe(`${PATH}?date=2099-10-02`);
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(lastUrl()).toBe(`${PATH}?date=2099-09-30`);
    expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Week" }));
    expect(lastUrl()).toBe(`${PATH}?date=2099-10-01&view=week`);
    await user.click(screen.getByRole("switch", { name: "Cancelled" }));
    expect(lastUrl()).toBe(`${PATH}?date=2099-10-01&cancelled=1`);
    await user.click(screen.getByRole("combobox", { name: "Filter by therapist" }));
    await user.click(await screen.findByRole("option", { name: /Jo Park/ }));
    expect(lastUrl()).toBe(`${PATH}?date=2099-10-01&resource=r2`);
    await user.click(screen.getByRole("button", { name: /new appointment/i }));
    expect(actions.openNewBooking).toHaveBeenCalledWith({ date: "2099-10-01", resourceId: undefined });
  });

  it("jumps to a date from the title's month calendar", async () => {
    api();
    const user = userEvent.setup();
    render();
    await screen.findByRole("button", { name: /Alex Morgan/ });
    const title = screen.getByRole("button", { name: /^Thursday, 1 October/ });
    expect(title).toHaveTextContent(/Today$/);
    await user.click(title);
    await user.click(await screen.findByRole("button", { name: /\b15 October 2099/ }));
    expect(lastUrl()).toBe(`${PATH}?date=2099-10-15`);
  });

  it("answers ←/→, t, d, w and n, but not with modifiers, while typing or in a dialog", async () => {
    search = "date=2099-10-05&resource=r1";
    api();
    render();
    await waitFor(() => expect(columns()).toHaveLength(1));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(lastUrl()).toBe(`${PATH}?date=2099-10-06&resource=r1`);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(lastUrl()).toBe(`${PATH}?date=2099-10-04&resource=r1`);
    fireEvent.keyDown(window, { key: "w" });
    expect(lastUrl()).toBe(`${PATH}?date=2099-10-05&resource=r1&view=week`);
    fireEvent.keyDown(window, { key: "d" });
    expect(lastUrl()).toBe(`${PATH}?date=2099-10-05&resource=r1`);
    fireEvent.keyDown(window, { key: "t" });
    expect(lastUrl()).toBe(`${PATH}?resource=r1`);
    fireEvent.keyDown(window, { key: "n" });
    expect(actions.openNewBooking).toHaveBeenCalledWith({ date: "2099-10-05", resourceId: "r1" });

    replace.mockClear();
    fireEvent.keyDown(window, { key: "ArrowRight", metaKey: true });
    fireEvent.keyDown(window, { key: "x" });
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "ArrowRight" });
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    dialog.remove();
    input.remove();
    expect(replace).not.toHaveBeenCalled();
  });

  it("leaves arrow keys to the control that has focus", async () => {
    api();
    const user = userEvent.setup();
    render();
    await screen.findByRole("button", { name: /Alex Morgan/ });
    // The Day/Week switcher moves between its options with the arrows; the date must not change too.
    screen.getByRole("radio", { name: "Day" }).focus();
    replace.mockClear();
    await user.keyboard("{ArrowRight}");
    expect(
      replace.mock.calls.map(([url]) => url as string).filter((u) => u.includes("date=2099-10-02")),
    ).toEqual([]);
  });

  it("asks for older overrides and closures when showing a day more than a month back", async () => {
    const fromOf = (calls: ReturnType<typeof api>, suffix: string) =>
      calls.mock.calls
        .map(([u]) => new URL(String(u), "http://x"))
        .filter((u) => u.pathname.endsWith(suffix))
        .map((u) => u.searchParams.get("from"));
    const recent = api();
    const { unmount } = render();
    await waitFor(() => expect(columns()).toHaveLength(2));
    // The API's default (30 days back) covers it.
    expect(fromOf(recent, "/availability")).toEqual([null, null]);
    expect(fromOf(recent, "/closures")).toEqual([null]);
    unmount();

    search = "date=2099-08-12";
    const old = api();
    render();
    await waitFor(() => expect(columns()).toHaveLength(2));
    await waitFor(() => expect(fromOf(old, "/availability")).toEqual(["2099-08-01", "2099-08-01"]));
    expect(fromOf(old, "/closures")).toEqual(["2099-08-01"]);
  });

  it("fetches the days either side once the day has loaded", async () => {
    const calls = api();
    render();
    await screen.findByRole("button", { name: /Alex Morgan/ });
    await waitFor(() =>
      expect(
        calls.mock.calls
          .map(([u]) => new URL(String(u), "http://x"))
          .filter((u) => u.pathname.endsWith("/bookings"))
          .map((u) => u.searchParams.get("from")),
      ).toEqual(["2099-10-01", "2099-09-30", "2099-10-02"]),
    );
  });

  it("dims the grid over the previous day's columns while another day loads, instead of skeletons", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = api();
    const route = must(calls.getMockImplementation(), "the API stub");
    calls.mockImplementation(async (input, init) => {
      if (String(input).includes("from=2099-10-09")) await gate;
      return route(input, init);
    });
    /** Re-renders the calendar on demand, so it reads the (mocked) URL again. */
    function Harness() {
      const [, rerender] = useReducer((n: number) => n + 1, 0);
      return (
        <>
          <button type="button" onClick={rerender}>
            Re-render
          </button>
          <CalendarView />
        </>
      );
    }
    const user = userEvent.setup();
    const { container } = renderDashboard(<Harness />);
    await screen.findByRole("button", { name: /Alex Morgan/ });
    expect(container.querySelector("[aria-busy]")).toBeNull();

    search = "date=2099-10-09";
    await user.click(screen.getByRole("button", { name: "Re-render" }));
    await waitFor(() => expect(container.querySelector("[aria-busy='true']")).not.toBeNull());
    expect(columns().map((c) => c.getAttribute("aria-label"))).toEqual([
      expect.stringMatching(/^Sam Rivers, .*9 October/),
      expect.stringMatching(/^Jo Park, .*9 October/),
    ]);
    // The 1 October booking is not drawn on the 9th.
    expect(screen.queryByRole("button", { name: /Alex Morgan/ })).not.toBeInTheDocument();

    release();
    await waitFor(() => expect(container.querySelector("[aria-busy]")).toBeNull());
  });

  it("opens a booking from the grid and creates one from an empty slot", async () => {
    api();
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: /Alex Morgan/ }));
    expect(actions.openBooking).toHaveBeenCalledWith("bk1");
    expect(actions.openNewBooking).not.toHaveBeenCalled();

    const jo = must(columns().find((c) => c.getAttribute("aria-label")?.startsWith("Jo Park")));
    // The grid starts at the first visible hour; 2 hours down (2 × 64px), then a bit, snaps to the quarter hour.
    fireEvent.mouseMove(jo, { clientY: 2 * 64 + 20 });
    const hint = within(jo).getByText(/^\d\d:\d\d$/);
    fireEvent.click(jo, { clientY: 2 * 64 + 20 });
    expect(actions.openNewBooking).toHaveBeenCalledWith({
      date: "2099-10-01",
      time: hint.textContent,
      resourceId: "r2",
    });
    fireEvent.mouseLeave(jo);
    expect(within(jo).queryByText(/^\d\d:\d\d$/)).not.toBeInTheDocument();
  });

  it("shows buffers, short and cancelled bookings in the grid", async () => {
    search = "date=2099-10-01&cancelled=1";
    api([
      booking({ bufferBeforeMinutes: 15, bufferAfterMinutes: 10 }),
      booking({
        id: "bk2",
        status: "cancelled",
        start: "2099-10-01T11:00:00+01:00",
        end: "2099-10-01T11:15:00+01:00",
        customer: { id: "c2", name: "Cass Gone", email: null, phone: null, groupId: null },
      }),
    ]);
    render();
    const cancelled = await screen.findByRole("button", { name: /Cass Gone/ });
    expect(cancelled).toHaveAccessibleName(/11:00.*Cass Gone.*Cancelled/);
    expect(screen.getByText(/1 appointment ·/)).toBeInTheDocument();
  });

  it("keeps a squeezed short event's start time on screen, clear of the status dot, in week view", async () => {
    search = "date=2099-10-01&view=week";
    const short = { start: "2099-10-01T12:15:00+01:00", end: "2099-10-01T12:45:00+01:00" };
    api([
      booking({ ...short, status: "pending_approval" }),
      booking({
        ...short,
        id: "bk2",
        customer: { id: "c2", name: "Cass Lane", email: null, phone: null, groupId: null },
      }),
    ]);
    render();
    const event = await screen.findByRole("button", { name: /Cass Lane/ });
    // The time is the label that fits a narrow lane; the name ellipsizes beside it (and is in the accessible name).
    expect(event).toHaveAccessibleName(/^12:15\s*Cass Lane/);
    expect(within(event).getByText("12:15")).not.toHaveClass("sr-only");
    // Room for the status dot of the pending one.
    const pending = screen.getByRole("button", { name: /Alex Morgan/ });
    expect(must(within(pending).getByText("Alex Morgan").parentElement)).toHaveClass("pr-3");
  });

  it("says when there are no resources yet", async () => {
    mockApi((method, path) => (path.endsWith("/resources") ? [] : { items: [], nextCursor: null }));
    render();
    expect(await screen.findByRole("heading", { name: "No therapists yet", level: 2 })).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
  });

  it("shows the server's message with a retry when loading fails", async () => {
    let fail = true;
    mockApi((method, path) => {
      if (path.endsWith("/bookings"))
        return fail
          ? json({ error: { code: "INTERNAL", message: "Calendar is down" } }, 500)
          : { items: [], nextCursor: null };
      if (path.endsWith("/resources")) return [resource("r1", "Sam Rivers")];
      if (path.endsWith("/availability")) return weekdays;
      return [];
    });
    const user = userEvent.setup();
    render();
    expect(await screen.findByText("Calendar is down")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "This didn’t load", level: 2 })).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(columns()).toHaveLength(1));
  });

  it("has a page heading and no accessibility violations", async () => {
    api();
    const { container } = render();
    await screen.findByRole("button", { name: /Alex Morgan/ });
    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
