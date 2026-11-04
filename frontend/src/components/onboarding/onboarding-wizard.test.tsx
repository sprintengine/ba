import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessSetup } from "@/lib/api/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { must } from "@/test/must";
import { SAMPLE_BUSINESS, SAMPLE_CONTEXT, SAMPLE_SERVICES, samplePlan } from "@/components/site/sample-site";
import { OnboardingWizard } from "./onboarding-wizard";

const setup: BusinessSetup = {
  source: "template",
  name: "Gleam Car Wash",
  slug: null,
  industry: "car_wash",
  description: "Hand car wash and valeting.",
  timezone: "Europe/Dublin",
  currency: "EUR",
  locale: "en-IE",
  country: "IE",
  vocabulary: {
    resource: "Bay",
    resources: "Bays",
    customer: "Customer",
    customers: "Customers",
    booking: "Booking",
    bookings: "Bookings",
  },
  branding: { primaryColor: "#0369a1", logoUrl: null, coverImageUrl: null },
  policies: {
    minNoticeMinutes: 60,
    maxAdvanceDays: 30,
    cancellationNoticeHours: 12,
    lateCancellationRefundPercent: 0,
    allowCustomerCancel: true,
    allowCustomerReschedule: true,
    holdMinutes: 20,
    requireCustomerPhone: true,
    nextAvailableOnly: false,
  },
  customerGroups: [],
  resources: [
    {
      key: "bay-1",
      kind: "space",
      name: "Bay 1",
      description: null,
      capacity: 1,
      weeklyHours: [{ dayOfWeek: 1, startTime: "08:00", endTime: "18:00", audienceGroupKeys: [] }],
    },
  ],
  services: [
    {
      name: "Exterior wash",
      description: null,
      category: "Wash",
      color: "#0ea5e9",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 10,
      slotIntervalMinutes: 15,
      minNoticeMinutes: null,
      maxAdvanceDays: null,
      capacity: 1,
      priceCents: 1500,
      paymentMode: "full",
      depositCents: null,
      requiresApproval: false,
      locationType: "business",
      isPublic: true,
      options: [],
      addons: [],
      requirements: [{ label: "Bay", quantity: 1, customerSelectable: false, resourceKeys: ["bay-1"] }],
      allowedGroupKeys: [],
    },
  ],
  questions: [],
};

const api = vi.hoisted(() => ({
  createBusiness: vi.fn(),
  aiDraft: vi.fn(),
  connect: vi.fn(),
  saveSite: vi.fn(),
  publishSite: vi.fn(),
  generateSite: vi.fn(),
  updateBusiness: vi.fn(),
  /** The created business's deployment has business websites on (the Look step is then the site step). */
  sitesEnabled: false,
  searchParams: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: api.replace, push: vi.fn() }),
  usePathname: () => "/onboarding",
  useSearchParams: () => api.searchParams,
}));

