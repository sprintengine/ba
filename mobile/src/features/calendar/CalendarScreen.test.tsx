import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { RefreshControl } from "react-native";
import { booking as bookingFixture, bookingDetail } from "@shared/api/__tests__/fixtures/bookings";
import { resource, service } from "@shared/api/__tests__/fixtures/catalog";
import {
  availabilityOverrideSparse,
  availabilityRule,
  resourceAvailability,
} from "@shared/api/__tests__/fixtures/dashboard";
import { ids } from "@shared/api/__tests__/fixtures/ids";
import { configureApiClient } from "@shared/api/client";
import type { AvailabilityOverride, Booking, Resource, ResourceAvailability } from "@shared/api/types";
import { toPlainDate } from "@shared/format";
import { apiError, calls, json, pending } from "~/test/api-mock";
import { B, renderOpsScreen } from "~/test/render-ops-screen";
import * as layout from "~/ui/layout";
import { BookingDetailScreen } from "~/features/bookings/BookingDetailScreen";
import { agendaItems } from "./AgendaList";
import { CalendarScreen } from "./CalendarScreen";

/** Tuesday 6 October 2026, 08:30 in Dublin (the business's timezone). */
const NOW = new Date("2026-10-06T07:30:00Z");
const TZ = "Europe/Dublin";
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

const alex: Resource = resource;
const jordan: Resource = {
  ...resource,
  id: ids.resource2,
  name: "Jordan Casey",
  color: "#7c3aed",
  memberId: null,
  sortOrder: 1,
};
const former: Resource = { ...resource, id: ids.room, name: "Sasha Former", isActive: false, sortOrder: 2 };
const on = (r: Resource) => [{ id: r.id, name: r.name, kind: r.kind, requirementId: null }];

const base: Booking = {
  ...bookingFixture,
  status: "confirmed",
  cancelledAt: null,
  cancelledBy: null,
  cancellationReason: null,
};
function mk(
  n: number,
  reference: string,
  name: string,
  start: string,
  end: string,
  patch: Partial<Booking> = {},
) {
  return {
    ...base,
    id: uuid(n),
    reference,
    start,
    end,
    option: null,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    customer: { ...base.customer, name },
    ...patch,
  } satisfies Booking;
}

/** Alex, Tuesday 13:00–14:00 (with 5 and 10 minute buffers). */
const rowan = base;
const sam = mk(601, "BA-JORD01", "Sam Casey", "2026-10-06T10:00:00+01:00", "2026-10-06T10:30:00+01:00", {
  status: "pending_approval",
  resources: on(jordan),
});
const chris = mk(602, "BA-CANC01", "Chris Cancel", "2026-10-06T11:00:00+01:00", "2026-10-06T12:00:00+01:00", {
  status: "cancelled",
});
const wren = mk(603, "BA-WED001", "Wren Wednesday", "2026-10-07T09:00:00+01:00", "2026-10-07T10:00:00+01:00");
const kim = mk(604, "BA-THU001", "Kim Thursday", "2026-10-08T09:30:00+01:00", "2026-10-08T10:30:00+01:00");
const pat = mk(605, "BA-FORM01", "Pat Former", "2026-10-06T16:00:00+01:00", "2026-10-06T17:00:00+01:00", {
  resources: on(former),
});
const ALL = [rowan, sam, chris, wren, kim, pat];

const jordanHours: ResourceAvailability = {
  rules: [{ ...availabilityRule, id: uuid(90), resourceId: jordan.id }],
  overrides: [
    {
      id: uuid(91),
      resourceId: jordan.id,
      date: "2026-10-06",
      isAvailable: false,
      startTime: "15:00",
      endTime: "16:00",
      reason: "Training",
    },
  ],
};
const staffDay: AvailabilityOverride = {
  ...availabilityOverrideSparse,
  id: uuid(92),
  date: "2026-10-09",
  reason: "Staff day",
};

type Route = (method: string, url: URL, body: unknown) => unknown;

