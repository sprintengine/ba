import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { must } from "@/test/must";
import type { AuthorizeCheck } from "@/lib/api/types";
import { AuthorizePage } from "../authorize-page";
import { apiError, authState, calls, mockApi, renderWithProviders, stubLocation } from "./render";

const QUERY =
  "response_type=code&client_id=https%3A%2F%2Fclaude.ai%2Foauth%2Fmcp-oauth-client-metadata" +
  "&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=abc&code_challenge_method=S256" +
  "&scope=bookings%3Aread+bookings%3Awrite&state=st4te&resource=https%3A%2F%2Fbookanything.ie%2Fmcp";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => "/oauth/authorize",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

function consent(patch: { localOnly?: boolean; uri?: string | null } = {}): AuthorizeCheck {
  return {
    type: "consent",
    client: {
      clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
      name: "Claude",
      uri: patch.uri === undefined ? "https://claude.ai" : patch.uri,
      kind: "metadata_document",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      redirectHost: "claude.ai",
      localOnly: patch.localOnly ?? false,
    },
    scopes: [
      { key: "bookings:read", label: "See your bookings", description: "Upcoming and past bookings." },
      {
        key: "bookings:write",
        label: "Book, reschedule and cancel for you",
        description: "Paid bookings still need you to pay yourself.",
      },
    ],
    resource: "https://bookanything.ie/mcp",
    audience: "customer",
    user: { email: "rowan@example.test", name: "Rowan Example" },
    previouslyApproved: false,
  };
}

