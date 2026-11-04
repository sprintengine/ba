import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicBusiness } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { SAMPLE_BUSINESS, SAMPLE_CONTEXT, SAMPLE_SERVICES, samplePlan } from "@/components/site/sample-site";
import { mockApi } from "@/components/dashboard/test/render";
import { PublicSitePage } from "../public-site-page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/harbour-lane-studio",
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

afterEach(() => {
  vi.unstubAllGlobals();
  auth.isSignedIn = false;
});

const policies = {
  minNoticeMinutes: 60,
  maxAdvanceDays: 60,
  cancellationNoticeHours: 24,
  lateCancellationRefundPercent: 0,
  allowCustomerCancel: true,
  allowCustomerReschedule: true,
  holdMinutes: 30,
  requireCustomerPhone: false,
  nextAvailableOnly: false,
};
const business = (site: PublicBusiness["site"]): PublicBusiness => ({
  ...SAMPLE_BUSINESS,
  industry: "generic",
  websiteUrl: null,
  policies,
  customerGroups: [],
  paymentsEnabled: true,
  site,
});

function renderPage(
  initial: PublicBusiness | null,
  showDraft = false,
  initialServices: typeof SAMPLE_SERVICES | null = SAMPLE_SERVICES,
) {
  // The app's defaults (query-provider.tsx): data is fresh for 30 seconds.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  return render(
    <QueryClientProvider client={client}>
      <PublicSitePage
        slug="harbour-lane-studio"
        initialBusiness={initial}
        initialServices={initialServices}
        showDraft={showDraft}
      />
    </QueryClientProvider>,
  );
}

describe("PublicSitePage", () => {
  it("renders the published site with the visitor's sign-in link", async () => {
    const b = business({ plan: samplePlan("playful"), isDefault: false, context: SAMPLE_CONTEXT });
    mockApi((_m, path) => (path.endsWith("/services") ? SAMPLE_SERVICES : b));
    const { container } = renderPage(b);
    expect(container.querySelector("[data-theme]")).toHaveAttribute("data-theme", "playful");
    expect(await screen.findByRole("heading", { level: 1, name: /Feel at home/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?redirect_url=%2Fharbour-lane-studio",
    );
  });

  it("refreshes on mount for a signed-in visitor, so an owner's just-published site replaces the cached one", async () => {
    auth.isSignedIn = true;
    const stale = business({ plan: samplePlan("calm"), isDefault: false, context: SAMPLE_CONTEXT });
    const fresh = business({ plan: samplePlan("bold"), isDefault: false, context: SAMPLE_CONTEXT });
    mockApi((_m, path) => (path.endsWith("/services") ? SAMPLE_SERVICES : fresh));
    const { container } = renderPage(stale);
    await vi.waitFor(() =>
      expect(container.querySelector("[data-theme]")).toHaveAttribute("data-theme", "bold"),
    );
  });

  it("doesn't refetch what the server rendered for other visitors", async () => {
    const b = business({ plan: samplePlan("calm"), isDefault: false, context: SAMPLE_CONTEXT });
    const fetchMock = mockApi((_m, path) => (path.endsWith("/services") ? SAMPLE_SERVICES : b));
    renderPage(b);
    expect(await screen.findByRole("heading", { level: 1, name: /Feel at home/ })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const paths = fetchMock.mock.calls.map(([input]) => new URL(String(input), "http://localhost").pathname);
    expect(paths.filter((p) => !p.endsWith("/offers"))).toEqual([]);
  });

  it("shows owners their draft with ?site=draft", async () => {
    auth.isSignedIn = true;
    const b = business({ plan: samplePlan("calm"), isDefault: false, context: SAMPLE_CONTEXT });
    mockApi((_m, path) => {
      if (path.endsWith("/services")) return SAMPLE_SERVICES;
      if (path.endsWith("/site")) return { draft: samplePlan("editorial") };
      return b;
    });
    const { container } = renderPage(b, true);
    await vi.waitFor(() =>
      expect(container.querySelector("[data-theme]")).toHaveAttribute("data-theme", "editorial"),
    );
  });

  it("falls back to the booking flow when the API has no site", async () => {
    const b = business(undefined);
    mockApi((_m, path) => (path.endsWith("/services") ? SAMPLE_SERVICES : b));
    renderPage(b);
    expect(await screen.findByRole("heading", { name: /choose a/i })).toBeInTheDocument();
  });

  it("explains unknown addresses", async () => {
    mockApi(
      () =>
        new Response(
          JSON.stringify({ error: { code: "NOT_FOUND", message: "Business not found.", fields: {} } }),
          { status: 404 },
        ),
    );
    renderPage(null);
    expect(
      await screen.findByRole("heading", { level: 1, name: "This booking page doesn't exist" }),
    ).toBeInTheDocument();
  });

  it("explains services that didn't load, with a retry, instead of loading forever", async () => {
    let fail = true;
    const b = business({ plan: samplePlan("calm"), isDefault: false, context: SAMPLE_CONTEXT });
    mockApi((_m, path) => {
      if (!path.endsWith("/services")) return b;
      if (fail)
        return new Response(JSON.stringify({ error: { code: "INTERNAL", message: "Something broke." } }), {
          status: 500,
        });
      return SAMPLE_SERVICES;
    });
    renderPage(b, false, null);
    expect(await screen.findByRole("heading", { name: "We couldn't load this page" })).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: /Feel at home/ })).toBeInTheDocument();
  });

  it("shows a loading state, then other errors with a retry", async () => {
    let fail = true;
    const b = business({ plan: samplePlan("calm"), isDefault: false, context: SAMPLE_CONTEXT });
    mockApi((_m, path) => {
      if (fail)
        return new Response(JSON.stringify({ error: { code: "INTERNAL", message: "Something broke." } }), {
          status: 500,
        });
      return path.endsWith("/services") ? SAMPLE_SERVICES : b;
    });
    const { container } = renderPage(null);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
    expect(await screen.findByText("Something broke.")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: /Feel at home/ })).toBeInTheDocument();
  });
});