/** Like `mockApi`, but the route sees the whole URL (the calendar asks for bookings by date range and status). */
function api({
  bookings = ALL,
  resources = [alex, jordan, former],
  extra,
}: { bookings?: Booking[]; resources?: Resource[]; extra?: Route } = {}) {
  const route: Route = (method, url, body) => {
    const custom = extra?.(method, url, body);
    if (custom !== undefined) return custom;
    const path = url.pathname;
    const q = url.searchParams;
    if (path === `${B}/bookings` && method === "GET") {
      const status = (q.get("status") ?? "").split(",");
      const from = q.get("from") ?? "0000-00-00";
      const to = q.get("to") ?? "9999-12-31";
      const rid = q.get("resourceId");
      const items = bookings.filter((b) => {
        const d = toPlainDate(b.start, TZ);
        return (
          status.includes(b.status) && d >= from && d <= to && (!rid || b.resources.some((r) => r.id === rid))
        );
      });
      return { items, nextCursor: null };
    }
    if (path === `${B}/resources`) return resources;
    if (path === `${B}/resources/${alex.id}/availability`) return resourceAvailability;
    if (path === `${B}/resources/${jordan.id}/availability`) return jordanHours;
    if (path === `${B}/closures`) return [staffDay];
    if (path === `${B}/services`) return [service];
    if (path === `${B}/questions`) return [];
    if (path === `${B}/customer-groups`) return [];
    if (path === "/v1/me/notifications") return { items: [], unreadCount: 0 };
    const one = bookings.find((b) => path === `${B}/bookings/${b.id}`);
    if (one && method === "GET") return { ...bookingDetail, ...one, checkoutUrl: null };
    return undefined;
  };
  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const result = await route(method, url, body);
    if (result instanceof Response) return result;
    if (result === undefined) return apiError(404, "NOT_FOUND", `No mock for ${method} ${url.pathname}`);
    return json(result);
  });
  configureApiClient({ fetch: fetchMock as unknown as typeof fetch });
  return fetchMock;
}

/** The URLs of every bookings list request (with their query). */
const bookingRequests = (fetch: jest.Mock) =>
  fetch.mock.calls.map(([input]) => String(input)).filter((u) => u.includes(`${B}/bookings?`));

function wide(isWide: boolean) {
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide, width: isWide ? 1180 : 390, height: 820 });
}

const ROUTES = {
  "dashboard/[slug]/calendar/[id]": () => <BookingDetailScreen />,
};

function renderCalendar() {
  return renderOpsScreen(<CalendarScreen />, { section: "calendar", routes: ROUTES });
}

/** Fake only the clock (timers stay real so React Query and waitFor work as usual). */
function freezeClock(now: Date) {
  jest.useFakeTimers({
    now,
    doNotFake: [
      "nextTick",
      "setImmediate",
      "clearImmediate",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "hrtime",
      "performance",
    ],
  });
}

const title = () => within(screen.getByTestId("calendar-date")).getByText(/./);

