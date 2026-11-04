/**
 * The booking flow's WebMCP tools, driven as a browser agent would through `document.modelContext`: look up, choose,
 * fill in and book, with the page following each step.
 */
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessment, business, consult, massage } from "@/lib/booking/__tests__/fixtures";
import { fakeModelContext, removeModelContext } from "@/test/model-context";
import { BookingFlow } from "../booking-flow";
import { availabilityFor, pinNow, renderWithProviders, stubApi, type ApiRequest } from "./booking-test-utils";
import { router, trackHistory, untrackHistory, urlParams } from "./navigation-mock";

vi.mock("next/navigation", async () =>
  (await import("./navigation-mock")).locationNavigation("/lumen-physio/book"),
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

const booked = {
  booking: { id: "bk1", reference: "BA-7K3F9Q" },
  manageToken: "tok123",
  next: { type: "confirmed", checkoutUrl: null },
};

/** Free at 10:00 every day; the booking is made. Returns every request. */
function api(): ApiRequest[] {
  return stubApi((req) => {
    if (req.path.endsWith("/availability")) return availabilityFor(req.query);
    if (req.method === "POST" && req.path.endsWith("/bookings")) return booked;
    return undefined;
  });
}

let agent: ReturnType<typeof fakeModelContext>;

beforeEach(() => {
  pinNow();
  trackHistory("/lumen-physio/book");
  agent = fakeModelContext();
});
afterEach(() => {
  removeModelContext();
  untrackHistory();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderFlow(services = [assessment, massage, consult]) {
  const view = renderWithProviders(<BookingFlow business={business} services={services} />);
  await waitFor(() => expect(agent.tools.size).toBe(6));
  return view;
}

describe("booking agent tools", () => {
  it("looks up, chooses, fills in and books, with the page following along", async () => {
    const requests = api();
    await renderFlow();

    const options = await agent.call("get_booking_options");
    expect((options.services as { name: string }[]).map((s) => s.name)).toEqual([
      "Initial assessment",
      "Sports massage",
      "Phone consult",
    ]);

    const times = await agent.call("check_availability", {
      serviceId: "s3",
      from: "2026-10-02",
      to: "2026-10-03",
    });
    expect(times).toMatchObject({
      from: "2026-10-02",
      to: "2026-10-03",
      days: [
        { date: "2026-10-02", times: ["10:00"] },
        { date: "2026-10-03", times: ["10:00"] },
      ],
    });

    const chosen = await agent.call("select_appointment", {
      serviceId: "s3",
      date: "2026-10-02",
      time: "10:00",
    });
    expect(chosen).toMatchObject({ step: "details", selection: { service: "Phone consult", time: "10:00" } });
    expect(Object.fromEntries(urlParams())).toMatchObject({
      service: "s3",
      date: "2026-10-02",
      time: "10:00",
    });
    expect(await screen.findByRole("heading", { name: "Your details" })).toBeInTheDocument();

    expect(await agent.call("confirm_booking")).toMatchObject({
      error: expect.stringMatching(/details step/),
    });

    expect(await agent.call("fill_booking_details", { name: "Alex Morgan", email: "alex@" })).toEqual({
      complete: false,
      problems: ["Email: Enter a valid email address"],
    });
    expect(screen.getByLabelText(/Full name/)).toHaveValue("Alex Morgan");
    expect(await agent.call("fill_booking_details", { email: "alex.morgan@example.com" })).toMatchObject({
      complete: true,
    });
    expect(await screen.findByRole("heading", { name: "Review and confirm" })).toBeInTheDocument();
    expect(await agent.call("get_booking_status")).toMatchObject({
      step: "review",
      details: { name: "Alex Morgan", email: "alex.morgan@example.com", problems: [] },
    });

    expect(await agent.call("confirm_booking")).toMatchObject({ booked: true, status: "confirmed" });
    const post = requests.find((r) => r.method === "POST");
    expect(post?.body).toMatchObject({
      serviceId: "s3",
      start: "2026-10-02T10:00:00+01:00",
      customer: { name: "Alex Morgan", email: "alex.morgan@example.com" },
    });
    expect(router.replace).toHaveBeenCalledWith("/manage/tok123?booked=1");
  });

  it("refuses a time that isn't free, leaving the page as it was", async () => {
    api();
    await renderFlow();
    const result = await agent.call("select_appointment", {
      serviceId: "s3",
      date: "2026-10-02",
      time: "11:00",
    });
    expect(result).toEqual({
      error: "2026-10-02 at 11:00 isn't free for this. Call check_availability for free times.",
    });
    expect(urlParams().toString()).toBe("");
  });

  it("stops at the step still to do: a service's option before its times", async () => {
    api();
    await renderFlow();
    expect(await agent.call("select_appointment", { serviceId: "s2" })).toEqual({
      error: expect.stringMatching(/Choose an option of Sports massage/),
    });
    const result = await agent.call("select_appointment", {
      serviceId: "s2",
      optionId: "o2",
      addonIds: ["a1"],
    });
    expect(result).toMatchObject({
      step: "time",
      price: { total: "€80", payNow: "€15", payAtVenue: "€65" },
    });
    expect(await screen.findByRole("heading", { name: "Pick a time" })).toBeInTheDocument();
  });

  it("unregisters the tools when the flow goes away", async () => {
    api();
    const view = await renderFlow();
    const signal = agent.tools.get("confirm_booking")?.signal;
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
