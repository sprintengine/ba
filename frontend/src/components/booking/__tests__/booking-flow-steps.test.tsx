/**
 * The public booking flow step by step: groups, services, options and extras, resources, prices (deposits,
 * deals, pay at venue), submitting (payment redirect, approval requests, errors) and accessibility per step.
 * The basic walk, retries and the time step's windows are in booking-flow.test.tsx.
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicBusiness, PublicService } from "@/lib/api/types";
import { assessment, business, consult, massage } from "@/lib/booking/__tests__/fixtures";
import { formatDate } from "@/lib/format";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { BookingFlow } from "../booking-flow";
import {
  apiError,
  availabilityFor,
  pinNow,
  renderWithProviders,
  slotAt,
  stubApi,
  type ApiRequest,
} from "./booking-test-utils";
import { router, trackHistory, untrackHistory, urlParams } from "./navigation-mock";

vi.mock("next/navigation", async () =>
  (await import("./navigation-mock")).locationNavigation("/lumen-physio"),
);
const auth = vi.hoisted(() => ({ user: null as { name: string | null; email: string } | null }));
vi.mock("@/lib/auth/context", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: auth.user !== null,
    user: auth.user,
    getToken: async () => null,
    signOut: async () => {},
    mode: "dev",
  }),
}));

const DEAL = {
  id: "of1",
  name: "Quiet mornings",
  label: "20% off",
  originalPriceCents: 8000,
  priceCents: 6400,
};
const DEAL_DAY = "2026-10-06";

/** Every day has times at 10:00 and 14:00; on DEAL_DAY the 10:00 slot carries DEAL. */
function api({ booking }: { booking?: (req: ApiRequest) => unknown } = {}) {
  return stubApi((req) => {
    if (req.path.endsWith("/availability"))
      return availabilityFor(req.query, (d) => [
        slotAt(d, "10:00", { offer: d === DEAL_DAY ? DEAL : null }),
        slotAt(d, "14:00"),
      ]);
    if (req.method === "POST" && req.path.endsWith("/bookings")) return booking?.(req);
    return undefined;
  });
}

const confirmed = (type: "confirmed" | "pending_approval" = "confirmed") => ({
  booking: { id: "bk1", reference: "BA-7K3F9Q" },
  manageToken: "tok123",
  next: { type, checkoutUrl: null },
});

function renderFlow(
  services: PublicService[] = [assessment, massage, consult],
  b: PublicBusiness = business,
) {
  return renderWithProviders(<BookingFlow business={b} services={services} />, { vocabulary: b.vocabulary });
}

const user = () => userEvent.setup();
/** The flow's primary action: the desktop copy (the mobile bar repeats it). */
const action = (name: RegExp | string) =>
  must(screen.getAllByRole("button", { name })[0], `${String(name)} button`);
const summary = () => screen.getByRole("complementary", { name: "Your appointment" });
/** The review step's "What" section. */
const whatSection = () => must(screen.getByRole("heading", { name: "What" }).closest("section"), "What");

/** Picks `date` on the month calendar (it auto-selects the first day with times), then `time`. */
async function pickTime(u: ReturnType<typeof userEvent.setup>, date: string, time = "10:00") {
  const calendar = must((await screen.findAllByRole("grid", { name: "Choose a date" }))[0], "calendar");
  const day = within(calendar).getByRole("button", { name: formatDate(date, "UTC", "full") });
  await waitFor(() => expect(day).toBeEnabled());
  if (day.getAttribute("aria-pressed") !== "true") await u.click(day);
  const times = await screen.findByRole("group", { name: "Available times" });
  // A discounted time's name starts with its deal label ("20% off10:00…").
  await u.click(within(times).getByRole("button", { name: new RegExp(time) }));
  await screen.findByRole("heading", { name: "Your details" });
}

async function fillDetails(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByRole("textbox", { name: /Full name/ }), "Alex Morgan");
  await u.type(screen.getByRole("textbox", { name: /^Email/ }), "alex.morgan@example.com");
}