describe("CalendarScreen", () => {
  beforeEach(() => {
    freezeClock(NOW);
    wide(false);
  });
  afterEach(() => jest.useRealTimers());

  describe("day view on a phone", () => {
    it("shows today's appointments for the first therapist, with the count and the time now", async () => {
      api();
      renderCalendar();
      const event = await screen.findByTestId("event-BA-7K3F9Q");
      expect(event).toHaveAccessibleName(
        "13:00 to 14:00, Rowan Example, Initial assessment (Extended), Confirmed",
      );
      expect(within(event).getByText("13:00–14:00 · Initial assessment (Extended)")).toBeOnTheScreen();
      expect(title()).toHaveTextContent("Tue, 6 Oct");
      expect(screen.getByTestId("calendar-today")).toBeDisabled();
      expect(screen.getByLabelText("Alex Morgan, 1 booked")).toBeOnTheScreen();
      expect(screen.getByTestId(`column-${alex.id}`)).toHaveAccessibleName("Alex Morgan, Tuesday, 6 October");
      expect(screen.getByTestId("now-line", { includeHiddenElements: true })).toBeOnTheScreen();
      // One therapist at a time: Jordan's appointment and the cancelled one aren't shown.
      expect(screen.queryByTestId("event-BA-JORD01")).toBeNull();
      expect(screen.queryByTestId("event-BA-CANC01")).toBeNull();
      expect(screen.getByText(/1 appointment/)).toBeOnTheScreen();
      expect(screen.getByText(/Tap a free time to book/)).toBeOnTheScreen();
      expect(screen.getByTestId(`resource-${alex.id}`)).toBeChecked();
      expect(screen.getByTestId("week-day-2026-10-06")).toHaveAccessibleName("Tuesday 6 October 2026, today");
    });

    it("switches therapist with the chips, showing their time off", async () => {
      api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      // The inactive therapist has no chip.
      expect(screen.queryByTestId(`resource-${former.id}`)).toBeNull();
      fireEvent.press(screen.getByTestId(`resource-${jordan.id}`));
      const event = await screen.findByTestId("event-BA-JORD01");
      // A short appointment shows its start time before the name.
      expect(within(event).getByText("10:00 Sam Casey")).toBeOnTheScreen();
      expect(event).toHaveAccessibleName(/Sam Casey, Initial assessment/);
      expect(screen.getByLabelText("Time off · Training, 15:00 to 16:00")).toBeOnTheScreen();
      expect(screen.queryByTestId("event-BA-7K3F9Q")).toBeNull();
      expect(screen.getByTestId(`resource-${jordan.id}`)).toBeChecked();
    });

    it("moves a day at a time, jumps back to today, and picks days from the week strip", async () => {
      const fetch = api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");

      fireEvent.press(screen.getByRole("button", { name: "Next day" }));
      expect(await screen.findByTestId("event-BA-WED001")).toBeOnTheScreen();
      expect(title()).toHaveTextContent("Wed, 7 Oct");
      expect(screen.queryByTestId("event-BA-7K3F9Q")).toBeNull();
      expect(screen.queryByTestId("now-line", { includeHiddenElements: true })).toBeNull();
      expect(screen.getByTestId("calendar-today")).toBeEnabled();
      expect(bookingRequests(fetch).some((u) => u.includes("from=2026-10-07&to=2026-10-07"))).toBe(true);

      fireEvent.press(screen.getByRole("button", { name: "Previous day" }));
      fireEvent.press(screen.getByRole("button", { name: "Previous day" }));
      await waitFor(() => expect(title()).toHaveTextContent("Mon, 5 Oct"));

      fireEvent.press(screen.getByTestId("calendar-today"));
      expect(await screen.findByTestId("event-BA-7K3F9Q")).toBeOnTheScreen();
      expect(title()).toHaveTextContent("Tue, 6 Oct");

      fireEvent.press(screen.getByTestId("week-day-2026-10-08"));
      expect(await screen.findByTestId("event-BA-THU001")).toBeOnTheScreen();
      expect(screen.getByTestId("week-day-2026-10-08")).toBeChecked();
    });

    it("goes to a date chosen from the month", async () => {
      api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      fireEvent.press(screen.getByRole("button", { name: "Tuesday 6 October 2026. Choose a date" }));
      const sheet = await screen.findByTestId("date-sheet");
      fireEvent.press(within(sheet).getByTestId("day-2026-10-08"));
      expect(await screen.findByTestId("event-BA-THU001")).toBeOnTheScreen();
      expect(screen.queryByTestId("date-sheet")).toBeNull();
      expect(title()).toHaveTextContent("Thu, 8 Oct");
    });

    it("moves to the day in a link while it stays open", async () => {
      api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      act(() => router.setParams({ date: "2026-10-07" }));
      expect(await screen.findByTestId("event-BA-WED001")).toBeOnTheScreen();
      expect(title()).toHaveTextContent("Wed, 7 Oct");
    });

    it("swipes sideways to the next or previous day", async () => {
      api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      swipe(-150);
      expect(await screen.findByTestId("event-BA-WED001")).toBeOnTheScreen();
      swipe(150);
      expect(await screen.findByTestId("event-BA-7K3F9Q")).toBeOnTheScreen();
      // A short drag isn't a swipe.
      swipe(-40);
      expect(title()).toHaveTextContent("Tue, 6 Oct");
    });
  });

  describe("day view on a large screen", () => {
    beforeEach(() => wide(true));

    it("shows every therapist side by side, and narrows to one", async () => {
      api();
      renderCalendar();
      expect(await screen.findByTestId("event-BA-7K3F9Q")).toBeOnTheScreen();
      expect(screen.getByTestId("event-BA-JORD01")).toBeOnTheScreen();
      expect(title()).toHaveTextContent("Tuesday, 6 October");
      expect(screen.getByTestId(`column-${alex.id}`)).toBeOnTheScreen();
      expect(screen.getByTestId(`column-${jordan.id}`)).toBeOnTheScreen();
      // A deactivated therapist still shows while they have appointments that day.
      expect(screen.getByLabelText("Sasha Former, inactive, 1 booked")).toBeOnTheScreen();
      expect(screen.getByText("Inactive · 1 booked")).toBeOnTheScreen();
      expect(screen.getByText(/3 appointments/)).toBeOnTheScreen();

      fireEvent.press(screen.getByRole("button", { name: "Show: All therapists" }));
      fireEvent.press(await screen.findByRole("radio", { name: "Jordan Casey" }));
      await waitFor(() => expect(screen.queryByTestId("event-BA-7K3F9Q")).toBeNull());
      expect(screen.getByTestId("event-BA-JORD01")).toBeOnTheScreen();
      expect(screen.getByTestId("calendar-resource")).toHaveAccessibleName("Show: Jordan Casey");

      fireEvent.press(screen.getByTestId("calendar-resource"));
      fireEvent.press(await screen.findByRole("radio", { name: "All therapists" }));
      expect(await screen.findByTestId("event-BA-7K3F9Q")).toBeOnTheScreen();
    });

    it("scrolls the columns sideways when they don't fit", async () => {
      api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      expect(screen.queryByTestId("calendar-columns")).toBeNull();
      // An iPad in split view: three therapists don't fit in 320 points.
      const frame = gridFrame();
      act(() => frame.props.onLayout({ nativeEvent: { layout: { width: 320, height: 600 } } }));
      expect(await screen.findByTestId("calendar-columns")).toBeOnTheScreen();
    });

    it("says when there are no therapists yet", async () => {
      api({ resources: [], bookings: [] });
      renderCalendar();
      expect(await screen.findByText("No therapists yet")).toBeOnTheScreen();
      expect(screen.queryByTestId("calendar-grid")).toBeNull();
    });
  });

  describe("week view", () => {
    it("shows the week's appointments by day, with closures, and opens a day", async () => {
      const fetch = api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      fireEvent.press(screen.getByRole("tab", { name: "Week" }));
      expect(await screen.findByTestId("event-BA-THU001")).toBeOnTheScreen();
      expect(screen.getByTestId("event-BA-WED001")).toBeOnTheScreen();
      expect(screen.getByTestId("event-BA-JORD01")).toBeOnTheScreen();
      expect(bookingRequests(fetch).some((u) => u.includes("from=2026-10-05&to=2026-10-11"))).toBe(true);
      expect(screen.getByTestId("calendar-date")).toHaveAccessibleName(/^Week of .*5 October/);
      expect(screen.getByTestId("day-header-2026-10-06")).toHaveAccessibleName(/6 October, today, 3 booked$/);
      expect(screen.getByTestId("day-header-2026-10-08")).toHaveAccessibleName(/8 October, 1 booked$/);
      expect(screen.getByLabelText("Closed · Staff day, all day")).toBeOnTheScreen();
      expect(screen.queryByTestId("week-day-2026-10-06")).toBeNull();
      expect(screen.getByRole("button", { name: "Next week" })).toBeOnTheScreen();

      fireEvent.press(screen.getByTestId("day-header-2026-10-08"));
      expect(await screen.findByTestId("week-day-2026-10-08")).toBeChecked();
      expect(title()).toHaveTextContent("Thu, 8 Oct");
      expect(screen.getByRole("tab", { name: "Day" })).toBeSelected();
    });

    it("steps a week at a time", async () => {
      const fetch = api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      fireEvent.press(screen.getByRole("tab", { name: "Week" }));
      await screen.findByTestId("event-BA-THU001");
      fireEvent.press(screen.getByRole("button", { name: "Next week" }));
      await waitFor(() => expect(screen.queryByTestId("event-BA-THU001")).toBeNull());
      expect(screen.getByTestId("day-header-2026-10-12")).toBeOnTheScreen();
      expect(bookingRequests(fetch).some((u) => u.includes("from=2026-10-12&to=2026-10-18"))).toBe(true);
      fireEvent.press(screen.getByRole("button", { name: "Previous week" }));
      expect(await screen.findByTestId("event-BA-THU001")).toBeOnTheScreen();
    });

    it("shows one therapist's week, with their time off", async () => {
      wide(true);
      api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      fireEvent.press(screen.getByTestId("calendar-resource"));
      fireEvent.press(await screen.findByRole("radio", { name: "Jordan Casey" }));
      fireEvent.press(screen.getByRole("tab", { name: "Week" }));
      expect(await screen.findByTestId("day-header-2026-10-06")).toHaveAccessibleName(/today, 1 booked$/);
      expect(screen.getByTestId("event-BA-JORD01")).toBeOnTheScreen();
      expect(screen.queryByTestId("event-BA-THU001")).toBeNull();
      expect(screen.getByLabelText("Time off · Training, 15:00 to 16:00")).toBeOnTheScreen();
    });

    it("opens a week from a link", async () => {
      api();
      renderOpsScreen(<CalendarScreen />, {
        section: "calendar",
        routes: { ...ROUTES, "dashboard/[slug]/calendar/index": () => <CalendarScreen /> },
      });
      await screen.findByTestId("event-BA-7K3F9Q");
      act(() =>
        router.push(`/dashboard/lumen-physio/calendar?view=week&date=2026-10-08&resource=${jordan.id}`),
      );
      expect(await screen.findByTestId("day-header-2026-10-08")).toBeOnTheScreen();
      expect(await screen.findByTestId("event-BA-JORD01")).toBeOnTheScreen();
      expect(screen.queryByTestId("event-BA-THU001")).toBeNull();
    });
  });

  describe("cancelled appointments", () => {
    it("are shown only when asked for, faded and not counted", async () => {
      const fetch = api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      expect(screen.queryByTestId("event-BA-CANC01")).toBeNull();
      expect(bookingRequests(fetch).every((u) => !u.includes("cancelled"))).toBe(true);

      fireEvent.press(screen.getByRole("checkbox", { name: "Cancelled" }));
      const event = await screen.findByTestId("event-BA-CANC01");
      expect(event).toHaveAccessibleName(/Chris Cancel, .*Cancelled$/);
      expect(screen.getByRole("checkbox", { name: "Cancelled" })).toBeChecked();
      expect(bookingRequests(fetch).some((u) => u.includes("cancelled"))).toBe(true);
      expect(screen.getByLabelText("Alex Morgan, 1 booked")).toBeOnTheScreen();
      expect(screen.getByText(/1 appointment /)).toBeOnTheScreen();
    });
  });

  describe("acting on the calendar", () => {
    it("opens an appointment in the calendar's own stack", async () => {
      api();
      const app = renderCalendar();
      fireEvent.press(await screen.findByTestId("event-BA-7K3F9Q"));
      expect(await screen.findByTestId("booking-detail")).toBeOnTheScreen();
      expect(app.getPathname()).toBe(`/dashboard/lumen-physio/calendar/${rowan.id}`);
    });

    it("books a free time in the column it was tapped", async () => {
      api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      // The grid starts at 08:00; two hours down is 10:00.
      fireEvent.press(screen.getByTestId(`create-${alex.id}`), { nativeEvent: { locationY: 128 } });
      const sheet = await screen.findByTestId("new-booking-sheet");
      fireEvent.press(await within(sheet).findByTestId(`service-${service.id}`));
      expect(await within(sheet).findByTestId("new-booking-summary")).toHaveTextContent(/^Tue, 6 Oct, 10:00/);
      expect(within(sheet).getByTestId("new-booking-exact-time")).toHaveDisplayValue("10:00");
      expect(within(sheet).getByTestId("date-2026-10-06")).toBeChecked();
    });

    it("books a free time on the day tapped in the week", async () => {
      api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      fireEvent.press(screen.getByRole("tab", { name: "Week" }));
      await screen.findByTestId("event-BA-THU001");
      fireEvent.press(screen.getByTestId("create-2026-10-08"), { nativeEvent: { locationY: 6.5 * 64 } });
      const sheet = await screen.findByTestId("new-booking-sheet");
      fireEvent.press(await within(sheet).findByTestId(`service-${service.id}`));
      expect(await within(sheet).findByTestId("new-booking-summary")).toHaveTextContent(/^Thu, 8 Oct, 14:30/);
    });

    it("long-press moves an appointment that can still move, and opens one that can't", async () => {
      api();
      const app = renderCalendar();
      fireEvent(await screen.findByTestId("event-BA-7K3F9Q"), "longPress");
      expect(await screen.findByTestId("reschedule-sheet")).toBeOnTheScreen();
      fireEvent.press(within(screen.getByTestId("reschedule-sheet")).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByTestId("reschedule-sheet")).toBeNull());

      fireEvent.press(screen.getByRole("checkbox", { name: "Cancelled" }));
      fireEvent(await screen.findByTestId("event-BA-CANC01"), "longPress");
      expect(await screen.findByTestId("booking-detail")).toBeOnTheScreen();
      expect(screen.queryByTestId("reschedule-sheet")).toBeNull();
      expect(app.getPathname()).toBe(`/dashboard/lumen-physio/calendar/${chris.id}`);
    });

    it("offers VoiceOver users move and open as actions", async () => {
      api();
      const app = renderCalendar();
      const event = await screen.findByTestId("event-BA-7K3F9Q");
      fireEvent(event, "accessibilityAction", { nativeEvent: { actionName: "move" } });
      expect(await screen.findByTestId("reschedule-sheet")).toBeOnTheScreen();
      fireEvent(event, "accessibilityAction", { nativeEvent: { actionName: "activate" } });
      await waitFor(() => expect(app.getPathname()).toBe(`/dashboard/lumen-physio/calendar/${rowan.id}`));
    });

    it("refreshes on pull", async () => {
      const fetch = api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      const before = calls(fetch).filter((c) => c === `GET ${B}/resources`).length;
      await act(async () => {
        screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(calls(fetch).filter((c) => c === `GET ${B}/resources`).length).toBeGreaterThan(before),
      );
      await waitFor(() => expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false));
    });
  });

  describe("loading and errors", () => {
    it("shows placeholders while the day loads", async () => {
      api({ extra: (_m, url) => (url.pathname === `${B}/bookings` ? pending() : undefined) });
      renderCalendar();
      expect(await screen.findByText(/Updating…/)).toBeOnTheScreen();
      expect(screen.queryByTestId(`column-${alex.id}`)).toBeNull();
    });

    it("shows the API's error, and tries again", async () => {
      let fail = true;
      api({
        extra: (_m, url) =>
          url.pathname === `${B}/resources` && fail
            ? apiError(500, "INTERNAL", "Calendar is down")
            : undefined,
      });
      renderCalendar();
      expect(await screen.findByText("Calendar is down")).toBeOnTheScreen();
      fail = false;
      fireEvent.press(screen.getByRole("button", { name: /Try again/ }));
      expect(await screen.findByTestId("event-BA-7K3F9Q")).toBeOnTheScreen();
    });
  });

  describe("list view", () => {
    it("lists appointments day by day from the chosen day, and opens one", async () => {
      api();
      const app = renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      fireEvent.press(screen.getByRole("tab", { name: "List" }));
      expect(await screen.findByTestId("agenda-list")).toBeOnTheScreen();
      expect(await screen.findByTestId("booking-row-BA-WED001")).toBeOnTheScreen();
      expect(screen.getByTestId("booking-row-BA-7K3F9Q")).toBeOnTheScreen();
      expect(screen.getByText(/6 October · 3 appointments/)).toBeOnTheScreen();
      expect(screen.getByText(/7 October · 1 appointment$/)).toBeOnTheScreen();
      // Day and week controls belong to the grid.
      expect(screen.queryByTestId("week-day-2026-10-06")).toBeNull();
      fireEvent.press(screen.getByTestId("booking-row-BA-WED001"));
      expect(await screen.findByTestId("booking-detail")).toBeOnTheScreen();
      expect(app.getPathname()).toBe(`/dashboard/lumen-physio/calendar/${wren.id}`);
    });

    it("lists only the chosen therapist's appointments", async () => {
      const fetch = api();
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      fireEvent.press(screen.getByTestId(`resource-${jordan.id}`));
      await screen.findByTestId("event-BA-JORD01");
      fireEvent.press(screen.getByRole("tab", { name: "List" }));
      expect(await screen.findByTestId("booking-row-BA-JORD01")).toBeOnTheScreen();
      expect(screen.queryByTestId("booking-row-BA-7K3F9Q")).toBeNull();
      expect(bookingRequests(fetch).some((u) => u.includes(`resourceId=${jordan.id}`))).toBe(true);
    });

    it("says when nothing is booked from that day", async () => {
      api({ bookings: [], resources: [alex] });
      renderCalendar();
      fireEvent.press(await screen.findByRole("tab", { name: "List" }));
      expect(await screen.findByText("No appointments from Tue, 6 Oct")).toBeOnTheScreen();
      // With one therapist, there's nothing to filter in the list.
      expect(screen.queryByLabelText("Therapists and filters")).toBeNull();
    });

    it("shows a loading state, then the API's error", async () => {
      let respond: (r: Response) => void = () => undefined;
      api({
        extra: (_m, url) =>
          url.pathname === `${B}/bookings` && !url.searchParams.has("to")
            ? new Promise<Response>((resolve) => (respond = resolve))
            : undefined,
      });
      renderCalendar();
      fireEvent.press(await screen.findByRole("tab", { name: "List" }));
      expect(await screen.findByRole("progressbar", { name: "Loading" })).toBeOnTheScreen();
      act(() => respond(apiError(500, "INTERNAL", "List is down")));
      expect(await screen.findByText("List is down")).toBeOnTheScreen();
    });

    it("loads more as you scroll, and refreshes on pull", async () => {
      const page2 = mk(
        606,
        "BA-NEXT01",
        "Nico Later",
        "2026-10-20T09:00:00+01:00",
        "2026-10-20T10:00:00+01:00",
      );
      const fetch = api({
        extra: (_m, url) => {
          if (url.pathname !== `${B}/bookings` || url.searchParams.has("to")) return undefined;
          return url.searchParams.get("cursor") === "p2"
            ? { items: [page2], nextCursor: null }
            : { items: [rowan], nextCursor: "p2" };
        },
      });
      renderCalendar();
      await screen.findByTestId("event-BA-7K3F9Q");
      fireEvent.press(screen.getByRole("tab", { name: "List" }));
      const list = await screen.findByTestId("agenda-list");
      await screen.findByTestId("booking-row-BA-7K3F9Q");
      fireEvent(list, "endReached");
      expect(await screen.findByTestId("booking-row-BA-NEXT01")).toBeOnTheScreen();
      expect(bookingRequests(fetch).some((u) => u.includes("cursor=p2"))).toBe(true);

      const before = bookingRequests(fetch).length;
      await act(async () => {
        fireEvent(list, "refresh");
        await Promise.resolve();
      });
      await waitFor(() => expect(bookingRequests(fetch).length).toBeGreaterThan(before));
    });
  });
});

