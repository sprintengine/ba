import { fireEvent, screen } from "@testing-library/react-native";
import { testRouter } from "expo-router/testing-library";
import { customerBooking } from "@shared/api/__tests__/fixtures/bookings";
import type { MyBookings } from "@shared/api/types";
import { mockApi } from "~/test/api-mock";
import { renderScreen } from "~/test/render";
import * as layout from "~/ui/layout";
import { MyBookingScreen } from "./MyBookingScreen";
import { MyBookingsScreen } from "./MyBookingsScreen";

const first = {
  ...customerBooking,
  id: "b1",
  reference: "BA-FIRST1",
  start: "2026-10-07T09:00:00+01:00",
  end: "2026-10-07T10:00:00+01:00",
};
const second = {
  ...customerBooking,
  id: "b2",
  reference: "BA-SECND2",
  service: { id: "s2", name: "Follow-up" },
  start: "2026-10-08T09:00:00+01:00",
  end: "2026-10-08T09:30:00+01:00",
};
const data: MyBookings = { upcoming: [second, first], past: [] };

function wide(isWide: boolean) {
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide, width: isWide ? 1024 : 390, height: 800 });
}

describe("My bookings screens", () => {
  beforeEach(() => {
    mockApi((method, path) => (path === "/v1/me/bookings" ? data : undefined));
  });

  it("on phones, opens a booking on its own screen", async () => {
    wide(false);
    const app = renderScreen(<MyBookingsScreen />, {
      routes: { "my/bookings/[id]": () => <MyBookingScreen /> },
    });
    fireEvent.press(await screen.findByTestId("booking-BA-SECND2"));
    expect(await screen.findByRole("header", { name: "Follow-up" })).toBeOnTheScreen();
    expect(app.getPathname()).toBe("/my/bookings/b2");
  });

  it("on large screens, shows the list and the soonest booking side by side, and switches on tap", async () => {
    wide(true);
    renderScreen(<MyBookingsScreen />);
    expect(await screen.findByRole("header", { name: "Initial assessment" })).toBeOnTheScreen();
    expect(screen.getByTestId("booking-BA-FIRST1")).toBeSelected();
    fireEvent.press(screen.getByTestId("booking-BA-SECND2"));
    expect(await screen.findByRole("header", { name: "Follow-up" })).toBeOnTheScreen();
    expect(screen.getByTestId("booking-BA-SECND2")).toBeSelected();
  });

  it("says when a linked booking isn't one of mine", async () => {
    wide(false);
    renderScreen(<MyBookingsScreen />, { routes: { "my/bookings/[id]": () => <MyBookingScreen /> } });
    await screen.findByTestId("booking-BA-FIRST1");
    testRouter.push("/my/bookings/nope");
    expect(await screen.findByText("We couldn't find that booking")).toBeOnTheScreen();
  });
});