vi.mock("@/lib/api/hooks", () => ({
  useMe: () => {
    const data = { user: { name: "Alex Morgan" }, memberships: [] };
    return { data, refetch: () => Promise.resolve({ data }) };
  },
  useTemplates: () => ({
    isPending: false,
    isError: false,
    data: [
      { key: "car_wash", name: "Car wash and valeting", description: "Washes and valets.", icon: "car" },
      { key: "physio", name: "Physiotherapy clinic", description: "Assessments.", icon: "activity" },
      { key: "generic", name: "Something else", description: "Anything.", icon: "calendar" },
    ],
  }),
  useTemplate: (key: string) =>
    key
      ? { data: { ...setup, source: null }, isError: false, isPending: false, error: null }
      : { data: undefined, isError: false, isPending: false, error: null },
  useSlugAvailability: (slug: string) => ({
    data: slug ? { available: true, suggestion: null } : undefined,
    isFetching: false,
    isError: false,
  }),
  useAiBusinessDraft: () => ({ mutateAsync: api.aiDraft, isPending: false }),
  useCreateBusiness: () => ({ mutateAsync: api.createBusiness, isPending: false }),
  usePaymentsStatus: () => ({
    isPending: false,
    data: { provider: "dev", connected: true, chargesEnabled: true, detailsSubmitted: true },
  }),
  useConnectPayments: () => ({ mutateAsync: api.connect, isPending: false }),
  // "Look" step: the booking page's style, or the site where websites are on.
  useBusiness: () => ({
    data: {
      ...SAMPLE_BUSINESS,
      name: "Gleam Car Wash",
      slug: "gleam-car-wash",
      branding: { ...SAMPLE_BUSINESS.branding, portalStyle: "bold" },
      sitesEnabled: api.sitesEnabled,
    },
  }),
  useUpdateBusiness: () => ({ mutateAsync: api.updateBusiness, isPending: false }),
  usePublicServices: () => ({ data: SAMPLE_SERVICES }),
  useSiteState: () => ({
    isError: false,
    data: { draft: samplePlan("bold"), draftVersion: null, context: SAMPLE_CONTEXT },
  }),
  useSaveSite: () => ({ mutateAsync: api.saveSite, isPending: false }),
  usePublishSite: () => ({ mutateAsync: api.publishSite, isPending: false }),
  useGenerateSite: () => ({ mutateAsync: api.generateSite, isPending: false }),
}));

function renderWizard() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <OnboardingWizard />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.createBusiness.mockReset();
  api.saveSite.mockReset().mockResolvedValue({});
  api.publishSite.mockReset().mockResolvedValue({});
  api.generateSite.mockReset();
  api.updateBusiness.mockReset().mockResolvedValue({});
  api.sitesEnabled = false;
  api.aiDraft.mockReset();
  api.searchParams = new URLSearchParams();
  window.scrollTo = vi.fn();
  api.createBusiness.mockImplementation(async (body: BusinessSetup) => ({
    id: "b1",
    slug: body.slug,
    name: body.name,
    branding: body.branding,
  }));
});

