/**
 * Businesses that offer their next available time only: the booking flow's time step offers one time at a time
 * (stepping with `after`, searching month by month), finds a chosen time again after a refresh, and customer
 * rescheduling does the same.
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useManagedAvailabilityWindows, useManagedNextSlot } from "@/lib/api/hooks";
import type { PublicBusiness } from "@/lib/api/types";
import { business, consult, managedBooking } from "@/lib/booking/__tests__/fixtures";
import { formatDate, type PlainDate } from "@/lib/format";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { BookingFlow } from "../booking-flow";
import { ReschedulePanel, useRescheduleState } from "../reschedule";
import {
  nextOnlyAvailabilityFor,
  pinNow,
  renderWithProviders,
  slotAt,
  stubApi,
  TZ,
  type ApiRequest,
} from "./booking-test-utils";
import { trackHistory, untrackHistory, urlParams } from "./navigation-mock";

vi.mock("next/navigation", async () =>
  (await import("./navigation-mock")).locationNavigation("/lumen-physio"),
);
vi.mock("@/lib/auth/context", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: false,
    user: null,
    getToken: async () => null,
    signOut: async () => {},
    mode: "dev",
  }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => pinNow());
afterEach(() => {
  untrackHistory();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const nextOnly: PublicBusiness = { ...business, policies: { ...business.policies, nextAvailableOnly: true } };
/** "Thursday 1 October", as the card writes it. */
const long = (d: PlainDate) => formatDate(d, TZ, "long");
const twiceDaily = (d: PlainDate) => [slotAt(d, "10:00"), slotAt(d, "14:00")];

/** Availability cut to one time like the server, from `slotsOn`; returns every availability request. */
function api(slotsOn: (d: PlainDate) => ReturnType<typeof slotAt>[] = twiceDaily) {
  const requests = stubApi((req) =>
    req.path.endsWith("/availability") ? nextOnlyAvailabilityFor(req.query, slotsOn) : undefined,
  );
  return () => requests.filter((r: ApiRequest) => r.path.endsWith("/availability"));
}

function renderFlow(url = "/lumen-physio?service=s3&step=time") {
  trackHistory(url);
  return renderWithProviders(<BookingFlow business={nextOnly} services={[consult]} />, {
    vocabulary: nextOnly.vocabulary,
  });
}

const offered = () => screen.findByRole("region", { name: /Next available|Your chosen time/ });