beforeEach(() => {
  nav.search = QUERY;
  nav.replace.mockReset();
  toast.error.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("OAuth consent page", () => {
  it("shows the app, where you'll be sent back to and the permissions", async () => {
    const api = mockApi((method, path) =>
      method === "GET" && path === "/v1/oauth/authorize" ? consent() : undefined,
    );
    renderWithProviders(<AuthorizePage />);

    expect(
      await screen.findByRole("heading", { name: /claude wants to use your bookanything account/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/you'll be sent back to/i)).toHaveTextContent("You'll be sent back to claude.ai");
    expect(screen.getByRole("link", { name: "claude.ai" })).toHaveAttribute("href", "https://claude.ai");
    expect(screen.getByText("See your bookings")).toBeInTheDocument();
    expect(screen.getByText("Paid bookings still need you to pay yourself.")).toBeInTheDocument();
    expect(screen.getByText("Rowan Example")).toBeInTheDocument();
    expect(screen.queryByText(/only continue if you just started this/i)).not.toBeInTheDocument();

    const [url] = must(api.mock.calls[0], "authorize check call");
    const sent = new URL(String(url), "http://localhost").searchParams;
    expect(sent.get("client_id")).toBe("https://claude.ai/oauth/mcp-oauth-client-metadata");
    expect(sent.get("scope")).toBe("bookings:read bookings:write");
    expect(sent.get("state")).toBe("st4te");
  });

  it("for the business server, lists the businesses it reaches and says changes wait for the user", async () => {
    mockApi(() => ({
      ...consent(),
      audience: "business",
      resource: "https://bookanything.ie/mcp/business",
      scopes: [
        {
          key: "business:read",
          label: "See your businesses",
          description: "Schedule, bookings and customers.",
        },
        {
          key: "business:write",
          label: "Propose changes for you to confirm",
          description: "Nothing changes until you confirm.",
        },
      ],
      businesses: [
        { name: "Lumen Physio", slug: "lumen-physio", role: "owner", aiAgentsAllowed: true },
        { name: "Gleam Car Wash", slug: "gleam", role: "staff", aiAgentsAllowed: false },
      ],
    }));
    renderWithProviders(<AuthorizePage />);

    expect(
      await screen.findByRole("heading", { name: /claude wants to help run your business on bookanything/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Lumen Physio")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Staff")).toBeInTheDocument();
    expect(screen.getByText("Not allowed yet")).toBeInTheDocument();
    expect(
      screen.getByText(/the owner needs to let you use AI agents in Settings › AI agents/),
    ).toBeInTheDocument();
    expect(screen.getByText(/you approve it on bookanything before it happens/i)).toBeInTheDocument();
  });

  it("tells someone with no business there's nothing to connect, and shares nothing", async () => {
    const { replace } = stubLocation();
    mockApi(() =>
      apiError(
        409,
        "POLICY_VIOLATION",
        "You aren't a member of a business on bookanything, so there's nothing for this app to manage.",
      ),
    );
    renderWithProviders(<AuthorizePage />);
    expect(
      await screen.findByRole("heading", { name: "There's no business to connect" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/aren't a member of a business/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set up your business" })).toHaveAttribute("href", "/onboarding");
    expect(replace).not.toHaveBeenCalled();
  });

  it("warns when the app only redirects to this device", async () => {
    mockApi(() => consent({ localOnly: true, uri: null }));
    renderWithProviders(<AuthorizePage />);
    expect(
      await screen.findByText(/only continue if you just started this from an app on this device/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "claude.ai" })).not.toBeInTheDocument();
  });

  it("Allow approves and sends the browser to the returned redirect", async () => {
    const { assign } = stubLocation();
    const api = mockApi((method) =>
      method === "POST"
        ? { redirectTo: "https://claude.ai/api/mcp/auth_callback?code=c0de&state=st4te" }
        : consent(),
    );
    renderWithProviders(<AuthorizePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Allow" }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://claude.ai/api/mcp/auth_callback?code=c0de&state=st4te"),
    );
    const post = api.mock.calls.find(([, init]) => init?.method === "POST");
    const body = JSON.parse(String((post?.[1] as RequestInit).body));
    expect(body.approve).toBe(true);
    expect(body.request).toMatchObject({
      clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
      state: "st4te",
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("Cancel denies and sends the browser back with the error", async () => {
    const { assign } = stubLocation();
    const api = mockApi((method) =>
      method === "POST"
        ? { redirectTo: "https://claude.ai/api/mcp/auth_callback?error=access_denied" }
        : consent(),
    );
    renderWithProviders(<AuthorizePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://claude.ai/api/mcp/auth_callback?error=access_denied"),
    );
    const post = api.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String((post?.[1] as RequestInit).body)).approve).toBe(false);
  });

  it("shows a toast and stays when the decision fails", async () => {
    const { assign } = stubLocation();
    mockApi((method) =>
      method === "POST" ? apiError(500, "INTERNAL_SERVER_ERROR", "Something broke") : consent(),
    );
    renderWithProviders(<AuthorizePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Allow" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Something broke"));
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Allow" })).toBeEnabled();
  });

  it("follows a protocol-error redirect with location.replace", async () => {
    const { replace, assign } = stubLocation();
    mockApi(() => ({
      type: "redirect",
      redirectTo: "https://claude.ai/api/mcp/auth_callback?error=invalid_scope",
    }));
    renderWithProviders(<AuthorizePage />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("https://claude.ai/api/mcp/auth_callback?error=invalid_scope"),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows the error page for an invalid request and never navigates", async () => {
    const { replace, assign } = stubLocation();
    mockApi(() => apiError(400, "INVALID_REQUEST", "This app isn't registered for that redirect address."));
    renderWithProviders(<AuthorizePage />);

    expect(await screen.findByText("This connection link isn't valid")).toBeInTheDocument();
    expect(screen.getByText("This app isn't registered for that redirect address.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("shows the error page without calling the API when client_id is missing", async () => {
    nav.search = "response_type=code&redirect_uri=https%3A%2F%2Fevil.example%2Fcb";
    const api = mockApi(() => consent());
    renderWithProviders(<AuthorizePage />);
    expect(await screen.findByText("This connection link isn't valid")).toBeInTheDocument();
    expect(calls(api)).toEqual([]);
  });

  it("sends signed-out users to sign in and back to this exact URL", async () => {
    const api = mockApi(() => consent());
    renderWithProviders(<AuthorizePage />, authState({ isSignedIn: false, user: null }));

    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith(
        `/sign-in?redirect_url=${encodeURIComponent(`/oauth/authorize?${QUERY}`)}`,
      ),
    );
    expect(calls(api)).toEqual([]);
  });

  it("switch account signs out and returns to this URL after sign-in", async () => {
    const auth = authState();
    mockApi(() => consent());
    renderWithProviders(<AuthorizePage />, auth);
    await userEvent.click(await screen.findByRole("button", { name: /switch account/i }));
    expect(auth.signOut).toHaveBeenCalledWith({
      redirectUrl: `/sign-in?redirect_url=${encodeURIComponent(`/oauth/authorize?${QUERY}`)}`,
    });
  });
});
