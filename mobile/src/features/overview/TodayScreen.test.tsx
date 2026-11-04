import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { RefreshControl, Share, Text } from "react-native";
import { assistantState } from "@shared/api/__tests__/fixtures/assistant";
import { bookingSparse } from "@shared/api/__tests__/fixtures/bookings";
import { business } from "@shared/api/__tests__/fixtures/business";
import { overview as overviewFixture } from "@shared/api/__tests__/fixtures/dashboard";
import type { AssistantState, Booking, Overview } from "@shared/api/types";
import { apiError, calls, mockApi, pending } from "~/test/api-mock";
import { B, renderOpsScreen, type OpsScreenOptions } from "~/test/render-ops-screen";
import * as layout from "~/ui/layout";
import { TodayScreen } from "./TodayScreen";

const HOUR = 3_600_000;
const at = (offsetHours: number) => new Date(Date.now() + offsetHours * HOUR).toISOString();

/** Earlier today (done), and later today. */
const done: Booking = {
  ...bookingSparse,
  id: "00000000-0000-4000-8000-000000000701",
  reference: "BA-DONE01",
  customer: { ...bookingSparse.customer, name: "Early Bird" },
  start: at(-3),
  end: at(-2),
};
const next: Booking = {
  ...bookingSparse,
  id: "00000000-0000-4000-8000-000000000702",
  reference: "BA-NEXT01",
  customer: { ...bookingSparse.customer, name: "Next Up" },
  start: at(2),
  end: at(3),
};
const request: Booking = {
  ...next,
  id: "00000000-0000-4000-8000-000000000703",
  reference: "BA-PEND01",
  status: "pending_approval",
  customer: { ...bookingSparse.customer, name: "Sam Pending" },
};
const overview: Overview = { ...overviewFixture, today: [next, done] };
const nudge = assistantState.nudges[0]!;

type Api = {
  overview?: Overview | Response | Promise<Response>;
  pending?: Booking[];
  more?: boolean;
  assistant?: AssistantState;
  extra?: (m: string, p: string, body: unknown) => unknown;
};

function api({
  overview: o = overview,
  pending: p = [],
  more = false,
  assistant = assistantState,
  extra,
}: Api = {}) {
  return mockApi((method, path, body) => {
    const custom = extra?.(method, path, body);
    if (custom !== undefined) return custom;
    if (path === `${B}/overview`) return o;
    if (path === `${B}/bookings` && method === "GET") return { items: p, nextCursor: more ? "c2" : null };
    if (path === `${B}/assistant`) return assistant;
    if (path === `${B}/resources`) return [];
    return undefined;
  });
}

/** A stand-in screen for a route Today navigates to. */
function page(name: string) {
  return function Page() {
    return <Text>{name}</Text>;
  };
}
const routes = {
  "dashboard/[slug]/calendar/index": page("Calendar page"),
  "dashboard/[slug]/booking/[id]": page("Booking page"),
  "dashboard/[slug]/bookings/index": page("Bookings page"),
  "dashboard/[slug]/settings/general": page("Settings page"),
  "assistant/index": page("Assistant page"),
};

const render = (options: OpsScreenOptions = {}) =>
  renderOpsScreen(<TodayScreen />, { section: "overview", routes, ...options });

function wide(isWide: boolean) {
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide, width: isWide ? 1180 : 390, height: 820 });
}