describe("next available time only: booking", () => {
  it("offers one time instead of a calendar, steps to later ones and back, then books the one shown", async () => {
    const availability = api();
    const user = userEvent.setup();
    const { container } = renderFlow();

    const card = await offered();
    expect(screen.queryByRole("grid", { name: "Choose a date" })).not.toBeInTheDocument();
    expect(within(card).getByText(`Today · ${long("2026-10-01")}`)).toBeInTheDocument();
    expect(within(card).getByText(/^10:00/)).toBeInTheDocument();
    expect(must(availability()[0], "first request").query.get("after")).toBeNull();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole("button", { name: /Show a later time/ }));
    expect(await screen.findByRole("region", { name: "Next available after that" })).toHaveTextContent(
      /14:00/,
    );
    expect(availability().at(-1)?.query.get("after")).toBe(slotAt("2026-10-01", "10:00").start);

    await user.click(screen.getByRole("button", { name: /Show a later time/ }));
    await waitFor(() => expect(screen.getByText(`Tomorrow · ${long("2026-10-02")}`)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Back to the earliest time/ }));
    expect(await screen.findByRole("region", { name: "Next available" })).toHaveTextContent(
      `Today · ${long("2026-10-01")}`,
    );

    await user.click(screen.getByRole("button", { name: /Show a later time/ }));
    await screen.findByRole("region", { name: "Next available after that" });
    await user.click(screen.getByRole("button", { name: "Book this time" }));
    expect(await screen.findByRole("heading", { name: "Your details" })).toBeInTheDocument();
    expect(urlParams().get("date")).toBe("2026-10-01");
    expect(urlParams().get("time")).toBe("14:00");

    // Back on the time step, the chosen time is still the one offered.
    await user.click(screen.getByRole("button", { name: /Back/ }));
    const chosen = await screen.findByRole("region", { name: "Your chosen time" });
    expect(within(chosen).getByRole("button", { name: "Continue with this time" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(chosen).toHaveTextContent(/14:00/);
  });

  it("searches month by month until a time turns up", async () => {
    const availability = api((d) => (d === "2026-11-03" ? [slotAt(d, "09:30")] : []));
    renderFlow();
    expect(await offered()).toHaveTextContent(long("2026-11-03"));
    expect(availability().map((r) => [r.query.get("from"), r.query.get("to")])).toEqual([
      ["2026-10-01", "2026-10-31"],
      ["2026-11-01", "2026-11-30"],
    ]);
  });

  it("says so when nothing is free up to the last bookable date", async () => {
    const availability = api(() => []);
    renderFlow();
    expect(await screen.findByText("No times available right now")).toBeInTheDocument();
    // Today + 60 days (the business's max advance) is 30 November: two months searched, nothing more.
    expect(availability().map((r) => r.query.get("to"))).toEqual(["2026-10-31", "2026-11-30"]);
  });

  it("finds an already chosen time again after a refresh", async () => {
    const availability = api();
    const user = userEvent.setup();
    renderFlow("/lumen-physio?service=s3&date=2026-10-02&time=14:00&step=details");
    await screen.findByRole("heading", { name: "Your details" });
    // 14:00 in Dublin is 13:00 UTC: the search starts a minute before it.
    await waitFor(() => expect(availability()[0]?.query.get("after")).toBe("2026-10-02T12:59:00.000Z"));

    await user.click(screen.getByRole("button", { name: /Back/ }));
    const chosen = await screen.findByRole("region", { name: "Your chosen time" });
    expect(chosen).toHaveTextContent(long("2026-10-02"));
    expect(chosen).toHaveTextContent("14:00");
  });
});

function Reschedule({ reschedule }: { reschedule: (start: string) => Promise<unknown> }) {
  const state = useRescheduleState(TZ, 60);
  const availability = useManagedAvailabilityWindows("tok", state.windows);
  const next = useManagedNextSlot("tok", state.nextWindows, state.after, availability.nextAvailableOnly);
  return (
    <ReschedulePanel
      booking={managedBooking()}
      state={state}
      availability={availability}
      next={next}
      reschedule={reschedule}
      onDone={() => {}}
      onCancel={() => {}}
      pending={false}
    />
  );
}

describe("next available time only: rescheduling", () => {
  it("offers one time at a time when the availability says so, and moves to the one chosen", async () => {
    api();
    const reschedule = vi.fn(async () => ({}));
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Reschedule reschedule={reschedule} />);

    const card = await offered();
    expect(card).toHaveTextContent(`Today · ${long("2026-10-01")}`);
    expect(card).toHaveTextContent("10:00");
    expect(screen.queryByRole("grid", { name: "Choose a date" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a new time" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Choose this time" }));
    expect(screen.getByRole("button", { name: /^Move to Thu,? 1 Oct, 10:00$/ })).toBeEnabled();

    // Stepping on drops the choice: only the time on screen can be chosen.
    await user.click(screen.getByRole("button", { name: /Show a later time/ }));
    expect(await screen.findByRole("region", { name: "Next available after that" })).toHaveTextContent(
      /14:00/,
    );
    expect(screen.getByRole("button", { name: "Choose a new time" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Choose this time" }));
    await user.click(screen.getByRole("button", { name: /^Move to Thu,? 1 Oct, 14:00$/ }));
    expect(reschedule).toHaveBeenCalledWith(slotAt("2026-10-01", "14:00").start);
    await expectNoAxeViolations(container);
  });
});