describe("agendaItems", () => {
  it("groups appointments under their day in order, counting all but cancelled ones", () => {
    const items = agendaItems([kim, chris, rowan, wren], TZ);
    expect(items.map((i) => (i.type === "day" ? `${i.date}:${i.count}` : i.booking.reference))).toEqual([
      "2026-10-06:1",
      "BA-CANC01",
      "BA-7K3F9Q",
      "2026-10-07:1",
      "BA-WED001",
      "2026-10-08:1",
      "BA-THU001",
    ]);
    expect(agendaItems([], TZ)).toEqual([]);
  });
});

/** The grid's frame (it measures its width, and takes sideways swipes). */
function gridFrame() {
  const [frame] = screen.UNSAFE_root.findAll(
    (n) => typeof n.type === "string" && !!n.props.onLayout && !!n.props.onMoveShouldSetResponderCapture,
  );
  if (!frame) throw new Error("No calendar grid frame");
  return frame;
}

/** A horizontal drag of `dx` points across the grid, through its PanResponder. */
function swipe(dx: number) {
  const frame = gridFrame();
  const touch = (x: number, t: number) => ({
    touchActive: true,
    startPageX: 200,
    startPageY: 300,
    startTimeStamp: 0,
    currentPageX: x,
    currentPageY: 302,
    currentTimeStamp: t,
    previousPageX: 200,
    previousPageY: 300,
    previousTimeStamp: 0,
  });
  const event = (x: number, t: number) => ({
    nativeEvent: { pageX: x, pageY: 302, timestamp: t, touches: [], changedTouches: [] },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: t,
      touchBank: [touch(x, t)],
    },
  });
  act(() => {
    expect(frame.props.onMoveShouldSetResponderCapture(event(200 + dx, 10))).toBe(Math.abs(dx) > 24);
    frame.props.onResponderGrant(event(200, 10));
    frame.props.onResponderMove(event(200 + dx, 20));
    frame.props.onResponderRelease(event(200 + dx, 20));
  });
}
