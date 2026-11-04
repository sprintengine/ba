import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Business, Membership } from "@/lib/api/types";
import { credits } from "@/components/assistant/__tests__/fake-assistant-api";
import { business, me, mockApi } from "@/components/dashboard/test/render";
import BusinessDashboardLayout from "./layout";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ slug: "lumen-physio" }),
}));
vi.mock("@/lib/auth/context", () => ({ useAuth: () => ({ signOut: vi.fn(), user: null, mode: "dev" }) }));
vi.mock("@/components/common/theme-toggle", () => ({ useThemeChoice: () => ({ setTheme: vi.fn() }) }));
// The shell's user menu and bell are other features'; these tests are about Bo.
vi.mock("@/components/shells/user-menu", () => ({ UserMenu: () => null }));
vi.mock("@/components/notifications/notification-bell", () => ({ NotificationBell: () => null }));

// ⌘K and Bo's panel load on demand; transforming them the first time takes longer than findBy waits.
beforeAll(
  () =>
    Promise.all([
      import("@/components/shells/command-menu"),
      import("@/components/assistant/assistant-panel"),
    ]),
  60_000,
);
afterEach(() => vi.unstubAllGlobals());

const membership: Membership = {
  businessId: business.id,
  slug: business.slug,
  name: business.name,
  role: "owner",
  branding: business.branding,
};

function renderLayout(patch: Partial<Business>) {
  const fetchMock = mockApi((_method, path) => {
    if (path === "/v1/me") return { ...me, memberships: [membership] };
    if (path.endsWith("/assistant"))
      return { configured: true, credits: credits(), nudges: [], threads: [], canEditMemory: true };
    if (path.startsWith("/v1/businesses/") && !path.slice("/v1/businesses/".length).includes("/")) {
      return { ...business, ...patch };
    }
    return {};
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BusinessDashboardLayout>
        <p>the page</p>
      </BusinessDashboardLayout>
    </QueryClientProvider>,
  );
  const asked = () =>
    fetchMock.mock.calls.map(([input]) => new URL(String(input), "http://localhost").pathname);
  return { asked };
}

const press = (key: string) => act(() => void fireEvent.keyDown(window, { key, metaKey: true }));

describe("the dashboard chrome", () => {
  it("has no trace of Bo where the deployment doesn't offer it", async () => {
    const { asked } = renderLayout({ assistantAvailable: false });
    expect(await screen.findByText("the page")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Open Bo/ })).not.toBeInTheDocument();

    // ⌘J does nothing; ⌘K opens without "Ask Bo…". ⌘K loads after the page as Bo's panel would, so once it's up
    // the only dialog is the menu.
    press("j");
    press("k");
    expect(await screen.findByRole("option", { name: /New appointment/ })).toBeInTheDocument();
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).not.toHaveTextContent(/Ask Bo/);
    // Nor is Bo's state asked for: those routes aren't there.
    expect(asked().filter((p) => p.endsWith("/assistant"))).toEqual([]);
  });

  it("has the launcher, ⌘J and ⌘K's \"Ask Bo…\" where it's offered", async () => {
    const { asked } = renderLayout({ assistantAvailable: true });
    expect(await screen.findByRole("button", { name: /^Open Bo/ })).toBeInTheDocument();
    await waitFor(() => expect(asked()).toContain("/api/v1/businesses/b1/assistant"));

    press("k");
    expect(await screen.findByRole("option", { name: /Ask Bo…/ })).toBeInTheDocument();
    press("k");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    press("j");
    expect(await screen.findByRole("dialog", { name: /Bo/ })).toBeInTheDocument();
  });
});
