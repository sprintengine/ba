import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { customerBooking } from "@shared/api/__tests__/fixtures/bookings";
import type { MyBookings } from "@shared/api/types";
import { apiError, calls, mockApi, pending } from "~/test/api-mock";
import { renderScreen } from "~/test/render";
import { MyBookingsList } from "./MyBookingsList";

const upcoming = {
  ...customerBooking,
  id: "b1",
  reference: "BA-UP0001",
  start: "2026-10-07T09:00:00+01:00",
  end: "2026-10-07T10:00:00+01:00",
};
const past = {
  ...customerBooking,
  id: "p1",
  reference: "BA-PAST01",
  status: "completed" as const,
  service: { id: "s2", name: "Follow-up" },
  start: "2026-09-01T09:00:00+01:00",
  end: "2026-09-01T09:30:00+01:00",
};
const data: MyBookings = { upcoming: [upcoming], past: [past] };

function setup(response: () => unknown = () => data) {
  const api = mockApi((method, path) =>
    method === "GET" && path === "/v1/me/bookings" ? response() : undefined,
  );
  const onOpen = jest.fn();
  renderScreen(<MyBookingsList onOpen={onOpen} />);
  return { api, onOpen };
}

describe("MyBookingsList", () => {
  it("shows a loading state, then the upcoming bookings with counts", async () => {
    let resolve: (value: Response) => void = () => undefined;
    mockApi(() => new Promise<Response>((r) => (resolve = r)));
    renderScreen(<MyBookingsList onOpen={jest.fn()} />);
    expect(screen.getByLabelText("Loading bookings")).toBeOnTheScreen();
    await act(async () => resolve(new Response(JSON.stringify(data), { status: 200 })));
    expect(await screen.findByTestId("booking-BA-UP0001")).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Upcoming 1" })).toBeSelected();
    expect(screen.getByRole("tab", { name: "Past 1" })).toBeOnTheScreen();
    expect(screen.queryByTestId("booking-BA-PAST01")).toBeNull();
  });

  it("describes each booking for screen readers and opens it", async () => {
    const { onOpen } = setup();
    const card = await screen.findByTestId("booking-BA-UP0001");
    expect(card.props.accessibilityLabel).toMatch(
      /^Initial assessment, Extended with Lumen Physiotherapy\. Wednesday,? 7 October, 09:00 – 10:00\. Confirmed\. Partly refunded$/,
    );
    fireEvent.press(card);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "b1" }));
  });

  it("switches to past bookings", async () => {
    setup();
    fireEvent.press(await screen.findByRole("tab", { name: "Past 1" }));
    expect(await screen.findByTestId("booking-BA-PAST01")).toBeOnTheScreen();
    expect(screen.queryByTestId("booking-BA-UP0001")).toBeNull();
  });

  it("says when there is nothing coming up, with a way to book", async () => {
    setup(() => ({ upcoming: [], past: [] }));
    expect(await screen.findByText("Nothing coming up")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Find somewhere to book" })).toBeOnTheScreen();
  });

  it("shows the API's error with a retry that refetches", async () => {
    let fail = true;
    const { api } = setup(() =>
      fail ? apiError(500, "INTERNAL_SERVER_ERROR", "The bookings service broke.") : data,
    );
    expect(await screen.findByText("The bookings service broke.")).toBeOnTheScreen();
    fail = false;
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("booking-BA-UP0001")).toBeOnTheScreen();
    expect(calls(api).filter((c) => c === "GET /v1/me/bookings")).toHaveLength(2);
  });

  it("says when bookanything can't be reached", async () => {
    mockApi(() => Promise.reject(new TypeError("Network request failed")));
    renderScreen(<MyBookingsList onOpen={jest.fn()} />);
    expect(await screen.findByText("Can't reach bookanything")).toBeOnTheScreen();
  });

  it("refetches on pull to refresh", async () => {
    const { api } = setup();
    const list = await screen.findByTestId("my-bookings-list");
    await screen.findByTestId("booking-BA-UP0001");
    // The RefreshControl the list renders (what a pull triggers).
    await act(async () => {
      list.props.refreshControl.props.onRefresh();
    });
    await waitFor(() =>
      expect(calls(api).filter((c) => c === "GET /v1/me/bookings")).toEqual([
        "GET /v1/me/bookings",
        "GET /v1/me/bookings",
      ]),
    );
  });

  it("keeps loading while the request is pending", () => {
    mockApi(pending);
    renderScreen(<MyBookingsList onOpen={jest.fn()} />);
    expect(screen.getByLabelText("Loading bookings")).toBeOnTheScreen();
  });
});