describe("TodayScreen", () => {
  beforeEach(() => wide(false));

  it("greets the member and sums up the day, with revenue for owners", async () => {
    api();
    render();
    expect(await screen.findByText(/^Good (morning|afternoon|evening), Avery$/)).toBeOnTheScreen();
    expect(await screen.findByText(/ · 2 appointments today$/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Today: 2\. Next at \d\d:\d\d$/)).toBeOnTheScreen();
    expect(screen.getByLabelText("Next 7 days: 12. Upcoming appointments")).toBeOnTheScreen();
    expect(screen.getByLabelText("Appointments: 41. Booked in the last 30 days")).toBeOnTheScreen();
    expect(screen.getByLabelText("Revenue: €1,840. Last 30 days, after refunds")).toBeOnTheScreen();
  });

  it("shows the tiles loading, then hides revenue from staff", async () => {
    let answer: (r: Response) => void = () => undefined;
    api({ overview: new Promise<Response>((resolve) => (answer = resolve)), assistant: undefined });
    render({ role: "staff" });
    expect(await screen.findByLabelText("Today, loading")).toBeOnTheScreen();
    expect(screen.getByLabelText("Loading")).toBeOnTheScreen();
    answer(new Response(JSON.stringify({ ...overview, today: [] }), { status: 200 }));
    expect(await screen.findByLabelText("Today: 0. A quiet day")).toBeOnTheScreen();
    expect(screen.getByText(/ · No appointments today$/)).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Revenue/)).toBeNull();
    // Staff don't see Bo's nudges or setup.
    expect(screen.queryByTestId("nudges")).toBeNull();
    expect(screen.queryByTestId("setup-checklist")).toBeNull();
  });

  describe("today's schedule", () => {
    it("lists the day in order with a line at the current time, and opens a booking", async () => {
      api();
      const app = render();
      const schedule = await screen.findByTestId("today-schedule");
      const rows = await within(schedule).findAllByTestId(/^today-BA-/);
      expect(rows.map((r) => r.props.testID)).toEqual(["today-BA-DONE01", "today-BA-NEXT01"]);
      expect(within(schedule).getByText(/^Now · \d\d:\d\d$/, { includeHiddenElements: true })).toBeTruthy();
      fireEvent.press(screen.getByTestId("today-BA-NEXT01"));
      expect(await screen.findByText("Booking page")).toBeOnTheScreen();
      expect(app.getPathname()).toBe(`/dashboard/lumen-physio/booking/${next.id}`);
    });

    it("badges bookings that aren't confirmed, and counts those needing approval", async () => {
      api({ overview: { ...overview, today: [done, request] } });
      render();
      const row = await screen.findByTestId("today-BA-PEND01");
      expect(within(row).getByText("Needs approval")).toBeOnTheScreen();
      expect(screen.getByLabelText("Today: 2. 1 needs approval")).toBeOnTheScreen();
    });

    it("says when nothing is booked, and starts a new booking", async () => {
      api({ overview: { ...overview, today: [] } });
      render();
      expect(await screen.findByText("Nothing booked today")).toBeOnTheScreen();
      const schedule = screen.getByTestId("today-schedule");
      fireEvent.press(within(schedule).getByRole("button", { name: "New appointment" }));
      expect(await screen.findByTestId("new-booking-sheet")).toBeOnTheScreen();
    });

    it("opens the calendar", async () => {
      api();
      const app = render();
      fireEvent.press(await screen.findByRole("button", { name: "Open calendar" }));
      expect(await screen.findByText("Calendar page")).toBeOnTheScreen();
      expect(app.getPathname()).toBe("/dashboard/lumen-physio/calendar");
    });
  });

  describe("quick actions", () => {
    it("starts a new booking", async () => {
      api();
      render();
      fireEvent.press(await screen.findByTestId("today-new-booking"));
      expect(await screen.findByTestId("new-booking-sheet")).toBeOnTheScreen();
    });

    it("blocks time", async () => {
      api();
      render();
      expect(screen.queryByTestId("block-time-sheet")).toBeNull();
      fireEvent.press(await screen.findByTestId("today-block-time"));
      expect(await screen.findByTestId("block-time-sheet")).toBeOnTheScreen();
    });

    it("goes to the calendar", async () => {
      api();
      const app = render();
      fireEvent.press(await screen.findByRole("button", { name: "Calendar" }));
      expect(await screen.findByText("Calendar page")).toBeOnTheScreen();
      expect(app.getPathname()).toBe("/dashboard/lumen-physio/calendar");
    });
  });

  describe("waiting for approval", () => {
    it("approves a request, which then leaves the list", async () => {
      let waiting = [request];
      const fetch = api({
        extra: (method, path) => {
          if (method === "POST" && path === `${B}/bookings/${request.id}/approve`) {
            waiting = [];
            return { ...request, status: "confirmed" };
          }
          if (method === "GET" && path === `${B}/bookings`) return { items: waiting, nextCursor: null };
          return undefined;
        },
      });
      render();
      const card = await screen.findByTestId("pending-approvals");
      expect(within(card).getByText("Patients hear back as soon as you decide.")).toBeOnTheScreen();
      expect(within(card).getByText("1")).toBeOnTheScreen();
      expect(within(card).getByText(/^Initial assessment · .+, \d\d:\d\d$/)).toBeOnTheScreen();
      fireEvent.press(within(card).getByLabelText("Approve Sam Pending"));
      expect(await screen.findByText("Appointment approved")).toBeOnTheScreen();
      await waitFor(() => expect(screen.queryByTestId("pending-approvals")).toBeNull());
      expect(calls(fetch)).toContain(`POST ${B}/bookings/${request.id}/approve`);
    });

    it("says why an approval failed", async () => {
      api({
        pending: [request],
        extra: (method) =>
          method === "POST" ? apiError(409, "SLOT_UNAVAILABLE", "That time is taken") : undefined,
      });
      render();
      fireEvent.press(await screen.findByTestId("approve-BA-PEND01"));
      expect(await screen.findByText("That time is taken")).toBeOnTheScreen();
      expect(screen.getByTestId("pending-approvals")).toBeOnTheScreen();
    });

    it("declines a request from its sheet", async () => {
      let body: unknown;
      api({
        pending: [request],
        extra: (method, path, b) => {
          if (method === "POST" && path === `${B}/bookings/${request.id}/decline`) {
            body = b;
            return { ...request, status: "cancelled" };
          }
          return undefined;
        },
      });
      render();
      fireEvent.press(await screen.findByTestId("decline-BA-PEND01"));
      const sheet = await screen.findByTestId("decline-sheet");
      expect(within(sheet).getByText(/^Sam Pending · Initial assessment · /)).toBeOnTheScreen();
      fireEvent.press(within(sheet).getByTestId("confirm-decline"));
      expect(await screen.findByText("Appointment declined")).toBeOnTheScreen();
      expect(body).toEqual({ reason: null });
      await waitFor(() => expect(screen.queryByTestId("decline-sheet")).toBeNull());
    });

    it("opens a request, and all of them", async () => {
      api({ pending: [request], more: true });
      const app = render();
      const card = await screen.findByTestId("pending-approvals");
      expect(within(card).getByText("1+")).toBeOnTheScreen();
      fireEvent.press(within(card).getByRole("button", { name: "See all" }));
      expect(await screen.findByText("Bookings page")).toBeOnTheScreen();
      expect(app.getPathname()).toBe("/dashboard/lumen-physio/bookings");
      expect(app.getSearchParams()).toMatchObject({ status: "pending_approval" });
    });

    it("opens one request's booking", async () => {
      api({ pending: [request] });
      const app = render();
      fireEvent.press(await screen.findByTestId("pending-BA-PEND01"));
      expect(await screen.findByText("Booking page")).toBeOnTheScreen();
      expect(app.getPathname()).toBe(`/dashboard/lumen-physio/booking/${request.id}`);
    });
  });

  describe("Bo's nudges", () => {
    it("shows what Bo noticed, with its action", async () => {
      api();
      const app = render();
      const card = await screen.findByTestId(`nudge-${nudge.id}`);
      expect(within(card).getByText("2 appointments need approval")).toBeOnTheScreen();
      expect(within(card).getByText("Rowan and Sam are waiting.")).toBeOnTheScreen();
      fireEvent.press(within(card).getByRole("button", { name: "Review" }));
      expect(await screen.findByText("Bookings page")).toBeOnTheScreen();
      expect(app.getSearchParams()).toMatchObject({ status: "pending_approval" });
    });

    it("asks Bo about a nudge", async () => {
      api();
      const app = render();
      const card = await screen.findByTestId(`nudge-${nudge.id}`);
      fireEvent.press(within(card).getByRole("button", { name: "Ask Bo" }));
      expect(await screen.findByText("Assistant page")).toBeOnTheScreen();
      expect(app.getPathname()).toBe("/assistant");
      expect(app.getSearchParams()).toEqual({ business: "lumen-physio", prompt: nudge.prompt });
    });

    it("can't ask Bo when it isn't set up, and shows a plain nudge without an action", async () => {
      api({
        assistant: {
          ...assistantState,
          configured: false,
          nudges: [{ ...nudge, severity: "info", action: null }],
        },
      });
      render();
      const card = await screen.findByTestId(`nudge-${nudge.id}`);
      expect(within(card).queryByRole("button", { name: "Ask Bo" })).toBeNull();
      expect(within(card).queryByRole("button", { name: "Review" })).toBeNull();
    });

    it("dismisses a nudge", async () => {
      const fetch = api({
        extra: (method, path) =>
          method === "POST" && path === `${B}/assistant/nudges/${nudge.id}/dismiss`
            ? new Response(null, { status: 204 })
            : undefined,
      });
      render();
      fireEvent.press(await screen.findByLabelText(`Dismiss: ${nudge.title}`));
      await waitFor(() => expect(screen.queryByTestId("nudges")).toBeNull());
      expect(calls(fetch)).toContain(`POST ${B}/assistant/nudges/${nudge.id}/dismiss`);
    });

    it("says why a dismissal failed", async () => {
      api({
        extra: (method) => (method === "POST" ? apiError(500, "INTERNAL", "Couldn't dismiss") : undefined),
      });
      render();
      fireEvent.press(await screen.findByLabelText(`Dismiss: ${nudge.title}`));
      expect(await screen.findByText("Couldn't dismiss")).toBeOnTheScreen();
      expect(screen.getByTestId(`nudge-${nudge.id}`)).toBeOnTheScreen();
    });
  });

  describe("setup", () => {
    it("shows the progress and opens the steps left", async () => {
      api();
      const app = render();
      const card = await screen.findByTestId("setup-checklist");
      expect(within(card).getByText("50%")).toBeOnTheScreen();
      expect(within(card).getByText("1 of 2 done")).toBeOnTheScreen();
      expect(within(card).getByLabelText("Setup progress")).toHaveAccessibilityValue({ now: 50 });
      expect(within(card).getByText("Add your services (done)")).toBeOnTheScreen();
      fireEvent.press(within(card).getByText("Publish your page"));
      expect(await screen.findByText("Settings page")).toBeOnTheScreen();
      expect(app.getPathname()).toBe("/dashboard/lumen-physio/settings/general");
    });

    it("tells admins to ask the owner to connect payments", async () => {
      api({
        overview: {
          ...overview,
          checklist: [
            { key: "payments", done: false },
            { key: "services", done: false },
          ],
        },
      });
      render({ role: "admin" });
      const card = await screen.findByTestId("setup-checklist");
      expect(within(card).getByText("Ask the owner to do this.")).toBeOnTheScreen();
      expect(within(card).getByText("What people can book, with prices and durations.")).toBeOnTheScreen();
    });

    it("goes away once everything is done", async () => {
      api({ overview: { ...overview, checklist: [{ key: "services", done: true }] } });
      render();
      expect(await screen.findByTestId("share-card")).toBeOnTheScreen();
      expect(screen.queryByTestId("setup-checklist")).toBeNull();
    });
  });

  describe("the booking page", () => {
    it("shares and opens the live page", async () => {
      const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
      api();
      render();
      const card = await screen.findByTestId("share-card");
      expect(within(card).getByText("Live")).toBeOnTheScreen();
      expect(within(card).getByText(/lumen-physio$/)).toBeOnTheScreen();
      expect(within(card).queryByRole("button", { name: "Publish settings" })).toBeNull();
      fireEvent.press(within(card).getByRole("button", { name: "Share link" }));
      expect(share).toHaveBeenCalledWith({
        message: expect.stringMatching(/\/lumen-physio$/),
        url: expect.stringMatching(/\/lumen-physio$/),
      });
      fireEvent.press(within(card).getByRole("button", { name: "Open" }));
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(expect.stringMatching(/\/lumen-physio$/));
    });

    it("says a draft page is only visible to the team, and links managers to publishing", async () => {
      api();
      const app = render({ business: { ...business, status: "draft" } });
      const card = await screen.findByTestId("share-card");
      expect(within(card).getByText("Draft")).toBeOnTheScreen();
      expect(within(card).getByText("Only your team can see it until you publish.")).toBeOnTheScreen();
      fireEvent.press(within(card).getByRole("button", { name: "Publish settings" }));
      expect(await screen.findByText("Settings page")).toBeOnTheScreen();
      expect(app.getPathname()).toBe("/dashboard/lumen-physio/settings/general");
    });
  });

  it("shows the overview's error with a retry", async () => {
    let down = true;
    api({
      extra: (_m, path) =>
        path === `${B}/overview` && down ? apiError(500, "INTERNAL", "Overview is down") : undefined,
    });
    render();
    expect(await screen.findByText("Overview is down")).toBeOnTheScreen();
    expect(screen.queryByTestId("today-schedule")).toBeNull();
    // The quick actions still work.
    expect(screen.getByTestId("today-new-booking")).toBeOnTheScreen();
    down = false;
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("today-BA-NEXT01")).toBeOnTheScreen();
    expect(screen.queryByText("Overview is down")).toBeNull();
  });

  it("refreshes the overview when pulled down", async () => {
    let today = [next];
    const fetch = api({
      extra: (_m, path) => (path === `${B}/overview` ? { ...overview, today } : undefined),
    });
    render();
    expect(await screen.findByTestId("today-BA-NEXT01")).toBeOnTheScreen();
    today = [next, request];
    const before = calls(fetch).filter((c) => c === `GET ${B}/overview`).length;
    await act(async () => {
      (screen.UNSAFE_getByType(RefreshControl).props as { onRefresh: () => void }).onRefresh();
      await Promise.resolve();
    });
    expect(await screen.findByTestId("today-BA-PEND01")).toBeOnTheScreen();
    expect(calls(fetch).filter((c) => c === `GET ${B}/overview`).length).toBe(before + 1);
  });

  it("puts the schedule beside the other cards on large screens", async () => {
    wide(true);
    api({ pending: [request] });
    render();
    expect(await screen.findByTestId("pending-approvals")).toBeOnTheScreen();
    expect(screen.getByTestId("today-schedule")).toBeOnTheScreen();
    expect(await screen.findByTestId("nudges")).toBeOnTheScreen();
    expect(screen.getByTestId("setup-checklist")).toBeOnTheScreen();
    expect(screen.getByTestId("share-card")).toBeOnTheScreen();
  });

  it("keeps loading quietly while the overview never answers", async () => {
    api({ overview: pending() });
    render();
    expect(await screen.findByLabelText("Today, loading")).toBeOnTheScreen();
    expect(screen.queryByTestId("setup-checklist")).toBeNull();
  });
});
