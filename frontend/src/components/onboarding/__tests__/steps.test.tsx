/** The wizard's other steps on their own: Start, Describe, Your site, Success, and the header actions. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { AuthContext } from "@/lib/auth/context";
import { authState } from "@/components/oauth/__tests__/render";
import { SAMPLE_BUSINESS, SAMPLE_CONTEXT, SAMPLE_SERVICES, samplePlan } from "@/components/site/sample-site";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { DescribeStep } from "../describe-step";
import type { CreatedBusiness } from "../draft-storage";
import { OnboardingHeaderActions } from "../onboarding-header-actions";
import { SiteStep } from "../site-step";
import { StartStep } from "../start-step";
import { SuccessStep } from "../success-step";
import { fixture, withProviders, paste } from "./render";

/** What each mocked hook returns; tests change it before rendering. */
type Hooks = {
  memberships: unknown[];
  templates: Record<string, unknown>;
  site: Record<string, unknown>;
  business: Record<string, unknown>;
  payments: Record<string, unknown>;
};
const api = vi.hoisted(() => {
  const hooks: Hooks = { memberships: [], templates: {}, site: {}, business: {}, payments: {} };
  return {
    ...hooks,
    aiDraft: vi.fn(),
    saveSite: vi.fn(),
    publishSite: vi.fn(),
    generateSite: vi.fn(),
    connect: vi.fn(),
  };
});

