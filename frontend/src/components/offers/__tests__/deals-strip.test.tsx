import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { must } from "@/test/must";
import type { PublicBusiness, PublicOffer } from "@/lib/api/types";
import { SAMPLE_BUSINESS, SAMPLE_CONTEXT, SAMPLE_SERVICES, samplePlan } from "@/components/site/sample-site";
import { mockApi } from "@/components/dashboard/test/render";
import { PublicSitePage } from "@/components/public/public-site-page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/harbour-lane-studio",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
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

afterEach(() => vi.unstubAllGlobals());

const business: PublicBusiness = {
  ...SAMPLE_BUSINESS,
  industry: "generic",
  websiteUrl: null,
  policies: {
    minNoticeMinutes: 60,
    maxAdvanceDays: 60,
    cancellationNoticeHours: 24,
    lateCancellationRefundPercent: 0,
    allowCustomerCancel: true,
    allowCustomerReschedule: true,
    holdMinutes: 30,
    requireCustomerPhone: false,
    nextAvailableOnly: false,
  },
  customerGroups: [],
  paymentsEnabled: true,
  site: { plan: samplePlan("calm"), isDefault: false, context: SAMPLE_CONTEXT },
};

const deal = (patch: Partial<PublicOffer> = {}): PublicOffer => ({
  id: "of1",
  name: "Quiet afternoons",
  description: "Lower prices when it's calm.",
  kind: "off_peak",
  discount: { type: "percent", percent: 20 },
  label: "20% off",
  summary: "Mon–Fri, 13:00–16:00",
  serviceIds: SAMPLE_SERVICES.map((s) => s.id),
  validUntil: null,
  ...patch,
});

function renderSite(offers: PublicOffer[], initialOffers: PublicOffer[] | null = null) {
  const fetchMock = mockApi((_m, path) => {
    if (path.endsWith("/offers")) return offers;
    if (path.endsWith("/services")) return SAMPLE_SERVICES;
    return business;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  render(
    <QueryClientProvider client={client}>
      <PublicSitePage
        slug={business.slug}
        initialBusiness={business}
        initialServices={SAMPLE_SERVICES}
        initialOffers={initialOffers}
      />
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe("deals on the public site", () => {
  it("shows each active deal with its label, summary and a Book link", async () => {
    const one = must(SAMPLE_SERVICES[0], "a sample service");
    renderSite([
      deal(),
      deal({
        id: "of2",
        name: "Last-minute",
        label: "€5 off",
        summary: "Starting within 3 hours",
        serviceIds: [one.id],
        validUntil: "2099-12-31",
      }),
    ]);
    const section = await screen.findByRole("region", { name: "Current deals" });
    const items = within(section).getAllByRole("listitem");
    const [all, single] = [must(items[0], "the all-services deal"), must(items[1], "the one-service deal")];
    expect(all).toHaveTextContent("Quiet afternoons");
    expect(within(all).getByText("20% off")).toBeInTheDocument();
    expect(all).toHaveTextContent("Mon–Fri, 13:00–16:00");
    expect(within(all).getByRole("link", { name: /book now/i })).toHaveAttribute(
      "href",
      `/${business.slug}/book`,
    );
    expect(single).toHaveTextContent(`${one.name} · Starting within 3 hours · until 31 Dec`);
    expect(within(single).getByRole("link", { name: /book/i })).toHaveAttribute(
      "href",
      `/${business.slug}/book?service=${encodeURIComponent(one.id)}`,
    );
  });

  it("shows the server-rendered deals with the page, without fetching them again", () => {
    const fetchMock = renderSite([], [deal()]);
    expect(screen.getByRole("region", { name: "Current deal" })).toHaveTextContent("Quiet afternoons");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is hidden when there are no deals", async () => {
    renderSite([]);
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByRole("region", { name: /current deal/i })).not.toBeInTheDocument();
  });
});
