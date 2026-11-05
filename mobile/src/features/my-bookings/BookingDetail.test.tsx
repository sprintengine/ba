import { fireEvent, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { customerBooking, customerBookingSparse } from "@shared/api/__tests__/fixtures/bookings";
import { renderWithProviders } from "~/test/render";
import { BookingDetail } from "./BookingDetail";

describe("BookingDetail", () => {
  beforeEach(() => {
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  });

  it("shows what, when, with whom, where and the money", () => {
    renderWithProviders(<BookingDetail booking={customerBooking} />);
    expect(screen.getByRole("header", { name: "Initial assessment" })).toBeOnTheScreen();
    expect(screen.getByText("Extended · + Taping")).toBeOnTheScreen();
    expect(screen.getByText("Confirmed")).toBeOnTheScreen();
    expect(screen.getByText("Partly refunded")).toBeOnTheScreen();
    expect(screen.getByText("Reference BA-7K3F9Q")).toBeOnTheScreen();
    expect(screen.getByText(/Tuesday,? 6 October 2026/)).toBeOnTheScreen();
    expect(screen.getByText("13:00–14:00 (1 h) · Europe/Dublin")).toBeOnTheScreen();
    expect(screen.getByText("Alex Morgan")).toBeOnTheScreen();
    expect(screen.getByLabelText("Price: €56")).toBeOnTheScreen();
    expect(screen.getByLabelText("Deposit: €20")).toBeOnTheScreen();
    expect(screen.getByLabelText("Refunded: €5")).toBeOnTheScreen();
    expect(screen.getByText("More than 24 hours' notice: full refund.")).toBeOnTheScreen();
  });

  it("calls, emails and gets directions to the business", () => {
    renderWithProviders(<BookingDetail booking={customerBooking} />);
    fireEvent.press(screen.getByRole("button", { name: /^\+353 1 555 0101/ }));
    expect(Linking.openURL).toHaveBeenLastCalledWith("tel:+35315550101");
    fireEvent.press(screen.getByRole("button", { name: /^hello@lumen-physio\.test/ }));
    expect(Linking.openURL).toHaveBeenLastCalledWith("mailto:hello@lumen-physio.test");
    fireEvent.press(screen.getByRole("button", { name: /Lantern Quay.*Directions/ }));
    expect(Linking.openURL).toHaveBeenLastCalledWith(expect.stringContaining("Lantern%20Quay"));
  });

  it("leaves out what the business didn't give", () => {
    renderWithProviders(<BookingDetail booking={customerBookingSparse} />);
    expect(screen.queryByText(/Directions/)).toBeNull();
    expect(screen.queryByText(/^Call /)).toBeNull();
    expect(screen.queryByLabelText(/^Deposit/)).toBeNull();
  });

  it("says how long a held booking is kept", () => {
    renderWithProviders(
      <BookingDetail booking={{ ...customerBooking, status: "held", paymentStatus: "pending" }} />,
    );
    expect(screen.getByText(/^Held until .*Pay to confirm it\.$/)).toBeOnTheScreen();
    expect(screen.getByText("Awaiting payment")).toBeOnTheScreen();
  });
});
