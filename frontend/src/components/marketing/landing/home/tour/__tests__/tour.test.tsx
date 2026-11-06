import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "@/lib/api/query-keys";
import { CLIENT, demoDay } from "../../fixture";
import { createDirector, Stopped } from "../director";
import { SAMPLE_BUSINESS, sampleAnswer, sampleClient, sampleNow } from "../fixture-api";
import { TourApp, type Screen } from "../tour-app";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const linkProps = vi.hoisted(() => vi.fn());
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch, ...rest }: Record<string, never>) => {
    linkProps({ prefetch });
    return (
      <a href={String(href)} {...rest}>
        {children}
      </a>
    );
  },
}));

const SCREENS: Screen[] = ["calendar", "overview", "customers", "reports"];
const date = demoDay();

function renderApp(screenName: Screen, booked = false, booking: string | null = null) {
  const sample = sampleClient(date, booked);
  const view = render(
    <TourApp
      client={sample.client}
      now={sampleNow(date)}
      screen={screenName}
      mounted={new Set([screenName])}
      booking={booking}
      alerts={0}
      onOpenBooking={() => undefined}
      onCloseBooking={() => undefined}
    >
      {null}
    </TourApp>,
  );
  return { ...view, sample };
}

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("the hero's sample of the app", () => {
  // A failure here after a UI change means a real view asks for something new: answer it in fixture-api.ts.
  it.each(SCREENS)("has an answer for everything the %s screen asks", async (name) => {
    const { sample, container } = renderApp(name);
    await waitFor(() => expect(container.querySelector("[data-screen] [class]")).toBeInTheDocument());
    await screen.findAllByText(/./);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect([...sample.missing]).toEqual([]);
  });

  it("never prefetches the app's pages", async () => {
    const seen: unknown[] = [];
    linkProps.mockImplementation((props: { prefetch?: unknown }) => seen.push(props.prefetch));
    renderApp("customers", true);
    await screen.findByText(CLIENT.name);
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set([false]));
  });

  it("never touches the network", async () => {
    for (const name of SCREENS) renderApp(name);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the real screens, not their skeletons", async () => {
    renderApp("overview");
    expect(await screen.findByRole("heading", { name: /Today's bookings/ })).toBeInTheDocument();
    expect(screen.getByText("Casey Rowe")).toBeInTheDocument();
  });

  it("carries the booking through to the customers once it has landed", async () => {
    renderApp("customers", true);
    expect(await screen.findByText(CLIENT.name)).toBeInTheDocument();
  });

  it("opens the booking's detail, paid, with how to reach the client", async () => {
    const key = qk.business(SAMPLE_BUSINESS.id).overview(date);
    const today = sampleAnswer(key, date, true) as { today: { id: string; customer: { name: string } }[] };
    const booking = today.today.find((b) => b.customer.name === CLIENT.name)!;
    renderApp("calendar", true, booking.id);
    await waitFor(() => expect(screen.getByText(CLIENT.email)).toBeInTheDocument());
    expect(screen.getAllByText("Paid").length).toBeGreaterThan(0);
  });

  it("keeps the day's figures and the month's in step", () => {
    const business = qk.business(SAMPLE_BUSINESS.id);
    const before = sampleAnswer(business.overview(date), date, false) as { bookings30d: number };
    const after = sampleAnswer(business.overview(date), date, true) as { bookings30d: number };
    expect(after.bookings30d).toBe(before.bookings30d + 1);
  });
});

describe("the hero's clock", () => {
  it("stands still while anything holds it, and carries on from there", async () => {
    vi.useFakeTimers();
    const director = createDirector();
    let woke = false;
    void director.sleep(100).then(() => (woke = true));
    await vi.advanceTimersByTimeAsync(40);
    director.hold("paused", true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(woke).toBe(false);
    director.hold("paused", false);
    await vi.advanceTimersByTimeAsync(70);
    expect(woke).toBe(true);
    vi.useRealTimers();
  });

  it("needs every hold lifted", async () => {
    vi.useFakeTimers();
    const director = createDirector();
    let woke = false;
    director.hold("paused", true);
    director.hold("off screen", true);
    void director.sleep(10).then(() => (woke = true));
    director.hold("paused", false);
    await vi.advanceTimersByTimeAsync(100);
    expect(woke).toBe(false);
    director.hold("off screen", false);
    await vi.advanceTimersByTimeAsync(20);
    expect(woke).toBe(true);
    vi.useRealTimers();
  });

  it("ends the script when the stage goes", async () => {
    const director = createDirector();
    const waiting = director.sleep(1000);
    director.stop();
    await expect(waiting).rejects.toBeInstanceOf(Stopped);
  });
});