describe("OnboardingWizard", () => {
  it("goes from a template to review to a live business", async () => {
    const user = userEvent.setup();
    renderWizard();
    expect(screen.getByRole("heading", { name: /set up your booking page/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /car wash and valeting/i }));
    expect(await screen.findByRole("heading", { name: "Review your business" })).toBeInTheDocument();
    expect(screen.getByText(/Started from the/)).toHaveTextContent("Car wash and valeting");
    expect(screen.getByLabelText(/business name/i)).toHaveValue("Gleam Car Wash");
    expect(screen.getByLabelText(/booking page address/i)).toHaveValue("gleam-car-wash");

    await user.click(must(screen.getAllByRole("button", { name: "Create business" })[0], "Create button"));
    await waitFor(() => expect(api.createBusiness).toHaveBeenCalledTimes(1));
    expect(api.createBusiness.mock.calls[0]?.[0]).toMatchObject({
      name: "Gleam Car Wash",
      slug: "gleam-car-wash",
    });

    // Look: the booking page's style, skippable.
    expect(await screen.findByRole("heading", { name: "Your booking page" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Bold/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(api.updateBusiness).not.toHaveBeenCalled();

    expect(await screen.findByRole("heading", { name: "Gleam Car Wash is live" })).toBeInTheDocument();
    expect(screen.getByText(/Development payments are on/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard/gleam-car-wash",
    );
  });

  it("saves the booking page style chosen in the Look step", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /car wash and valeting/i }));
    await user.click(
      must((await screen.findAllByRole("button", { name: "Create business" }))[0], "Create button"),
    );
    expect(await screen.findByRole("heading", { name: "Your booking page" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Setup progress" })).toHaveTextContent("Look");
    await user.click(screen.getByRole("radio", { name: /^Editorial/ }));
    await user.click(screen.getByRole("button", { name: /Use this style/ }));

    await waitFor(() => expect(api.updateBusiness).toHaveBeenCalledTimes(1));
    expect(api.updateBusiness.mock.calls[0]?.[0]).toMatchObject({ branding: { portalStyle: "editorial" } });
    expect(api.publishSite).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Gleam Car Wash is live" })).toBeInTheDocument();
  });

  it("publishes the site in the chosen theme from the site step (business websites on)", async () => {
    api.sitesEnabled = true;
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /car wash and valeting/i }));
    await user.click(
      must((await screen.findAllByRole("button", { name: "Create business" }))[0], "Create button"),
    );
    expect(await screen.findByRole("heading", { name: "Your site" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Editorial/ }));
    expect(screen.getByRole("radio", { name: /Editorial/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: /Publish my site/ }));

    await waitFor(() => expect(api.publishSite).toHaveBeenCalledTimes(1));
    expect(api.saveSite.mock.calls[0]?.[0]).toMatchObject({
      plan: { theme: "editorial" },
      baseVersion: null,
    });
    expect(await screen.findByRole("heading", { name: "Gleam Car Wash is live" })).toBeInTheDocument();
  });

  it("drafts with AI, then blocks Create until problems are fixed", async () => {
    const user = userEvent.setup();
    api.aiDraft.mockResolvedValue({ ...setup, source: "ai" });
    renderWizard();

    await user.click(screen.getByRole("button", { name: /describe your business/i }));
    await user.click(screen.getByRole("button", { name: "Car wash" }));
    expect(screen.getByLabelText<HTMLTextAreaElement>(/about your business/i).value).toContain(
      "Gleam Car Wash",
    );
    await user.click(screen.getByRole("button", { name: /draft my setup/i }));

    expect(await screen.findByRole("heading", { name: /drafting your setup/i })).toBeInTheDocument();
    expect(api.aiDraft).toHaveBeenCalledWith(expect.objectContaining({ websiteUrl: null }));
    expect(
      await screen.findByRole("heading", { name: "Review your business" }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Drafted by AI")).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/business name/i));
    expect(screen.getAllByText(/1 thing to fix/).length).toBeGreaterThan(0);
    await user.click(must(screen.getAllByRole("button", { name: "Create business" })[0], "Create button"));
    expect(api.createBusiness).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/business name/i)).toHaveAccessibleDescription(/enter your business name/i);
  });

  it("maps SLUG_TAKEN from the API to the address field", async () => {
    const user = userEvent.setup();
    const { ApiError } = await import("@/lib/api/client");
    api.createBusiness.mockRejectedValue(
      new ApiError(409, "SLUG_TAKEN", "That web address is already taken.", {
        slug: "Taken. Try gleam-car-wash-2",
      }),
    );
    api.searchParams = new URLSearchParams("template=car_wash");
    renderWizard();

    expect(await screen.findByRole("heading", { name: "Review your business" })).toBeInTheDocument();
    expect(api.replace).toHaveBeenCalledWith("/onboarding", { scroll: false });
    await user.click(must(screen.getAllByRole("button", { name: "Create business" })[0], "Create button"));
    await waitFor(() =>
      expect(screen.getByLabelText(/booking page address/i)).toHaveAccessibleDescription(
        /Taken\. Try gleam-car-wash-2/,
      ),
    );
  });

  it("restores an in-progress draft after a refresh", async () => {
    const user = userEvent.setup();
    const first = renderWizard();
    await user.click(screen.getByRole("button", { name: /car wash and valeting/i }));
    const name = await screen.findByLabelText(/business name/i);
    await user.clear(name);
    await user.type(name, "Gleam Galway");
    first.unmount();

    renderWizard();
    expect(await screen.findByLabelText(/business name/i)).toHaveValue("Gleam Galway");
    expect(screen.getByLabelText(/booking page address/i)).toHaveValue("gleam-galway");
  });
});
