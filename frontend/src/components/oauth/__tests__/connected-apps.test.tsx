import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectedApp } from "@/lib/api/types";
import { ConnectedAppsPage } from "../connected-apps";
import { apiError, calls, connectedApp, mockApi, renderWithProviders } from "./render";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

/** A stateful fake: DELETE removes the app from the list. */
function fakeApi(initial: ConnectedApp[]) {
  let apps = initial;
  return mockApi((method, path) => {
    if (method === "GET" && path === "/v1/me/connected-apps") return apps;
    const match = path.match(/^\/v1\/me\/connected-apps\/(.+)$/);
    if (method === "DELETE" && match) {
      apps = apps.filter((a) => a.id !== decodeURIComponent(match[1] ?? ""));
      return undefined;
    }
    return apiError(404, "NOT_FOUND", "Not found");
  });
}

describe("Connected apps", () => {
  it("lists apps with hosts, permissions and usage", async () => {
    fakeApi([
      connectedApp(),
      connectedApp({
        id: "grant-2",
        name: "Desktop helper",
        clientUri: null,
        redirectHost: "127.0.0.1",
        scopes: [{ key: "marketplace:read", label: "Search businesses", description: "Find businesses." }],
        lastUsedAt: "2026-09-25T09:00:00Z",
      }),
    ]);
    renderWithProviders(<ConnectedAppsPage />);

    const claude = (await screen.findByRole("heading", { name: "Claude" })).closest("li")!;
    expect(within(claude).getByText("claude.ai")).toBeInTheDocument();
    expect(within(claude).getByText("Returns to claude.ai")).toBeInTheDocument();
    expect(within(claude).getByText("See your bookings")).toBeInTheDocument();
    expect(within(claude).getByText("Book, reschedule and cancel for you")).toBeInTheDocument();
    expect(within(claude).getByText(/Connected 20 Sept? 2026 · Not used yet/)).toBeInTheDocument();

    const helper = screen.getByRole("heading", { name: "Desktop helper" }).closest("li")!;
    expect(within(helper).getByText("Returns to 127.0.0.1")).toBeInTheDocument();
    expect(within(helper).getByText("Search businesses")).toBeInTheDocument();
    expect(within(helper).getByText(/Last used/)).toBeInTheDocument();
  });

  it("says which server each connection is for, and disconnecting a business one says what stays", async () => {
    fakeApi([
      connectedApp(),
      connectedApp({
        id: "grant-3",
        name: "Claude for work",
        audience: "business",
        scopes: [
          { key: "business:read", label: "See your businesses", description: "Schedule and bookings." },
        ],
      }),
    ]);
    renderWithProviders(<ConnectedAppsPage />);
    const personal = (await screen.findByRole("heading", { name: "Claude" })).closest("li")!;
    expect(within(personal).getByText("Your bookings")).toBeInTheDocument();
    const work = screen.getByRole("heading", { name: "Claude for work" }).closest("li")!;
    expect(within(work).getByText("Your businesses")).toBeInTheDocument();
    await userEvent.click(within(work).getByRole("button", { name: "Disconnect Claude for work" }));
    expect(await screen.findByText(/lose access to your businesses straight away/)).toBeInTheDocument();
  });

  it("explains connected apps when there are none", async () => {
    fakeApi([]);
    renderWithProviders(<ConnectedAppsPage />);
    expect(await screen.findByText("No connected apps")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /how to connect an assistant/i })).toHaveAttribute(
      "href",
      "/help/ai-assistant",
    );
  });

  it("disconnects after confirming, then removes the row", async () => {
    const api = fakeApi([
      connectedApp(),
      connectedApp({ id: "grant-2", name: "ChatGPT", clientUri: "https://chatgpt.com" }),
    ]);
    renderWithProviders(<ConnectedAppsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Disconnect Claude" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Disconnect Claude?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Claude" })).not.toBeInTheDocument());
    expect(calls(api)).toContain("DELETE /v1/me/connected-apps/grant-1");
    expect(toast.success).toHaveBeenCalledWith("Claude disconnected");
    expect(screen.getByRole("heading", { name: "ChatGPT" })).toBeInTheDocument();
  });

  it("shows an error with retry when the list fails", async () => {
    mockApi(() => apiError(500, "INTERNAL_SERVER_ERROR", "Something broke on our side"));
    renderWithProviders(<ConnectedAppsPage />);
    expect(await screen.findByText("Something broke on our side")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
