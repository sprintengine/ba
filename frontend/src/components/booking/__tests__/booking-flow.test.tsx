import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { addDaysToPlainDate, zonedToIso } from "@/lib/format";
import { VocabularyProvider } from "@/lib/vocabulary";
import { must } from "@/test/must";
import { BookingFlow } from "../booking-flow";
import { business, consult } from "@/lib/booking/__tests__/fixtures";

// --- next/navigation backed by the real window.location (the flow uses history.pushState) ---
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (cb: () => void) => {
    window.addEventListener("locationchange", cb);
    window.addEventListener("popstate", cb);
    return () => {
      window.removeEventListener("locationchange", cb);
      window.removeEventListener("popstate", cb);
    };
  };
  return {
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
    usePathname: () => "/lumen-physio",
    useRouter: () => ({ push, replace, back: vi.fn() }),
  };
});
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

const originalPush = window.history.pushState.bind(window.history);
const originalReplace = window.history.replaceState.bind(window.history);
beforeEach(() => {
  window.history.pushState = (...args: Parameters<History["pushState"]>) => {
    originalPush(...args);
    window.dispatchEvent(new Event("locationchange"));
  };
  window.history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    originalReplace(...args);
    window.dispatchEvent(new Event("locationchange"));
  };
  originalReplace(null, "", "/lumen-physio");
  push.mockReset();
  replace.mockReset();
});
afterEach(() => {
  window.history.pushState = originalPush;
  window.history.replaceState = originalReplace;
  vi.unstubAllGlobals();
});

// --- API stub ---
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
const DEAL = {
  id: "of1",
  name: "Quiet mornings",
  label: "20% off",
  originalPriceCents: 5000,
  priceCents: 4000,
};
/**
 * Every day has one slot at 10:00 (Dublin); the slot on `dealOn` carries a deal, or every slot with `dealEveryDay`.
 * `deals` is read on every request, so a test can take the deal away.
 */
function stubApi(
  bookingResponses: { status: number; body: unknown }[],
  deals: { dealOn?: string; dealEveryDay?: boolean } = {},
) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    calls.push({
      url: url.pathname + url.search,
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (url.pathname.endsWith("/availability")) {
      const from = url.searchParams.get("from")!;
      const to = url.searchParams.get("to")!;
      const days = [];
      for (let d = from; d <= to; d = addDaysToPlainDate(d, 1)) {
        const start = zonedToIso(d, "10:00", "Europe/Dublin");
        const end = zonedToIso(d, "10:15", "Europe/Dublin");
        const offer = deals.dealEveryDay || d === deals.dealOn ? DEAL : null;
        days.push({ date: d, slots: [{ start, end, resourceIds: ["r1"], seatsLeft: null, offer }] });
      }
      return new Response(JSON.stringify({ timezone: "Europe/Dublin", from, to, durationMinutes: 15, days }));
    }
    if (url.pathname.endsWith("/bookings") && method === "POST") {
      const next = bookingResponses.shift()!;
      return new Response(JSON.stringify(next.body), { status: next.status });
    }
    return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "nope" } }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderFlow(services = [consult]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <VocabularyProvider vocabulary={business.vocabulary}>
        <BookingFlow business={business} services={services} />
      </VocabularyProvider>
    </QueryClientProvider>,
  );
}

async function pickFirstSlot(user: ReturnType<typeof userEvent.setup>) {
  const times = await screen.findByRole("group", { name: "Available times" }, { timeout: 3000 });
  await user.click(must(within(times).getAllByRole("button")[0], "first time"));
}

