import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import { bookingResult, bookingResultSparse, managedBooking } from "@shared/api/__tests__/fixtures/bookings";
import type { CreatePublicBooking, PublicBusiness, PublicService } from "@shared/api/types";
import type { AuthState } from "@shared/auth/types";
import { EMPTY_SELECTION } from "@shared/booking/selection";
import { apiError, mockApi } from "~/test/api-mock";
import { availabilityWith, business, freeService, paidService, tomorrow } from "~/test/customer";
import { runBeforeSignOut } from "~/auth/before-sign-out";
import { authState, renderScreen } from "~/test/render";
import * as layout from "~/ui/layout";
import { BookingFlow } from "./BookingFlow";
import { resetDetailsMemory } from "./details-memory";

const SLUG = business.slug;
const BOOKINGS = `/v1/public/businesses/${SLUG}/bookings`;
const AVAILABILITY = `/v1/public/businesses/${SLUG}/availability`;
const initial = { ...EMPTY_SELECTION, step: null };

type Setup = {
  services?: PublicService[];
  biz?: PublicBusiness;
  book?: (body: CreatePublicBooking) => unknown;
  times?: string[];
  auth?: AuthState;
};

function setup({
  services = [freeService],
  biz = business,
  book,
  times = ["10:00", "11:30"],
  auth,
}: Setup = {}) {
  const posted: { body: CreatePublicBooking; key: string | null }[] = [];
  const api = mockApi((method, path, body) => {
    if (path === AVAILABILITY) return availabilityWith(times);
    if (path === `/v1/public/businesses/${SLUG}/offers`) return [];
    if (path === `/v1/public/businesses/${SLUG}`) return biz;
    if (method === "POST" && path === BOOKINGS) {
      posted.push({ body: body as CreatePublicBooking, key: null });
      return book ? book(body as CreatePublicBooking) : bookingResultSparse;
    }
    if (path === `/v1/public/manage/${bookingResult.manageToken}`)
      return { ...managedBooking, status: "confirmed" };
    return undefined;
  });
  renderScreen(<BookingFlow business={biz} services={services} initial={initial} />, { auth });
  return { api, posted };
}

function idempotencyKeys(api: jest.Mock) {
  return api.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
    .map(([, init]) => ((init as RequestInit).headers as Record<string, string>)["Idempotency-Key"]);
}

async function chooseTimeAndDetails(time = "10:00") {
  fireEvent.press(await screen.findByTestId(`slot-${time}`));
  expect(await screen.findByTestId("details-step")).toBeOnTheScreen();
}