beforeEach(() => {
  pinNow();
  trackHistory("/lumen-physio");
  auth.user = null;
});
afterEach(() => {
  vi.useRealTimers();
  untrackHistory();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("choosing what to book", () => {
  it("asks who is booking first when the business has customer groups, by keyboard", async () => {
    const u = user();
    api();
    const withGroups = {
      ...business,
      customerGroups: [
        { id: "g1", name: "New clients", description: "First visit" },
        { id: "g2", name: "Members", description: null },
      ],
    };
    const membersOnly = { ...consult, allowedGroupIds: ["g2"] };
    const { container } = renderFlow([assessment, membersOnly], withGroups);

    expect(screen.getByRole("heading", { name: "Which best describes you?" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Booking progress" })).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    await expectNoAxeViolations(container);

    const groups = screen.getByRole("radiogroup", { name: "Who is booking" });
    await u.click(within(groups).getByRole("radio", { name: /New clients/ }));
    expect(await screen.findByRole("heading", { name: "Choose a service" })).toBeInTheDocument();
    expect(urlParams().get("group")).toBe("g1");
    // Members-only services are hidden from new clients.
    expect(screen.queryByRole("button", { name: /Phone consult/ })).not.toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: /Back/ }));
    const radios = within(await screen.findByRole("radiogroup", { name: "Who is booking" }));
    radios.getByRole("radio", { name: /New clients/ }).focus();
    // Arrows move between the choices; Space picks one.
    await u.keyboard("{ArrowDown}");
    await waitFor(() => expect(radios.getByRole("radio", { name: /Members/ })).toHaveFocus());
    await u.keyboard(" ");
    expect(await screen.findByRole("heading", { name: "Choose a service" })).toBeInTheDocument();
    expect(urlParams().get("group")).toBe("g2");
    expect(screen.getByRole("button", { name: /Phone consult/ })).toBeInTheDocument();
  });

  it("lists services by category with their price and how they are paid", async () => {
    api();
    const approval = {
      ...consult,
      id: "s4",
      name: "Home visit",
      requiresApproval: true,
      priceCents: 9000,
      paymentMode: "full" as const,
      locationType: "customer" as const,
    };
    const either = { ...massage, id: "s5", name: "Deep tissue massage", allowPayAtVenue: true };
    const { container } = renderFlow([assessment, massage, consult, approval, either]);
    // Services take different numbers of steps: how many isn't said until one is chosen.
    expect(screen.getByText(/^Step 1/)).toHaveTextContent(/^Step 1$/);
    expect(screen.getByRole("heading", { name: "Physiotherapy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Massage" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Other" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Initial assessment/ })).toHaveTextContent(/€70.*Pay at venue/);
    expect(screen.getByRole("button", { name: /Sports massage/ })).toHaveTextContent(
      /from€40.*2 options.*€15 deposit/,
    );
    // A deposit, or nothing online: both are said.
    expect(screen.getByRole("button", { name: /Deep tissue massage/ })).toHaveTextContent(
      /€15 deposit or pay at venue/,
    );
    expect(screen.getByRole("button", { name: /Phone consult/ })).toHaveTextContent("Free");
    expect(screen.getByRole("button", { name: /Home visit/ })).toHaveTextContent(
      /At your address.*Request to book/,
    );
    // Before anything is chosen, the summary sells the basics.
    expect(screen.getByText(/Secure payments/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("says when there is nothing to book online", () => {
    api();
    renderFlow([]);
    expect(screen.getByText("Nothing to book online just yet")).toBeInTheDocument();
  });

  it("prices an option and extras in the summary, with the deposit due now", async () => {
    const u = user();
    api();
    const { container } = renderFlow();
    await u.click(screen.getByRole("button", { name: /Sports massage/ }));
    expect(await screen.findByRole("heading", { name: "Sports massage" })).toBeInTheDocument();
    expect(screen.getByText("Choose an option and any extras.")).toBeInTheDocument();
    expect(action(/^Continue/)).toBeDisabled();

    // Options are a radio group: arrow keys choose.
    const options = screen.getByRole("radiogroup", { name: "Option" });
    within(options)
      .getByRole("radio", { name: /30 minutes/ })
      .focus();
    await u.keyboard("{ArrowDown}");
    const sixty = within(options).getByRole("radio", { name: /60 minutes/ });
    await waitFor(() => expect(sixty).toHaveFocus());
    await u.keyboard(" ");
    expect(sixty).toBeChecked();
    expect(urlParams().get("option")).toBe("o2");

    // Extras are checkboxes: Space toggles.
    const cupping = within(screen.getByRole("group", { name: "Extras" })).getByRole("checkbox", {
      name: /Cupping/,
    });
    expect(cupping).toHaveTextContent("+€10");
    cupping.focus();
    await u.keyboard(" ");
    expect(cupping).toHaveAttribute("aria-checked", "true");
    expect(urlParams().get("addons")).toBe("a1");

    const card = within(summary());
    expect(card.getByText("Sports massage · 60 minutes")).toBeInTheDocument();
    expect(card.getByText("+ Cupping")).toBeInTheDocument();
    expect(card.getByText("Total").closest("div")).toHaveTextContent("Total · 1 h 10 min€80");
    expect(card.getByText("Due now").closest("div")).toHaveTextContent("€15");
    expect(card.getByText("€15 deposit online now, €65 at your appointment.")).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await u.keyboard(" ");
    expect(cupping).toHaveAttribute("aria-checked", "false");
    expect(card.getByText("Total").closest("div")).toHaveTextContent("€70");
    await u.click(action(/^Continue/));
    expect(await screen.findByRole("heading", { name: "Pick a time" })).toBeInTheDocument();
    expect(screen.getByText("Sports massage · 1 h")).toBeInTheDocument();
    await screen.findByRole("group", { name: "Available times" });
    await expectNoAxeViolations(container);
  });

  it("chooses a therapist (or any) and loads only their times", async () => {
    const u = user();
    const requests = api();
    const { container } = renderFlow();
    await u.click(screen.getByRole("button", { name: /Initial assessment/ }));
    expect(await screen.findByRole("heading", { name: "Choose your therapist" })).toBeInTheDocument();
    const people = screen.getByRole("radiogroup", { name: "Therapist" });
    expect(within(people).getByRole("radio", { name: /Any therapist/ })).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await u.click(within(people).getByRole("radio", { name: /Alex Morgan/ }));
    expect(await screen.findByRole("heading", { name: "Pick a time" })).toBeInTheDocument();
    expect(urlParams().get("with")).toBe("r1");
    await waitFor(() => expect(requests.some((r) => r.path.endsWith("/availability"))).toBe(true));
    const query = must(
      requests.find((r) => r.path.endsWith("/availability")),
      "availability request",
    ).query;
    expect(query.get("serviceId")).toBe("s1");
    expect(query.get("resourceId")).toBe("r1");
    expect(within(summary()).getByText("Alex Morgan")).toBeInTheDocument();
  });

  it("edits an earlier choice from the summary", async () => {
    const u = user();
    api();
    renderFlow();
    await u.click(screen.getByRole("button", { name: /Initial assessment/ }));
    await screen.findByRole("heading", { name: "Choose your therapist" });
    await u.click(within(summary()).getByRole("button", { name: /Initial assessment/ }));
    expect(await screen.findByRole("heading", { name: "Choose a service" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Initial assessment/, pressed: true })).toBeInTheDocument();
  });
});

describe("paying and confirming", () => {
  it("applies the time's deal to the total while the deposit stays due now, then goes to payment", async () => {
    const u = user();
    const assign = vi.fn();
    const requests = api({
      booking: () => ({
        ...confirmed(),
        next: { type: "payment_required", checkoutUrl: "https://pay.example/cs_1" },
      }),
    });
    renderFlow();
    await u.click(screen.getByRole("button", { name: /Sports massage/ }));
    await u.click(await screen.findByRole("radio", { name: /60 minutes/ }));
    await u.click(screen.getByRole("checkbox", { name: /Cupping/ }));
    await u.click(action(/^Continue/));
    await screen.findByRole("heading", { name: "Pick a time" });
    await pickTime(u, DEAL_DAY);
    await fillDetails(u);
    await u.click(action(/^Review/));
    const { container } = { container: document.body };
    expect(await screen.findByRole("heading", { name: "Review and confirm" })).toBeInTheDocument();

    const payment = within(
      must(screen.getByRole("heading", { name: "Payment" }).closest("section"), "payment"),
    );
    expect(payment.getByText("was €80, now €64")).toBeInTheDocument();
    expect(payment.getByText("Quiet mornings")).toBeInTheDocument();
    expect(payment.getByText("Deposit due now").nextElementSibling).toHaveTextContent("€15");
    expect(payment.getByText("At your appointment").nextElementSibling).toHaveTextContent("€49");
    expect(payment.getByText(/Cancel up to 24 hours before for a full refund/)).toBeInTheDocument();
    await expectNoAxeViolations(container);

    vi.stubGlobal("location", { ...window.location, assign });
    const replaceState = vi.spyOn(window.history, "replaceState");
    await u.click(action("Continue to payment · €15"));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://pay.example/cs_1"));
    expect(screen.getByText("Taking you to secure payment…").closest("[role=status]")).toHaveTextContent(
      "Your time is held while you pay.",
    );
    const post = must(
      requests.find((r) => r.method === "POST"),
      "booking POST",
    );
    expect(post.body).toMatchObject({ serviceId: "s2", optionId: "o2", addonIds: ["a1"] });
    expect(router.push).not.toHaveBeenCalled();
    // Back from the payment page goes to the booking's manage page (its time is held there), not to this step.
    const left = replaceState.mock.calls.findIndex(([, , url]) => url === "/manage/tok123?payment=cancelled");
    expect(left).toBeGreaterThanOrEqual(0);
    expect(must(replaceState.mock.invocationCallOrder[left], "order")).toBeLessThan(
      must(assign.mock.invocationCallOrder[0], "assign order"),
    );
    // A page restored as it was left (the back/forward cache) drops the overlay and shows that page.
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    await waitFor(() => expect(screen.queryByText("Taking you to secure payment…")).not.toBeInTheDocument());
    expect(router.replace).toHaveBeenCalledWith("/manage/tok123?payment=cancelled");
  });

  it("confirms a pay-at-venue booking with its answers and goes to the manage page", async () => {
    const u = user();
    const requests = api({ booking: () => confirmed() });
    renderFlow();
    await u.click(screen.getByRole("button", { name: /Initial assessment/ }));
    await u.click(await screen.findByRole("radio", { name: /Any therapist/ }));
    await screen.findByRole("heading", { name: "Pick a time" });
    await pickTime(u, "2026-10-01", "14:00");
    await expectNoAxeViolations(document.body);
    await fillDetails(u);
    await u.type(screen.getByRole("textbox", { name: /What would you like help with/ }), "Sore knee");
    await u.click(action(/^Review/));
    await screen.findByRole("heading", { name: "Review and confirm" });

    const payment = within(
      must(screen.getByRole("heading", { name: "Payment" }).closest("section"), "payment"),
    );
    expect(payment.getByText("Nothing to pay now — pay at your appointment.")).toBeInTheDocument();
    expect(payment.getByText("Free cancellation up to 24 hours before.")).toBeInTheDocument();
    // No preference reads as it is ("Any therapist"), not "With Any therapist".
    expect(within(whatSection()).getByText("Any therapist")).toBeInTheDocument();
    const answer = screen.getByText("Sore knee");
    expect(answer.previousElementSibling).toHaveTextContent(/^What would you like help with\? Private$/);
    // Each section's "Change" says what it changes.
    expect(screen.getByRole("button", { name: "Change when" })).toHaveTextContent(/^Change$/);
    await u.click(screen.getByRole("button", { name: "Change your details" }));
    expect(await screen.findByRole("heading", { name: "Your details" })).toBeInTheDocument();
    await u.click(action(/^Review/));
    await screen.findByRole("heading", { name: "Review and confirm" });

    await u.click(action("Confirm appointment"));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/manage/tok123?booked=1"));
    const post = must(
      requests.find((r) => r.method === "POST"),
      "booking POST",
    );
    expect(post.body).toMatchObject({
      serviceId: "s1",
      resourceId: null,
      answers: { q1: "Sore knee" },
      customer: { name: "Alex Morgan", email: "alex.morgan@example.com", phone: null },
    });
    expect(post.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("sends a request for services that need approval", async () => {
    const u = user();
    api({ booking: () => confirmed("pending_approval") });
    renderFlow([{ ...consult, requiresApproval: true }]);
    await u.click(screen.getByRole("button", { name: /Phone consult/ }));
    await pickTime(u, "2026-10-01");
    await fillDetails(u);
    await u.click(action(/^Review/));
    expect(await screen.findByRole("heading", { name: "Review your request" })).toBeInTheDocument();
    expect(screen.getByText(/Lumen Physiotherapy reviews each request/)).toBeInTheDocument();
    await u.click(action("Send request"));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/manage/tok123?booked=1"));
  });

  it("prefills the details of a signed-in customer", async () => {
    const u = user();
    auth.user = { name: "Rowan Example", email: "rowan@example.test" };
    api();
    renderFlow([consult]);
    await u.click(screen.getByRole("button", { name: /Phone consult/ }));
    await pickTime(u, "2026-10-01");
    expect(screen.getByRole("textbox", { name: /Full name/ })).toHaveValue("Rowan Example");
    expect(screen.getByRole("textbox", { name: /^Email/ })).toHaveValue("rowan@example.test");
    expect(screen.queryByText(/Have an account/)).not.toBeInTheDocument();
  });
});

describe("when booking fails", () => {
  async function reachReview(u: ReturnType<typeof userEvent.setup>) {
    renderFlow([assessment]);
    await u.click(screen.getByRole("button", { name: /Initial assessment/ }));
    await u.click(await screen.findByRole("radio", { name: /Alex Morgan/ }));
    await screen.findByRole("heading", { name: "Pick a time" });
    await pickTime(u, "2026-10-01");
    await fillDetails(u);
    await u.type(screen.getByRole("textbox", { name: /What would you like help with/ }), "Sore knee");
    await u.click(action(/^Review/));
    await screen.findByRole("heading", { name: "Review and confirm" });
    expect(within(whatSection()).getByText("With Alex Morgan")).toBeInTheDocument();
  }

  it("puts the server's field errors back under the customer's details, marked invalid", async () => {
    const u = user();
    api({
      booking: () =>
        apiError(400, "INVALID_REQUEST", "Invalid request.", {
          "customer.email": "This email address can't receive mail",
          "answers.q1": "Tell us a little more",
        }),
    });
    await reachReview(u);
    await u.click(action("Confirm appointment"));

    expect(await screen.findByRole("heading", { name: "Your details" })).toBeInTheDocument();
    const email = screen.getByRole("textbox", { name: /^Email/ });
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    const errorId = must(email.getAttribute("aria-describedby"), "describedby")
      .split(" ")
      .find((id) => id.endsWith("-error"));
    expect(document.getElementById(must(errorId, "error id"))).toHaveTextContent(
      "This email address can't receive mail",
    );
    expect(screen.getByRole("textbox", { name: /What would you like help with/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Tell us a little more")).toBeInTheDocument();
    // The review step is out of reach until the details are fixed.
    expect(urlParams().get("step")).toBe("details");
  });

  it("explains a field error from an earlier step on the review step", async () => {
    const u = user();
    api({
      booking: () =>
        apiError(400, "INVALID_REQUEST", "Invalid request.", {
          resourceId: "Alex isn't available for this service",
        }),
    });
    await reachReview(u);
    await u.click(action("Confirm appointment"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something in your selection needs another look");
    expect(alert).toHaveTextContent("Alex isn't available for this service");
  });

  it("points to the business when it can't take more bookings", async () => {
    const u = user();
    api({ booking: () => apiError(409, "PLAN_LIMIT_REACHED", "Plan limit reached.") });
    await reachReview(u);
    await u.click(action("Confirm appointment"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Lumen Physiotherapy can't take more online appointments right now");
    expect(alert).toHaveTextContent(
      "Please get in touch directly: +353 1 555 0101 or hello@lumen-physio.test.",
    );
    await expectNoAxeViolations(document.body);
  });
});

describe("details kept for this session", () => {
  it("never stores a sensitive answer, even after switching to a service that doesn't ask it", async () => {
    const u = user();
    api();
    renderFlow();
    await u.click(screen.getByRole("button", { name: /Initial assessment/ }));
    await u.click(await screen.findByRole("radio", { name: /Alex Morgan/ }));
    await screen.findByRole("heading", { name: "Pick a time" });
    await pickTime(u, "2026-10-01");
    await fillDetails(u);
    await u.type(screen.getByRole("textbox", { name: /What would you like help with/ }), "Sore knee");
    const saved = () => sessionStorage.getItem("bookanything.booking-details.lumen-physio") ?? "";
    expect(saved()).toContain("Alex Morgan");
    expect(saved()).not.toContain("Sore knee");

    // A different service, then any further typing saves the form again.
    await u.click(within(summary()).getByRole("button", { name: /Initial assessment/ }));
    await u.click(await screen.findByRole("button", { name: /Phone consult/ }));
    await pickTime(u, "2026-10-01");
    await u.type(screen.getByRole("textbox", { name: /Full name/ }), " Jr");
    await waitFor(() => expect(saved()).toContain("Alex Morgan Jr"));
    expect(saved()).not.toContain("Sore knee");
  });
});

describe("mobile summary", () => {
  it("opens the full breakdown from the bottom bar", async () => {
    const u = user();
    api();
    renderFlow();
    await u.click(screen.getByRole("button", { name: /Sports massage/ }));
    await u.click(await screen.findByRole("radio", { name: /30 minutes/ }));
    const bar = screen.getByRole("button", { name: "Show appointment summary" });
    expect(bar).toHaveTextContent("Sports massage€40");
    await u.click(bar);
    const drawer = await screen.findByRole("dialog", { name: "Your appointment" });
    expect(within(drawer).getByText("Sports massage")).toBeInTheDocument();
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