describe("BookingFlow", () => {
  // Every stubbed day has a slot at 10:00 Dublin: on the real clock, today's would be in the past after 10:00, and the
  // flow rightly drops a time that has gone. 08:00 Dublin on Thursday 1 October 2026 keeps today's slot ahead.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T07:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("walks service → time → details → review, keeping state in the URL", async () => {
    stubApi([]);
    const user = userEvent.setup();
    renderFlow();

    // Focus stays where it is on arrival, and moves to each new step's heading.
    expect(screen.getByRole("heading", { name: "Choose a service" })).not.toHaveFocus();
    await user.click(screen.getByRole("button", { name: /Phone consult/ }));
    const timeHeading = await screen.findByRole("heading", { name: "Pick a time" });
    await waitFor(() => expect(timeHeading).toHaveFocus());
    expect(screen.getByText(/^Step 2/)).toHaveTextContent(/^Step 2 of 4$/);
    expect(new URLSearchParams(window.location.search).get("service")).toBe("s3");
    expect(new URLSearchParams(window.location.search).get("step")).toBe("time");

    await pickFirstSlot(user);
    expect(await screen.findByRole("heading", { name: "Your details" })).toBeInTheDocument();
    const params = new URLSearchParams(window.location.search);
    expect(params.get("time")).toBe("10:00");
    expect(params.get("date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Signing in comes back to this step, with what was chosen.
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/sign-in?redirect_url=${encodeURIComponent(`/lumen-physio?${params.toString()}`)}`,
    );

    // Validation blocks an empty form.
    await user.click(must(screen.getAllByRole("button", { name: /^Review/ })[0], "Review button"));
    expect(await screen.findByText("Enter your name")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Full name/), "Alex Morgan");
    await user.type(screen.getByLabelText(/^Email/), "alex.morgan@example.com");
    await user.click(must(screen.getAllByRole("button", { name: /^Review/ })[0], "Review button"));
    expect(await screen.findByRole("heading", { name: "Review and confirm" })).toBeInTheDocument();
    expect(screen.getByText("Alex Morgan")).toBeInTheDocument();

    // Back goes to the previous step.
    await user.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByRole("heading", { name: "Your details" })).toBeInTheDocument();
  });

  it("returns to the time step with fresh slots when the slot was just taken, then books", async () => {
    const booked = {
      booking: { id: "bk1", reference: "BA-7K3F9Q" },
      manageToken: "tok123",
      next: { type: "confirmed", checkoutUrl: null },
    };
    const calls = stubApi([
      {
        status: 409,
        body: { error: { code: "SLOT_UNAVAILABLE", message: "That time is no longer available." } },
      },
      { status: 201, body: booked },
    ]);
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: /Phone consult/ }));
    await pickFirstSlot(user);
    await user.type(await screen.findByLabelText(/Full name/), "Alex Morgan");
    await user.type(screen.getByLabelText(/^Email/), "alex.morgan@example.com");
    await user.click(must(screen.getAllByRole("button", { name: /^Review/ })[0], "Review button"));
    await screen.findByRole("heading", { name: "Review and confirm" });

    const availabilityCallsBefore = calls.filter((c) => c.url.includes("/availability")).length;
    await user.click(
      must(screen.getAllByRole("button", { name: /Confirm appointment/ })[0], "Confirm button"),
    );

    expect(await screen.findByRole("heading", { name: "Pick a time" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Someone just booked that time/);
    expect(new URLSearchParams(window.location.search).get("time")).toBeNull();
    await waitFor(() =>
      expect(calls.filter((c) => c.url.includes("/availability")).length).toBeGreaterThan(
        availabilityCallsBefore,
      ),
    );

    // Details are kept; pick another time and confirm.
    await pickFirstSlot(user);
    await user.click(must(screen.getAllByRole("button", { name: /^Review/ })[0], "Review button"));
    await screen.findByRole("heading", { name: "Review and confirm" });
    await act(async () => {
      await user.click(
        must(screen.getAllByRole("button", { name: /Confirm appointment/ })[0], "Confirm button"),
      );
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/manage/tok123?booked=1"));

    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(2);
    for (const p of posts) expect(p.headers["Idempotency-Key"]).toBeTruthy();
    // The taken time ended that submit intent: the new attempt has its own key.
    expect(posts[0]?.headers["Idempotency-Key"]).not.toBe(posts[1]?.headers["Idempotency-Key"]);
    expect(must(posts[1], "second POST").body).toMatchObject({
      serviceId: "s3",
      customer: { name: "Alex Morgan", email: "alex.morgan@example.com", phone: null },
      answers: {},
    });
  });

  it("lets the customer pay at the venue instead of online when the service allows it", async () => {
    const booked = {
      booking: { id: "bk1", reference: "BA-7K3F9Q" },
      manageToken: "tok123",
      next: { type: "confirmed", checkoutUrl: null },
    };
    const calls = stubApi([
      {
        status: 409,
        body: { error: { code: "PAYMENTS_NOT_CONFIGURED", message: "Payments aren't set up.", fields: {} } },
      },
      { status: 201, body: booked },
    ]);
    const user = userEvent.setup();
    renderFlow([{ ...consult, priceCents: 5000, paymentMode: "full", allowPayAtVenue: true }]);

    await user.click(screen.getByRole("button", { name: /Phone consult/ }));
    await pickFirstSlot(user);
    await user.type(await screen.findByLabelText(/Full name/), "Alex Morgan");
    await user.type(screen.getByLabelText(/^Email/), "alex.morgan@example.com");
    await user.click(must(screen.getAllByRole("button", { name: /^Review/ })[0], "Review button"));
    await screen.findByRole("heading", { name: "Review and confirm" });

    const howToPay = screen.getByRole("radiogroup", { name: "How to pay" });
    expect(within(howToPay).getByRole("radio", { name: /Pay online now/ })).toBeChecked();
    // Online payment turns out not to be available: the alert points to paying at the venue.
    await user.click(must(screen.getAllByRole("button", { name: /Continue to payment · €50/ })[0], "Pay"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Choose “Pay at the venue” under Payment/);

    await user.click(within(howToPay).getByRole("radio", { name: /Pay at the venue/ }));
    expect(screen.getAllByText("Nothing to pay now. Pay at your appointment.").length).toBeGreaterThan(0);
    await act(async () => {
      await user.click(
        must(screen.getAllByRole("button", { name: /Confirm appointment/ })[0], "Confirm button"),
      );
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/manage/tok123?booked=1"));
    expect(
      must(
        calls.findLast((c) => c.method === "POST"),
        "booking POST",
      ).body,
    ).toMatchObject({
      serviceId: "s3",
      payment: "at_venue",
    });
  });

  it("books at the price shown, and shows the new price when the deal ran out meanwhile", async () => {
    // Early on 1 October in Dublin, so the day's 10:00 is still to come.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T07:00:00Z"));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const booked = {
      booking: { id: "bk1", reference: "BA-7K3F9Q" },
      manageToken: "tok123",
      next: { type: "confirmed", checkoutUrl: null },
    };
    const deals = { dealEveryDay: true };
    const calls = stubApi(
      [
        {
          status: 409,
          body: {
            error: {
              code: "PRICE_CHANGED",
              message: "The price for this time has changed to €50. Check it and book again.",
            },
          },
        },
        { status: 201, body: booked },
      ],
      deals,
    );
    const user = userEvent.setup();
    renderFlow([{ ...consult, priceCents: 5000, paymentMode: "at_venue" }]);

    await user.click(screen.getByRole("button", { name: /Phone consult/ }));
    await pickFirstSlot(user);
    await user.type(await screen.findByLabelText(/Full name/), "Alex Morgan");
    await user.type(screen.getByLabelText(/^Email/), "alex.morgan@example.com");
    await user.click(must(screen.getAllByRole("button", { name: /^Review/ })[0], "Review button"));
    await screen.findByRole("heading", { name: "Review and confirm" });

    // The deal's last redemption goes to someone else before this customer confirms.
    deals.dealEveryDay = false;
    await user.click(must(screen.getAllByRole("button", { name: /Confirm appointment/ })[0], "Confirm"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The price has changed");
    expect(alert).toHaveTextContent("€50");
    expect(replace).not.toHaveBeenCalled();
    const posts = () => calls.filter((c) => c.method === "POST");
    expect(must(posts()[0], "first POST").body).toMatchObject({ expectedTotalCents: 4000 });

    // The times are refreshed: the summary shows the full price, and booking again expects it.
    await waitFor(() => expect(screen.queryByText("Quiet mornings")).not.toBeInTheDocument());
    await act(async () => {
      await user.click(must(screen.getAllByRole("button", { name: /Confirm appointment/ })[0], "Confirm"));
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/manage/tok123?booked=1"));
    expect(must(posts()[1], "second POST").body).toMatchObject({ expectedTotalCents: 5000 });
  });

  it("retries with the same idempotency key after the booking system was unreachable", async () => {
    const calls = stubApi([
      { status: 503, body: { error: { code: "SERVICE_UNAVAILABLE", message: "Try again." } } },
      {
        status: 201,
        body: {
          booking: { id: "bk1", reference: "BA-7K3F9Q" },
          manageToken: "tok123",
          next: { type: "confirmed", checkoutUrl: null },
        },
      },
    ]);
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("button", { name: /Phone consult/ }));
    await pickFirstSlot(user);
    await user.type(await screen.findByLabelText(/Full name/), "Alex Morgan");
    await user.type(screen.getByLabelText(/^Email/), "alex.morgan@example.com");
    await user.click(must(screen.getAllByRole("button", { name: /^Review/ })[0], "Review button"));
    await screen.findByRole("heading", { name: "Review and confirm" });

    await user.click(
      must(screen.getAllByRole("button", { name: /Confirm appointment/ })[0], "Confirm button"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/We couldn't reach the booking system/);
    await act(async () => {
      await user.click(
        must(screen.getAllByRole("button", { name: /Confirm appointment/ })[0], "Confirm button"),
      );
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/manage/tok123?booked=1"));

    const keys = calls.filter((c) => c.method === "POST").map((c) => c.headers["Idempotency-Key"]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("sends the customer back to their details when the server rejects a field", async () => {
    stubApi([
      {
        status: 400,
        body: {
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid request.",
            fields: { "customer.email": "This email address can't receive mail" },
          },
        },
      },
    ]);
    const user = userEvent.setup();
    renderFlow();
    await user.click(screen.getByRole("button", { name: /Phone consult/ }));
    await pickFirstSlot(user);
    await user.type(await screen.findByLabelText(/Full name/), "Alex Morgan");
    await user.type(screen.getByLabelText(/^Email/), "alex.morgan@example.com");
    await user.click(must(screen.getAllByRole("button", { name: /^Review/ })[0], "Review button"));
    await screen.findByRole("heading", { name: "Review and confirm" });

    await user.click(
      must(screen.getAllByRole("button", { name: /Confirm appointment/ })[0], "Confirm button"),
    );
    expect(await screen.findByRole("heading", { name: "Your details" })).toBeInTheDocument();
    expect(await screen.findByText("This email address can't receive mail")).toBeInTheDocument();
  });
});

describe("BookingFlow time step availability", () => {
  // Today is Thursday 1 October 2026 in Dublin; the business books up to 60 days ahead (30 November).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const availabilityWindows = (calls: Call[]) =>
    calls
      .filter((c) => c.url.includes("/availability"))
      .map((c) => {
        const q = new URL(c.url, "http://localhost").searchParams;
        return `${q.get("from")}..${q.get("to")}`;
      });

  function openTimeStep(date: string) {
    originalReplace(null, "", `/lumen-physio?service=s3&date=${date}&step=time`);
    renderFlow();
  }

  it("loads a focused week inside the shown month with the month's request alone", async () => {
    const calls = stubApi([], { dealOn: "2026-10-15" });
    openTimeStep("2026-10-15");

    const times = await screen.findByRole("group", { name: "Available times" });
    expect(within(times).getByRole("button", { name: /10:00/ })).toHaveTextContent("20% off");
    expect(screen.getByRole("heading", { name: /15 October/ })).toBeInTheDocument();
    // The week strip's days (12-18 October) have loaded and can be picked.
    const week = screen.getByRole("group", { name: "Choose a date" });
    const days = within(week).getAllByRole("button");
    expect(days).toHaveLength(7);
    for (const day of days) expect(day).toBeEnabled();
    expect(within(week).getByRole("button", { name: /15 October/ })).toHaveAttribute("aria-pressed", "true");

    expect(availabilityWindows(calls)).toEqual(["2026-10-01..2026-10-31"]);
  });

  it("starts the time step over for a link to a day that can't be booked any more", async () => {
    const calls = stubApi([]);
    originalReplace(null, "", "/lumen-physio?service=s3&date=2026-09-20&time=10:00&step=review");
    renderFlow();

    // Not the review step, and not times loading forever for 20 September: the first day with times.
    expect(await screen.findByRole("heading", { name: "Pick a time" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /1 October/ })).toBeInTheDocument();
    expect(availabilityWindows(calls)).toEqual(["2026-10-01..2026-10-31"]);
  });

  it("drops a time earlier today from a link, keeping the day", async () => {
    stubApi([]);
    // 08:00 has passed (it is 10:00 in Dublin).
    originalReplace(null, "", "/lumen-physio?service=s3&date=2026-10-01&time=08:00&step=details");
    renderFlow();

    expect(await screen.findByRole("heading", { name: "Pick a time" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /1 October/ })).toBeInTheDocument();
  });

  it("loads the next month's days of a week the phone strip moves on to", async () => {
    const calls = stubApi([]);
    const user = userEvent.setup();
    openTimeStep("2026-10-06");

    await screen.findByRole("group", { name: "Available times" });
    expect(availabilityWindows(calls)).toEqual(["2026-10-01..2026-10-31"]);
    // On to the week of 26 October - 1 November.
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() =>
      expect(availabilityWindows(calls).sort()).toEqual(["2026-10-01..2026-10-31", "2026-11-01..2026-11-30"]),
    );
  });

  it("loads a week that runs into the next month as whole months, shared with the month view", async () => {
    const calls = stubApi([]);
    const user = userEvent.setup();
    openTimeStep("2026-10-30");

    await screen.findByRole("group", { name: "Available times" });
    // Friday 30 October's week ends on Sunday 1 November.
    const week = screen.getByRole("group", { name: "Choose a date" });
    await waitFor(() => expect(within(week).getByRole("button", { name: /1 November/ })).toBeEnabled());
    expect(availabilityWindows(calls).sort()).toEqual(["2026-10-01..2026-10-31", "2026-11-01..2026-11-30"]);

    // Showing November reuses what is loaded.
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    expect(availabilityWindows(calls)).toHaveLength(2);
  });
});
