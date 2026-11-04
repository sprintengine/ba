import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { qk } from "@/lib/api/query-keys";
import type { Membership } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardRoot, type DashboardChrome } from "../dashboard-root";
import { business, json, me, mockApi } from "./render";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/dashboard/lumen-physio/settings/general",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ slug: "lumen-physio" }),
}));

// The shell's user menu needs the auth provider; it is not what these tests are about.
vi.mock("@/components/shells/user-menu", () => ({ UserMenu: () => null }));

afterEach(() => {
  vi.unstubAllGlobals();
  router.replace.mockReset();
});

const membership = {
  businessId: "b1",
  slug: "lumen-physio",
  name: business.name,
  role: "admin",
  branding: { primaryColor: "#0e7c70", logoUrl: null },
} as Membership;

const Chrome: DashboardChrome = ({ role, children }) => (
  <div>
    <p>chrome for {role}</p>
    {children}
  </div>
);

function Page() {
  return <p>page of {useCurrentBusiness().name}</p>;
}

function renderRoot() {
  // Fresh for 30 s, as in the app (lib/api/query-provider.tsx): the business read by slug is still fresh when the
  // membership is known, so it isn't read again by id.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <DashboardRoot Chrome={Chrome}>
          <Page />
        </DashboardRoot>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

describe("DashboardRoot", () => {
  it("renders the page in the chrome with the business's context and its own role", async () => {
    mockApi((method, path) => (path === "/v1/me" ? { ...me, memberships: [membership] } : business));
    renderRoot();
    expect(await screen.findByText("page of Lumen Physiotherapy")).toBeInTheDocument();
    expect(screen.getByText("chrome for owner")).toBeInTheDocument();
  });

  it("asks for the business by its slug alongside /me, not after it, and doesn't ask again by id", async () => {
    let answerMe: () => void = () => {};
    const meAnswered = new Promise<void>((resolve) => (answerMe = resolve));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://localhost").pathname.replace(/^\/api/, "");
      if (path === "/v1/me") {
        await meAnswered;
        return json({ ...me, memberships: [membership] });
      }
      return json(business);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderRoot();
    const paths = () =>
      fetchMock.mock.calls.map(([input]) => new URL(String(input), "http://localhost").pathname);

    // /me hasn't answered, and the business is already on its way.
    await waitFor(() => expect(paths()).toContain("/api/v1/businesses/lumen-physio"));
    expect(screen.queryByText(/page of/)).not.toBeInTheDocument();

    answerMe();
    expect(await screen.findByText("page of Lumen Physiotherapy")).toBeInTheDocument();
    // (The bell asks for notifications on its own; it doesn't hold up the page.)
    expect(
      paths()
        .filter((p) => p !== "/api/v1/me/notifications")
        .sort(),
    ).toEqual(["/api/v1/businesses/lumen-physio", "/api/v1/me"]);
  });

  it("reads the business by id when the slug doesn't lead to it", async () => {
    const fetchMock = mockApi((method, path) => {
      if (path === "/v1/me") return { ...me, memberships: [membership] };
      if (path === "/v1/businesses/lumen-physio")
        return json({ error: { code: "NOT_FOUND", message: "Business not found" } }, 404);
      return business;
    });
    renderRoot();
    expect(await screen.findByText("page of Lumen Physiotherapy")).toBeInTheDocument();
    const paths = fetchMock.mock.calls.map(([input]) => new URL(String(input), "http://localhost").pathname);
    expect(paths).toContain("/api/v1/businesses/b1");
  });

  it("follows its business to a new address (Settings → General) instead of saying it's not a member", async () => {
    let memberships = [membership];
    mockApi((method, path) => (path === "/v1/me" ? { ...me, memberships } : business));
    const { client } = renderRoot();
    expect(await screen.findByText("page of Lumen Physiotherapy")).toBeInTheDocument();

    // The address changed: `me` comes back with the new slug while the URL still has the old one.
    memberships = [{ ...membership, slug: "lumen-2" }];
    await act(() => client.invalidateQueries({ queryKey: qk.me() }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard/lumen-2/settings/general"));
    expect(screen.getByText("page of Lumen Physiotherapy")).toBeInTheDocument();
    expect(screen.queryByText("Business not found")).not.toBeInTheDocument();
  });

  it("still says it's not a member when the business at this address goes away", async () => {
    let memberships = [membership];
    mockApi((method, path) => (path === "/v1/me" ? { ...me, memberships } : business));
    const { client } = renderRoot();
    expect(await screen.findByText("page of Lumen Physiotherapy")).toBeInTheDocument();

    memberships = [{ ...membership, businessId: "b2", slug: "elsewhere" }];
    await act(() => client.invalidateQueries({ queryKey: qk.me() }));
    expect(await screen.findByText("Business not found")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("says when the user isn't a member of the slug's business", async () => {
    mockApi(() => ({ ...me, memberships: [] }));
    renderRoot();
    expect(await screen.findByText("Business not found")).toBeInTheDocument();
  });

  it("shows no access when the business is forbidden", async () => {
    mockApi((method, path) =>
      path === "/v1/me"
        ? { ...me, memberships: [membership] }
        : json({ error: { code: "FORBIDDEN", message: "No" } }, 403),
    );
    renderRoot();
    expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  });

  it("shows the error inside the chrome when the business fails to load", async () => {
    mockApi((method, path) =>
      path === "/v1/me"
        ? { ...me, memberships: [membership] }
        : json({ error: { code: "INTERNAL", message: "Database is down" } }, 500),
    );
    renderRoot();
    expect(await screen.findByText(/Database is down/)).toBeInTheDocument();
    expect(screen.queryByText(/chrome for/)).not.toBeInTheDocument();
  });
});
