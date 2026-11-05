/** OAuth screens: loading, error and returning states, keyboard use, and axe on each. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizeCheck } from "@/lib/api/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { expectNoAxeViolations } from "@/test/axe";
import { AuthorizePage } from "../authorize-page";
import { ConnectedAppsPage } from "../connected-apps";
import { ServerUrlField } from "../server-url-field";
import { apiError, calls, connectedApp, mockApi, renderWithProviders, stubLocation } from "./render";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => "/oauth/authorize",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

const QUERY =
  "response_type=code&client_id=https%3A%2F%2Fchatgpt.com%2Fclient&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcb" +
  "&code_challenge=abc&code_challenge_method=S256&scope=bookings%3Aread+marketplace%3Aread+other%3Ascope&state=s";

const consent: AuthorizeCheck = {
  type: "consent",
  client: {
    clientId: "https://chatgpt.com/client",
    name: "ChatGPT",
    uri: "https://chatgpt.com",
    kind: "metadata_document",
    redirectUri: "https://chatgpt.com/cb",
    redirectHost: "chatgpt.com",
    localOnly: false,
  },
  scopes: [
    { key: "bookings:read", label: "See your bookings", description: "Upcoming and past bookings." },
    { key: "marketplace:read", label: "Search businesses", description: "Find businesses to book." },
    { key: "other:scope", label: "Something new", description: "A permission this screen has no icon for." },
  ],
  resource: "https://bookanything.ie/mcp",
  audience: "customer",
  user: { email: "rowan@example.test", name: null },
  previouslyApproved: true,
};

/** A fetch that never answers, to hold a query in its loading state. */
const pending = () => new Promise<Response>(() => {});

beforeEach(() => {
  nav.search = QUERY;
  nav.replace.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("Consent page states", () => {
  it("is a labelled, axe-clean placeholder while the request is checked", async () => {
    vi.stubGlobal("fetch", vi.fn(pending));
    const { container } = renderWithProviders(<AuthorizePage />);
    expect(await screen.findByRole("status", { name: "Loading connection request" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("is axe-clean and fully usable from the keyboard", async () => {
    const user = userEvent.setup();
    const { assign } = stubLocation();
    mockApi((method) => (method === "POST" ? { redirectTo: "https://chatgpt.com/cb?code=c" } : consent));
    const { container } = renderWithProviders(<AuthorizePage />);

    expect(
      await screen.findByRole("heading", { level: 1, name: /chatgpt wants to use/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("You've connected this app before")).toBeInTheDocument();
    expect(screen.getByText("rowan@example.test")).toBeInTheDocument();
    const permissions = screen.getByRole("heading", { level: 2, name: "This will let ChatGPT:" });
    expect(permissions).toBeInTheDocument();
    expect(screen.getByText("Something new")).toBeInTheDocument();
    await expectNoAxeViolations(container);

    // Tab order: website, switch account, Connected apps, Cancel, Allow.
    await user.tab();
    expect(screen.getByRole("link", { name: "chatgpt.com" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /switch account/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Connected apps" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Allow" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://chatgpt.com/cb?code=c"));
    expect(screen.getByRole("button", { name: /^Allow/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("shows a retryable error when the check fails for another reason", async () => {
    const user = userEvent.setup();
    let fail = true;
    const api = mockApi(() =>
      fail ? apiError(500, "INTERNAL_SERVER_ERROR", "The authorization server is unwell") : consent,
    );
    const { container } = renderWithProviders(<AuthorizePage />);

    expect(await screen.findByText("We couldn't load this request")).toBeInTheDocument();
    expect(screen.getByText("The authorization server is unwell")).toBeInTheDocument();
    await expectNoAxeViolations(container);

    fail = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("button", { name: "Allow" })).toBeInTheDocument();
    expect(calls(api).filter((c) => c === "GET /v1/oauth/authorize")).toHaveLength(2);
  });

  it("announces that it is returning to the app on a protocol-error redirect", async () => {
    const { replace } = stubLocation();
    mockApi(() => ({ type: "redirect", redirectTo: "https://chatgpt.com/cb?error=invalid_scope" }));
    renderWithProviders(<AuthorizePage />);
    const returning = await screen.findByText(/Returning you to the app…/);
    expect(returning).toHaveAttribute("role", "status");
    expect(replace).toHaveBeenCalledWith("https://chatgpt.com/cb?error=invalid_scope");
  });

  it("is axe-clean when the link is invalid", async () => {
    mockApi(() => apiError(400, "INVALID_REQUEST", "Unknown app."));
    const { container } = renderWithProviders(<AuthorizePage />);
    expect(await screen.findByText("This connection link isn't valid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my bookings" })).toHaveAttribute("href", "/my/bookings");
    await expectNoAxeViolations(container);
  });
});

describe("Connected apps states", () => {
  it("is a labelled placeholder while loading", async () => {
    vi.stubGlobal("fetch", vi.fn(pending));
    const { container } = renderWithProviders(<ConnectedAppsPage />);
    expect(screen.getByRole("status", { name: "Loading connected apps" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("is axe-clean with apps listed and when empty", async () => {
    mockApi(() => [connectedApp()]);
    const { container, unmount } = renderWithProviders(<ConnectedAppsPage />);
    expect(await screen.findByRole("heading", { name: "Claude" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Permissions" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
    unmount();

    mockApi(() => []);
    const empty = renderWithProviders(<ConnectedAppsPage />);
    expect(await screen.findByText("No connected apps")).toBeInTheDocument();
    await expectNoAxeViolations(empty.container);
  });

  it("confirms in an axe-clean dialog that Escape dismisses without disconnecting", async () => {
    const user = userEvent.setup();
    const api = mockApi(() => [connectedApp()]);
    renderWithProviders(<ConnectedAppsPage />);

    const trigger = await screen.findByRole("button", { name: "Disconnect Claude" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("alertdialog", { name: "Disconnect Claude?" });
    expect(dialog).toHaveAccessibleDescription(/lose access to your bookanything account straight away/);
    await expectNoAxeViolations(document.body);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(calls(api)).not.toContain("DELETE /v1/me/connected-apps/grant-1");
  });

  it("keeps the app and says so when disconnecting fails", async () => {
    const user = userEvent.setup();
    mockApi((method) =>
      method === "DELETE" ? apiError(500, "INTERNAL_SERVER_ERROR", "Down") : [connectedApp()],
    );
    renderWithProviders(<ConnectedAppsPage />);
    await user.click(await screen.findByRole("button", { name: "Disconnect Claude" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Disconnect" }));

    // The dialog stays open to retry or cancel.
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Down"));
    expect(within(dialog).getByRole("button", { name: "Disconnect" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("heading", { name: "Claude" })).toBeInTheDocument();
  });
});

describe("Server URL field", () => {
  it("says when the URL couldn't be copied", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://bookanything.ie");
    const { container } = render(
      <TooltipProvider>
        <ServerUrlField path="/mcp" label="Your server URL" />
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
      configurable: true,
    });
    await user.click(screen.getByRole("button", { name: "Copy your server URL" }));
    expect(toast.error).toHaveBeenCalledWith("Couldn't copy. Select the address and copy it yourself.");
    await expectNoAxeViolations(container);
    vi.unstubAllEnvs();
  });
});
