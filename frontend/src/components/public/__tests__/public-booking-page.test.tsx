import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessment, business, consult } from "@/lib/booking/__tests__/fixtures";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import {
  apiError,
  pinNow,
  renderWithProviders,
  stubApi,
  type ApiRequest,
} from "@/components/booking/__tests__/booking-test-utils";
import type { PublicOffer, PublicSite } from "@/lib/api/types";
import { PublicBookingPage } from "../public-booking-page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/lumen-physio/book",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
const auth = vi.hoisted(() => ({ isSignedIn: false }));
vi.mock("@/lib/auth/context", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: auth.isSignedIn,
    user: null,
    getToken: async () => null,
    signOut: async () => {},
    mode: "dev",
  }),
}));

beforeEach(() => {
  pinNow();
  auth.isSignedIn = false;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const BUSINESS = "/v1/public/businesses/lumen-physio";

/** The business and its services by default; `route` overrides (a pending promise keeps a request loading). */
function renderPage(route: (req: ApiRequest) => unknown = () => undefined, initial = true) {
  stubApi((req) => {
    const custom = route(req);
    if (custom !== undefined) return custom;
    if (req.path === BUSINESS) return business;
    if (req.path === `${BUSINESS}/services`) return [assessment, consult];
    return undefined;
  });
  return renderWithProviders(
    <PublicBookingPage slug="lumen-physio" initialBusiness={initial ? business : null} />,
  );
}

const never = () => new Promise<never>(() => {});

const SITE: PublicSite = {
  plan: {
    theme: "calm",
    palette: { primaryColor: "#0e7c70", accent: null },
    seo: { title: null, description: null },
    sections: [],
  },
  isDefault: false,
  context: { team: [], openingHours: [] },
};

describe("PublicBookingPage", () => {
  it("introduces the business above the booking flow", async () => {
    renderPage();
    const intro = within(
      must(screen.getByRole("heading", { level: 1, name: "Lumen Physiotherapy" }).parentElement, "intro"),
    );
    expect(intro.getByText("Physiotherapy for sports injuries.")).toBeInTheDocument();
    expect(intro.getByText("Unit 4, Lantern Quay, Dublin")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Choose a service" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Initial assessment/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?redirect_url=%2Flumen-physio%2Fbook",
    );
    await expectNoAxeViolations(document.body);
  });

  it("links signed-in visitors to their bookings", async () => {
    auth.isSignedIn = true;
    renderPage();
    expect(await screen.findByRole("link", { name: "My bookings" })).toHaveAttribute("href", "/my/bookings");
  });

  it("shows a loading state while the business loads", async () => {
    const { container } = renderPage((req) => (req.path === BUSINESS ? never() : undefined), false);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("lists the services and deals from the server render without fetching them again", () => {
    const requests = stubApi(() => never());
    renderWithProviders(
      <PublicBookingPage
        slug="lumen-physio"
        initialBusiness={business}
        initialServices={[assessment, consult]}
        initialOffers={[]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Choose a service" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Initial assessment/ })).toBeInTheDocument();
    expect(requests.filter((r) => r.path.startsWith(BUSINESS))).toEqual([]);
  });

  it("shows the current deals above the flow when there is no site, linking a single-service deal to it", () => {
    stubApi(() => never());
    const deal: PublicOffer = {
      id: "o1",
      name: "Last-minute physio",
      description: "A therapist had a cancellation? Grab the slot for less.",
      kind: "last_minute",
      discount: { type: "fixed", amountCents: 1500 },
      label: "€15 off",
      summary: "Starting within 24 hours",
      serviceIds: [assessment.id],
      validUntil: null,
    };
    const first = renderWithProviders(
      <PublicBookingPage
        slug="lumen-physio"
        initialBusiness={{ ...business, site: null }}
        initialServices={[assessment, consult]}
        initialOffers={[deal]}
      />,
    );
    const deals = screen.getByRole("region", { name: "Current deal" });
    expect(within(deals).getByText("€15 off")).toBeInTheDocument();
    expect(within(deals).getByRole("link", { name: /Book Initial assessment/ })).toHaveAttribute(
      "href",
      `/lumen-physio/book?service=${assessment.id}`,
    );
    first.unmount();
    // With a site, the site shows the deals itself.
    renderWithProviders(
      <PublicBookingPage
        slug="lumen-physio"
        initialBusiness={{ ...business, site: SITE }}
        initialServices={[assessment, consult]}
        initialOffers={[deal]}
      />,
    );
    expect(screen.queryByRole("region", { name: "Current deal" })).not.toBeInTheDocument();
  });

  it("keeps the introduction while the services load", () => {
    renderPage((req) => (req.path.endsWith("/services") ? never() : undefined));
    expect(screen.getByRole("heading", { level: 1, name: "Lumen Physiotherapy" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("explains an unknown address", async () => {
    const { container } = renderPage(
      (req) => (req.path === BUSINESS ? apiError(404, "NOT_FOUND", "Business not found.") : undefined),
      false,
    );
    expect(await screen.findByText("This booking page doesn't exist")).toBeInTheDocument();
    expect(
      screen.getByText("There's no business at bookanything.ie/lumen-physio. Check the link you were given."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to bookanything" })).toHaveAttribute("href", "/");
    await expectNoAxeViolations(container);
  });

  it("shows other errors loading the business with a retry", async () => {
    const user = userEvent.setup();
    let fail = true;
    renderPage(
      (req) => (fail && req.path === BUSINESS ? apiError(500, "INTERNAL", "Something broke.") : undefined),
      false,
    );
    expect(await screen.findByText("Something broke.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Lumen Physiotherapy" })).toBeInTheDocument();
  });

  it("shows a services error with a retry", async () => {
    const user = userEvent.setup();
    let fail = true;
    renderPage((req) =>
      fail && req.path.endsWith("/services")
        ? apiError(500, "INTERNAL", "Services are unavailable.")
        : undefined,
    );
    expect(await screen.findByText("We couldn't load the services")).toBeInTheDocument();
    expect(screen.getByText("Services are unavailable.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Choose a service" })).toBeInTheDocument();
  });
});