describe("BookingFlow", () => {
  beforeEach(() => {
    resetDetailsMemory();
    jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: false, width: 390, height: 844 });
  });

  it("books a free service: service → time → details (prefilled) → review → booked", async () => {
    const { api, posted } = setup();
    expect(screen.getByText("Choose a service")).toBeOnTheScreen();
    expect(screen.getByText("Step 1 of 4")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId(`service-${freeService.id}`));

    expect(await screen.findByText("Pick a time")).toBeOnTheScreen();
    await chooseTimeAndDetails("11:30");
    // Prefilled from the account.
    expect(screen.getByTestId("details-name").props.value).toBe("Demo Customer");
    expect(screen.getByTestId("details-email").props.value).toBe("customer@bookanything.test");

    // The required question stops the review.
    fireEvent.press(screen.getByTestId("details-review"));
    expect(await screen.findByText("Choose an option")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: /^Which knee\?/ }));
    fireEvent.press(await screen.findByRole("button", { name: "Left" }));
    fireEvent.press(screen.getByTestId("details-review"));

    expect(await screen.findByTestId("review-step")).toBeOnTheScreen();
    expect(screen.getByText("Review and confirm")).toBeOnTheScreen();
    expect(screen.getByText("Free cancellation up to 24 hours before.")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("booking-submit"));

    expect(await screen.findByTestId("manage-hero-confirmed")).toBeOnTheScreen();
    expect(screen.getByText("You're booked")).toBeOnTheScreen();
    expect(posted).toHaveLength(1);
    const body = posted[0]!.body;
    expect(body.serviceId).toBe(freeService.id);
    expect(body.customer).toEqual({
      name: "Demo Customer",
      email: "customer@bookanything.test",
      phone: null,
    });
    expect(body.answers).toEqual({ [freeService.questions[0]!.id]: "Left" });
    expect(body.start).toContain(`${tomorrow()}T11:30:00`);
    expect(body.expectedTotalCents).toBe(0);
    expect(idempotencyKeys(api)[0]).toEqual(expect.any(String));
  });

  it("goes back a step, and keeps the choices", async () => {
    setup();
    fireEvent.press(screen.getByTestId(`service-${freeService.id}`));
    await chooseTimeAndDetails();
    fireEvent.press(screen.getByTestId("step-back"));
    expect(await screen.findByText("Pick a time")).toBeOnTheScreen();
    expect(await screen.findByTestId("slot-10:00")).toBeSelected();
  });

  it("when the time was just taken, goes back to the times and says so; retrying uses a new key", async () => {
    let taken = true;
    const { api } = setup({
      book: () =>
        taken ? apiError(409, "SLOT_UNAVAILABLE", "That time is no longer available.") : bookingResultSparse,
    });
    fireEvent.press(screen.getByTestId(`service-${freeService.id}`));
    await chooseTimeAndDetails();
    fireEvent.press(screen.getByRole("button", { name: /^Which knee\?/ }));
    fireEvent.press(await screen.findByRole("button", { name: "Right" }));
    fireEvent.press(screen.getByTestId("details-review"));
    fireEvent.press(await screen.findByTestId("booking-submit"));

    expect(await screen.findByTestId("time-conflict")).toHaveTextContent(
      "Someone just booked that time. We've refreshed the times so you can pick another.",
    );
    taken = false;
    fireEvent.press(await screen.findByTestId("slot-11:30"));
    fireEvent.press(await screen.findByTestId("details-review"));
    fireEvent.press(await screen.findByTestId("booking-submit"));
    expect(await screen.findByTestId("manage-hero-confirmed")).toBeOnTheScreen();
    const [first, second] = idempotencyKeys(api);
    expect(first).not.toEqual(second);
  });

  it("shows why booking failed on the review step (plan limit), with how to reach the business", async () => {
    setup({ book: () => apiError(409, "PLAN_LIMIT_REACHED", "Limit reached.") });
    fireEvent.press(screen.getByTestId(`service-${freeService.id}`));
    await chooseTimeAndDetails();
    fireEvent.press(screen.getByRole("button", { name: /^Which knee\?/ }));
    fireEvent.press(await screen.findByRole("button", { name: "Left" }));
    fireEvent.press(screen.getByTestId("details-review"));
    fireEvent.press(await screen.findByTestId("booking-submit"));
    expect(await screen.findByTestId("booking-alert")).toHaveTextContent(
      /can't take more online appointments right now.*\+353 1 555 0101 or hello@lumen-physio\.test/,
    );
  });

  it("paid: option, extras and therapist, the deposit, then Stripe Checkout in the browser", async () => {
    const openBrowser = jest
      .mocked(WebBrowser.openBrowserAsync)
      .mockResolvedValue({ type: "dismiss" } as never);
    const { posted } = setup({ services: [paidService], book: () => bookingResult });
    fireEvent.press(screen.getByTestId(`service-${paidService.id}`));

    // Extras: the single option is chosen already; add the add-on.
    expect(await screen.findByText("Choose an option")).toBeOnTheScreen();
    expect(screen.getByTestId(`option-${paidService.options[0]!.id}`)).toBeChecked();
    fireEvent.press(screen.getByTestId(`addon-${paidService.addons[0]!.id}`));
    expect(screen.getByTestId(`addon-${paidService.addons[0]!.id}`)).toBeChecked();
    fireEvent.press(screen.getByTestId("step-continue"));

    // Therapist.
    expect(await screen.findByText("Choose your therapist")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("resource-any"));

    await chooseTimeAndDetails();
    fireEvent.press(screen.getByTestId("details-review"));
    expect(await screen.findByTestId("review-step")).toBeOnTheScreen();
    // €95 option + €10 add-on; €20 deposit now; pay at the venue is offered.
    expect(screen.getByLabelText("Total: €105")).toBeOnTheScreen();
    expect(screen.getByLabelText("Deposit due now: €20")).toBeOnTheScreen();
    expect(screen.getByTestId("pay-at-venue")).toBeOnTheScreen();
    const submit = screen.getByTestId("booking-submit");
    expect(submit).toHaveAccessibleName("Continue to payment · €20");
    fireEvent.press(submit);

    await waitFor(() =>
      expect(openBrowser).toHaveBeenCalledWith(bookingResult.next.checkoutUrl, expect.anything()),
    );
    expect(posted[0]!.body).toMatchObject({
      optionId: paidService.options[0]!.id,
      addonIds: [paidService.addons[0]!.id],
    });
    expect(posted[0]!.body.payment).toBeUndefined();
    // Back from Checkout without an outcome: the booking is read again.
    expect(await screen.findByTestId("manage-card")).toBeOnTheScreen();
  });

  it("pays at the venue when the customer chooses to", async () => {
    const { posted } = setup({ services: [paidService], book: () => bookingResultSparse });
    fireEvent.press(screen.getByTestId(`service-${paidService.id}`));
    fireEvent.press(await screen.findByTestId("step-continue"));
    fireEvent.press(
      await screen.findByTestId(`resource-${paidService.selectableRequirement!.resources[1]!.id}`),
    );
    await chooseTimeAndDetails();
    fireEvent.press(screen.getByTestId("details-review"));
    fireEvent.press(await screen.findByTestId("pay-at-venue"));
    expect(screen.getByTestId("booking-submit")).toHaveAccessibleName("Confirm appointment · €95 at venue");
    fireEvent.press(screen.getByTestId("booking-submit"));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.body).toMatchObject({
      payment: "at_venue",
      resourceId: paidService.selectableRequirement!.resources[1]!.id,
    });
  });

  it("offers one time at a time for a business that shows only its next available time", async () => {
    setup({ biz: { ...business, policies: { ...business.policies, nextAvailableOnly: true } } });
    fireEvent.press(screen.getByTestId(`service-${freeService.id}`));
    expect(await screen.findByTestId("next-slot")).toBeOnTheScreen();
    expect(screen.getByText("NEXT AVAILABLE")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("next-slot-choose"));
    expect(await screen.findByTestId("details-step")).toBeOnTheScreen();
  });

  it("asks which group first when the business has customer groups, and says when nothing is bookable", async () => {
    const group = { id: "00000000-0000-4000-8000-000000000140", name: "Members", description: null };
    setup({ biz: { ...business, customerGroups: [group] }, services: [] });
    expect(screen.getByText("Which best describes you?")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId(`group-${group.id}`));
    expect(await screen.findByText("Nothing to book online just yet")).toBeOnTheScreen();
  });

  it("says when there are no times at all", async () => {
    setup({ times: [] });
    fireEvent.press(screen.getByTestId(`service-${freeService.id}`));
    expect(await screen.findByTestId("no-times")).toBeOnTheScreen();
  });

  it("on large screens shows the summary beside the steps", async () => {
    jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: true, width: 1180, height: 820 });
    setup();
    expect(screen.getByTestId("booking-summary")).toHaveTextContent(/Choose a service to get started\./);
    fireEvent.press(screen.getByTestId(`service-${freeService.id}`));
    await act(async () => undefined);
    expect(screen.getByTestId("booking-summary")).toHaveTextContent(/Free consultation/);
  });

  it("remembers typed details for the business until sign-out; the next person starts from their account", async () => {
    setup();
    fireEvent.press(screen.getByTestId(`service-${freeService.id}`));
    await chooseTimeAndDetails();
    fireEvent.changeText(screen.getByTestId("details-name"), "Alex Morgan");
    screen.unmount();

    // Back to the same business: what they typed.
    setup();
    fireEvent.press(screen.getByTestId(`service-${freeService.id}`));
    await chooseTimeAndDetails();
    expect(screen.getByTestId("details-name").props.value).toBe("Alex Morgan");
    screen.unmount();

    await runBeforeSignOut();
    setup({
      auth: authState({
        user: { id: "dev_sam", email: "sam@example.test", name: "Sam Lee", imageUrl: null },
      }),
    });
    fireEvent.press(screen.getByTestId(`service-${freeService.id}`));
    await chooseTimeAndDetails();
    expect(screen.getByTestId("details-name").props.value).toBe("Sam Lee");
    expect(screen.getByTestId("details-email").props.value).toBe("sam@example.test");
  });
});
