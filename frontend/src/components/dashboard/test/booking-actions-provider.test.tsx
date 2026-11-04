import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BookingActionsProvider, useBookingActions } from "../booking/booking-actions-provider";
import { booking, mockApi, renderDashboard } from "./render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => vi.unstubAllGlobals());

/** The drawer and sheet are loaded on demand; instrumented (coverage) runs import them slowly. */
const LOAD = { timeout: 10_000 };
// Load them once up front, so a busy machine's first transform doesn't eat into a test's wait.
beforeAll(async () => {
  await Promise.all([import("../booking/booking-drawer"), import("../booking/new-booking-sheet")]);
}, 60_000);

function Buttons() {
  const { openBooking, openNewBooking } = useBookingActions();
  return (
    <>
      <button type="button" onClick={() => openBooking("bk1")}>
        open booking
      </button>
      <button type="button" onClick={() => openNewBooking()}>
        new booking
      </button>
    </>
  );
}

const render = () =>
  renderDashboard(
    <BookingActionsProvider>
      <Buttons />
    </BookingActionsProvider>,
  );

describe("BookingActionsProvider", () => {
  it("loads nothing until something is opened", () => {
    mockApi(() => []);
    render();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the booking drawer on first use", async () => {
    mockApi((method, path) =>
      path.endsWith("/bookings/bk1") ? { ...booking(), payments: [], history: [], checkoutUrl: null } : [],
    );
    render();
    await userEvent.click(screen.getByRole("button", { name: "open booking" }));
    expect(await screen.findByRole("dialog", {}, LOAD)).toBeInTheDocument();
    expect(await screen.findByText("BA-TEST01", {}, LOAD)).toBeInTheDocument();
  });

  it("opens the new-booking sheet on first use", async () => {
    mockApi(() => []);
    render();
    await userEvent.click(screen.getByRole("button", { name: "new booking" }));
    expect(await screen.findByRole("dialog", { name: "New appointment" }, LOAD)).toBeInTheDocument();
  });
});