vi.mock("@/lib/api/hooks", () => ({
  useMe: () => ({ data: { user: { name: "Alex Morgan" }, memberships: api.memberships } }),
  useTemplates: () => api.templates,
  useAiBusinessDraft: () => ({ mutateAsync: api.aiDraft, isPending: false }),
  useBusiness: () => api.business,
  usePublicServices: () => ({ data: SAMPLE_SERVICES }),
  useSiteState: () => api.site,
  useSaveSite: () => ({ mutateAsync: api.saveSite, isPending: false }),
  usePublishSite: () => ({ mutateAsync: api.publishSite, isPending: false }),
  useGenerateSite: () => ({ mutateAsync: api.generateSite, isPending: false }),
  usePaymentsStatus: () => api.payments,
  useConnectPayments: () => ({ mutateAsync: api.connect, isPending: false }),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

const TEMPLATES = [
  { key: "car_wash", name: "Car wash and valeting", description: "Washes and valets.", icon: "car" },
  { key: "physio", name: "Physiotherapy clinic", description: "Assessments.", icon: "activity" },
  { key: "generic", name: "Something else", description: "Anything.", icon: "calendar" },
];

const created: CreatedBusiness = {
  id: "b1",
  slug: "gleam-car-wash",
  name: "Gleam Car Wash",
  primaryColor: "#0369a1",
  hasPaidServices: true,
};

beforeEach(() => {
  api.memberships = [];
  api.templates = { isPending: false, isError: false, data: TEMPLATES, refetch: vi.fn() };
  api.aiDraft.mockReset();
  api.site = {
    isError: false,
    data: { draft: samplePlan("bold"), draftVersion: 3, context: SAMPLE_CONTEXT },
    refetch: vi.fn(),
  };
  api.business = { data: { ...SAMPLE_BUSINESS, name: "Gleam Car Wash", description: "Hand car wash." } };
  api.saveSite.mockReset().mockResolvedValue({});
  api.publishSite.mockReset().mockResolvedValue({});
  api.generateSite.mockReset();
  api.payments = {
    isPending: false,
    data: { provider: "stripe", connected: false, chargesEnabled: false, detailsSubmitted: false },
  };
  api.connect.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("Start step", () => {
  it("greets the owner, offers AI first and lists the templates", async () => {
    const user = userEvent.setup();
    const onDescribe = vi.fn();
    const onPickTemplate = vi.fn();
    const { container } = render(
      withProviders(
        <StartStep
          onDescribe={onDescribe}
          onPickTemplate={onPickTemplate}
          pendingTemplate={null}
          templateError={null}
        />,
      ),
    );
    expect(screen.getByText("Welcome, Alex")).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole("button", { name: /describe your business/i }));
    expect(onDescribe).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /physiotherapy clinic/i }));
    expect(onPickTemplate).toHaveBeenCalledWith("physio");
    await user.click(screen.getByRole("button", { name: /something else\?/i }));
    expect(onPickTemplate).toHaveBeenLastCalledWith("generic");
  });

  it("shows a loading template as busy and the others disabled, and explains a template that failed", () => {
    render(
      withProviders(
        <StartStep
          onDescribe={vi.fn()}
          onPickTemplate={vi.fn()}
          pendingTemplate="physio"
          templateError='We couldn&apos;t find the "spa" template.'
        />,
      ),
    );
    expect(screen.getByRole("button", { name: /physiotherapy clinic/i })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("button", { name: /car wash and valeting/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't find/);
  });

  it("is axe-clean while templates load, and offers a retry when they fail", async () => {
    api.templates = { isPending: true, isError: false, data: undefined, refetch: vi.fn() };
    const props = {
      onDescribe: vi.fn(),
      onPickTemplate: vi.fn(),
      pendingTemplate: null,
      templateError: null,
    };
    const { container, unmount } = render(withProviders(<StartStep {...props} />));
    await expectNoAxeViolations(container);
    expect(screen.getByRole("status", { name: "Loading templates" })).toBeInTheDocument();
    unmount();

    const refetch = vi.fn();
    api.templates = { isPending: false, isError: true, error: new Error("offline"), refetch };
    render(withProviders(<StartStep {...props} />));
    expect(screen.getByText(/You can still describe your business above/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("Describe step", () => {
  function renderDescribe(onDraft = vi.fn(), onBack = vi.fn()) {
    const view = render(
      withProviders(
        <DescribeStep initial={{ description: "", websiteUrl: "" }} onBack={onBack} onDraft={onDraft} />,
      ),
    );
    return { ...view, onDraft, onBack };
  }

  it("validates the description and website before drafting", async () => {
    const user = userEvent.setup();
    const { container } = renderDescribe();
    await user.click(screen.getByRole("button", { name: /draft my setup/i }));

    const about = screen.getByRole("textbox", { name: /about your business/i });
    expect(about).toHaveAttribute("aria-invalid", "true");
    expect(about).toHaveAccessibleDescription(/Tell us a little more/);
    await expectNoAxeViolations(container);

    await paste(user, about, "We wash cars by hand in Galway, from €15.");
    const website = screen.getByRole("textbox", { name: /your website/i });
    await user.type(website, "not a url");
    await user.click(screen.getByRole("button", { name: /draft my setup/i }));
    expect(website).toHaveAccessibleDescription(/Enter a web address like example.ie/);
    expect(about).not.toHaveAttribute("aria-invalid");
    expect(api.aiDraft).not.toHaveBeenCalled();
  });

  it("marks the chosen example as pressed", async () => {
    const user = userEvent.setup();
    renderDescribe();
    const physio = screen.getByRole("button", { name: "Physio clinic" });
    expect(physio).toHaveAttribute("aria-pressed", "false");
    await user.click(physio);
    expect(physio).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: /about your business/i })).toHaveDisplayValue(
      /Lumen Physiotherapy/,
    );
  });

  it("puts server field errors under their fields", async () => {
    const user = userEvent.setup();
    api.aiDraft.mockRejectedValue(
      new ApiError(400, "INVALID_REQUEST", "Check the highlighted fields.", {
        websiteUrl: "We couldn't open that website",
      }),
    );
    renderDescribe();
    await user.click(screen.getByRole("button", { name: "Car wash" }));
    await paste(user, screen.getByRole("textbox", { name: /your website/i }), "gleam.ie");
    await user.click(screen.getByRole("button", { name: /draft my setup/i }));

    const website = await screen.findByRole("textbox", { name: /your website/i });
    await waitFor(() => expect(website).toHaveAccessibleDescription(/We couldn't open that website/));
    expect(website).toHaveAttribute("aria-invalid", "true");
    expect(api.aiDraft).toHaveBeenCalledWith(expect.objectContaining({ websiteUrl: "https://gleam.ie" }));
  });

  it("explains a rate limit and offers templates instead", async () => {
    const user = userEvent.setup();
    api.aiDraft.mockRejectedValue(new ApiError(429, "RATE_LIMITED", "Too many requests"));
    const { onBack } = renderDescribe();
    await user.click(screen.getByRole("button", { name: "Yoga studio" }));
    await user.click(screen.getByRole("button", { name: /draft my setup/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/drafted a lot in a short time/);

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe("Your site step", () => {
  it("is busy while loading", async () => {
    api.business = { data: undefined };
    const { container } = render(withProviders(<SiteStep created={created} onDone={vi.fn()} />));
    await expectNoAxeViolations(container);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("shows the error with a retry when the site can't load", async () => {
    const refetch = vi.fn();
    api.site = {
      isError: true,
      error: new ApiError(500, "INTERNAL_SERVER_ERROR", "Site store is down"),
      refetch,
    };
    render(withProviders(<SiteStep created={created} onDone={vi.fn()} />));
    expect(screen.getByText("Site store is down")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("is axe-clean with the theme picker and the live preview", async () => {
    const { container } = render(withProviders(<SiteStep created={created} onDone={vi.fn()} />));
    expect(screen.getByRole("heading", { level: 1, name: "Your site" })).toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("generates a design with AI from the description", async () => {
    const user = userEvent.setup();
    api.generateSite
      .mockResolvedValueOnce({ source: "ai" })
      .mockRejectedValueOnce(new ApiError(402, "AI_LIMIT_REACHED", "You've used this month's AI credits."));
    render(withProviders(<SiteStep created={created} onDone={vi.fn()} />));
    expect(screen.getByRole("region", { name: "Site preview" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /generate with ai/i }));
    expect(api.generateSite).toHaveBeenCalledWith({ prompt: "Hand car wash." });
    expect(toast.success).toHaveBeenCalledWith("Here's a design made for you");

    await user.click(screen.getByRole("button", { name: /generate with ai/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You've used this month's AI credits."));
  });

  it("stays on the step when publishing fails", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    api.publishSite.mockRejectedValue(new ApiError(409, "CONFLICT", "Someone else changed the site."));
    render(withProviders(<SiteStep created={created} onDone={onDone} />));
    await user.click(screen.getByRole("button", { name: /publish my site/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Someone else changed the site."));
    expect(api.saveSite).toHaveBeenCalledWith(expect.objectContaining({ baseVersion: 3 }));
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("Success step", () => {
  const renderSuccess = (business: CreatedBusiness = created, onLeave = vi.fn()) => ({
    ...render(withProviders(<SuccessStep business={business} onLeave={onLeave} />)),
    onLeave,
  });

  it("copies the booking page link and announces it", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const { container } = renderSuccess();
    expect(screen.getByRole("heading", { name: "Gleam Car Wash is live" })).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.click(must(screen.getAllByRole("button", { name: "Copy link" })[0], "Copy link"));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/gleam-car-wash`);
    expect(await screen.findByText("Link copied to clipboard")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /copied/i }).length).toBeGreaterThan(0);
  });

  it("says when the link couldn't be copied", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    renderSuccess();
    await user.click(must(screen.getAllByRole("button", { name: "Copy link" })[0], "Copy link"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Couldn't copy/)));
  });

  it("leaves for the dashboard", async () => {
    const { onLeave } = renderSuccess();
    const link = screen.getByRole("link", { name: /go to dashboard/i });
    expect(link).toHaveAttribute("href", "/dashboard/gleam-car-wash");
    await userEvent.click(link);
    expect(onLeave).toHaveBeenCalled();
  });

  it("sends the owner to Stripe to set up payments for paid services", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, origin: window.location.origin, assign });
    api.connect.mockResolvedValue({ url: "https://connect.stripe.test/onboard" });
    const { onLeave } = renderSuccess();
    expect(screen.getByText("Needed for paid services")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /set up payments/i }));
    expect(api.connect).toHaveBeenCalledWith({
      returnUrl: `${window.location.origin}/dashboard/gleam-car-wash/settings/payments`,
    });
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://connect.stripe.test/onboard"));
    // The saved onboarding is cleared first, so it doesn't reopen this screen later.
    expect(onLeave).toHaveBeenCalled();
    expect(must(onLeave.mock.invocationCallOrder[0], "onLeave call")).toBeLessThan(
      must(assign.mock.invocationCallOrder[0], "assign call"),
    );
  });

  it("explains when payments aren't configured on the server", async () => {
    const user = userEvent.setup();
    api.connect.mockRejectedValue(new ApiError(503, "PAYMENTS_NOT_CONFIGURED", "Not configured"));
    renderSuccess();
    await user.click(screen.getByRole("button", { name: /set up payments/i }));
    expect(await screen.findByText("Online payments aren't available here")).toBeInTheDocument();
    expect(screen.getByText(/Free and pay-at-venue services work as normal/)).toBeInTheDocument();
  });

  it("shows other payment errors as a toast", async () => {
    const user = userEvent.setup();
    api.connect.mockRejectedValue(new ApiError(500, "INTERNAL_SERVER_ERROR", "Stripe is down"));
    renderSuccess({ ...created, hasPaidServices: false });
    expect(screen.queryByText("Needed for paid services")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /set up payments/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Stripe is down"));
  });

  it("shows connected payments, and loads quietly", () => {
    api.payments = {
      isPending: false,
      data: { provider: "stripe", connected: true, chargesEnabled: true, detailsSubmitted: true },
    };
    const { unmount } = renderSuccess();
    expect(screen.getByText("Payments are ready")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Customers can pay online when they book.")).toBeInTheDocument();
    unmount();

    api.payments = { isPending: true, data: undefined };
    renderSuccess();
    expect(screen.queryByText("Payments are ready")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set up payments/i })).not.toBeInTheDocument();
  });

  it("names the server without payments up front", () => {
    api.payments = { isPending: false, data: { provider: "none", connected: false, chargesEnabled: false } };
    renderSuccess({ ...created, hasPaidServices: false });
    expect(screen.getByText("Online payments aren't available here")).toBeInTheDocument();
    expect(screen.queryByText(/Free and pay-at-venue/)).not.toBeInTheDocument();
  });
});

describe("Onboarding header actions", () => {
  const renderActions = () =>
    render(
      withProviders(
        <AuthContext.Provider value={authState()}>
          <OnboardingHeaderActions />
        </AuthContext.Provider>,
      ),
    );

  it("offers the dashboard only to people who already have a business", () => {
    const { unmount } = renderActions();
    expect(screen.queryByRole("link", { name: "Back to dashboard" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    unmount();

    api.memberships = [{ business: fixture() }];
    renderActions();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/dashboard");
  });
});
