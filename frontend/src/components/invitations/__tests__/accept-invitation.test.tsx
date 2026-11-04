import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { json, mockApi } from "@/components/dashboard/test/render";
import { AcceptInvitation } from "../accept-invitation";

const push = vi.fn();
const signOut = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/invitations/tok",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/context", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: { id: "u1", email: "rowan@example.test", name: "Rowan" },
    getToken: async () => null,
    signOut,
    mode: "dev",
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  push.mockReset();
  signOut.mockClear();
});

const branding = { primaryColor: "#0f766e", logoUrl: null, coverImageUrl: null };
const me = (memberships: { businessId: string; slug: string; name: string }[]) => ({
  user: { id: "u1", email: "rowan@example.test", name: "Rowan", emailVerified: true },
  memberships: memberships.map((m) => ({ ...m, role: "staff", branding })),
  pendingInvitations: [],
  hasCustomerBookings: false,
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AcceptInvitation token="tok" />
    </QueryClientProvider>,
  );
}

/** The accept endpoint's answer: `me` with [memberships], having joined [joined]. */
const accepted = (memberships: Parameters<typeof me>[0], joined: { businessId: string }) => ({
  ...me(memberships),
  joinedBusinessId: joined.businessId,
});

const error = (status: number, code: string, message: string) =>
  json({ error: { code, message, fields: {} } }, status);

/** The API: `me` answers with [memberships]; accepting answers with [accept]. */
function api(memberships: Parameters<typeof me>[0], accept: () => unknown) {
  return mockApi((method, path) => {
    if (path === "/v1/me") return me(memberships);
    if (method === "POST" && path === "/v1/invitations/tok/accept") return accept();
    return undefined;
  });
}

const gleam = { businessId: "b2", slug: "gleam", name: "Gleam Car Wash" };
const lumen = { businessId: "b1", slug: "lumen", name: "Lumen Physio" };

describe("AcceptInvitation", () => {
  it("accepts once and names the business joined", async () => {
    const accept = vi.fn(() =>
      accepted([{ businessId: "b2", slug: "gleam", name: "Gleam Car Wash" }], { businessId: "b2" }),
    );
    mockApi((method, path) => {
      if (path === "/v1/me") return me([]);
      if (method === "POST" && path === "/v1/invitations/tok/accept") return accept();
      return undefined;
    });
    renderPage();
    expect(await screen.findByRole("heading", { name: "You've joined Gleam Car Wash" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open dashboard" })).toHaveAttribute("href", "/dashboard/gleam");
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it("explains an invitation that isn't valid and offers another account", async () => {
    mockApi((method, path) => {
      if (path === "/v1/me") return me([]);
      return new Response(
        JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found.", fields: {} } }),
        {
          status: 404,
        },
      );
    });
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "This invitation isn't valid anymore" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/different email than rowan@example.test/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my bookings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use a different account" })).toBeInTheDocument();
  });

  it("says it's joining while the account loads, axe-clean", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const { container } = renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Joining the team…" })).toBeInTheDocument();
    expect(screen.getByText("Setting up your access. This only takes a moment.")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("opens the new business's dashboard after a moment", async () => {
    const timeouts = vi.spyOn(window, "setTimeout");
    api([lumen], () => accepted([lumen, gleam], gleam));
    const { container } = renderPage();
    expect(await screen.findByRole("heading", { name: "You've joined Gleam Car Wash" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
    expect(push).not.toHaveBeenCalled();

    const redirect = must(
      timeouts.mock.calls.find(([, delay]) => delay === 1400),
      "the redirect timer",
    )[0];
    act(() => redirect());
    expect(push).toHaveBeenCalledWith("/dashboard/gleam");
  });

  it("doesn't redirect after the page is left", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api([lumen], () => accepted([lumen, gleam], gleam));
    const { unmount } = renderPage();
    expect(await screen.findByRole("heading", { name: "You've joined Gleam Car Wash" })).toBeInTheDocument();
    unmount();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(push).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  // Signing in accepts invitations for the user's email (/v1/me), usually before the emailed link is opened.
  it("names the business when signing in already accepted the invitation", async () => {
    api([lumen, gleam], () => accepted([lumen, gleam], gleam));
    renderPage();
    expect(await screen.findByRole("heading", { name: "You've joined Gleam Car Wash" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open dashboard" })).toHaveAttribute("href", "/dashboard/gleam");
  });

  it("falls back to the dashboard chooser when the business joined isn't listed", async () => {
    api([gleam], () => accepted([gleam], { businessId: "b9" }));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Invitation accepted" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("sends a member who is already on the team to the dashboard", async () => {
    api([gleam], () => error(409, "CONFLICT", "Already a member."));
    const { container } = renderPage();
    expect(await screen.findByRole("heading", { name: "You're already on the team" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("button", { name: "Use a different account" })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("explains an invitation someone else used to a member, and offers their dashboard", async () => {
    api([gleam], () => error(404, "NOT_FOUND", "Not found."));
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "This invitation isn't valid anymore" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/used by another account or withdrawn/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toBeInTheDocument();
  });

  it("explains a full team, and signs out to use a different account", async () => {
    api([], () => error(402, "PLAN_LIMIT_REACHED", "This team has reached its plan's limit."));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("heading", { name: "The team is full" })).toBeInTheDocument();
    expect(screen.getByText("This team has reached its plan's limit.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use a different account" }));
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/sign-in?redirect_url=%2Finvitations%2Ftok" });
  });
});
