import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { renderDashboard } from "@/components/dashboard/test/render";
import { apiError } from "@/components/dashboard/resources/__tests__/fake-resources-api";
import { ServicesList } from "../services-list";
import { fakeServicesApi, service } from "./fake-services-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

afterEach(() => {
  vi.unstubAllGlobals();
  toast.success.mockReset();
  toast.error.mockReset();
});

const assessment = service({ id: "s1", name: "Initial assessment", category: "Physio", sortOrder: 0 });
const followUp = service({
  id: "s2",
  name: "Follow-up",
  category: "Physio",
  sortOrder: 1,
  durationMinutes: 30,
  paymentMode: "deposit",
  depositCents: 1000,
  priceCents: 4000,
  options: [
    { id: "o1", name: "Short", description: null, durationMinutes: 30, priceCents: 4000, sortOrder: 0 },
    { id: "o2", name: "Long", description: null, durationMinutes: 60, priceCents: 7000, sortOrder: 1 },
  ],
  addons: [{ id: "a1", name: "Taping", description: null, extraMinutes: 10, priceCents: 500, sortOrder: 0 }],
  requiresApproval: true,
  isPublic: false,
});
const yoga = service({
  id: "s3",
  name: "Yoga class",
  category: "Classes",
  sortOrder: 2,
  capacity: 12,
  paymentMode: "free",
  priceCents: 0,
});
const retired = service({ id: "s4", name: "Retired massage", isActive: false, sortOrder: 3 });

const rowFor = (name: string) => must(screen.getByText(name).closest("li"), `row for ${name}`);

describe("ServicesList", () => {
  it("shows a loading state while the services load", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderDashboard(<ServicesList />);
    expect(screen.getByRole("status", { name: "Loading services" })).toBeInTheDocument();
  });

  it("shows the API's error with a retry", async () => {
    const api = fakeServicesApi({ services: [assessment] });
    api.fail("GET", /\/services$/, () => apiError(500, "INTERNAL", "Services are napping."));
    const user = userEvent.setup();
    const { container } = renderDashboard(<ServicesList />);
    expect(await screen.findByRole("heading", { level: 2, name: "This didn’t load" })).toBeInTheDocument();
    expect(screen.getByText("Services are napping.")).toBeInTheDocument();
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Initial assessment")).toBeInTheDocument();
  });

  it("invites managers to add the first service, and only them", async () => {
    fakeServicesApi();
    const user = userEvent.setup();
    const { container, unmount } = renderDashboard(<ServicesList />);
    expect(await screen.findByRole("heading", { level: 2, name: "No services yet" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
    const add = screen.getAllByRole("button", { name: "New service" });
    expect(add).toHaveLength(2);
    await user.click(must(add[1], "empty state button"));
    expect(await screen.findByRole("dialog", { name: "New service" })).toBeInTheDocument();
    unmount();

    renderDashboard(<ServicesList />, "staff");
    expect(await screen.findByRole("heading", { name: "No services yet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New service" })).not.toBeInTheDocument();
  });

  it("groups active services by category, with inactive ones last, axe-clean", async () => {
    fakeServicesApi({ services: [retired, yoga, followUp, assessment] });
    const { container } = renderDashboard(<ServicesList />);
    await screen.findByText("Initial assessment");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Physio",
      "Classes",
      "Inactive",
    ]);

    const plain = rowFor("Initial assessment");
    expect(plain).toHaveTextContent("1 h");
    expect(plain).toHaveTextContent("Prepaid");
    expect(plain).toHaveTextContent("€65");
    // Public, on and instantly bookable is the normal case, so it says nothing.
    expect(within(plain).queryByText(/Private|Off|Needs approval/)).not.toBeInTheDocument();
    const follow = rowFor("Follow-up");
    expect(follow).toHaveTextContent("2 options · 1 add-on");
    expect(follow).toHaveTextContent("Deposit");
    expect(within(follow).getByText("Private")).toBeInTheDocument();
    expect(within(follow).getByText("Needs approval")).toBeInTheDocument();
    expect(rowFor("Yoga class")).toHaveTextContent("12 seats");
    expect(within(rowFor("Retired massage")).getByText("Off")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("leaves out the heading when every active service is uncategorised", async () => {
    fakeServicesApi({ services: [service({ category: null }), service({ id: "s2", name: "Other one" })] });
    renderDashboard(<ServicesList />);
    await screen.findByText("Other one");
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  const openMenu = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
    user.click(await screen.findByRole("button", { name: `More for ${name}` }));

  it("makes a service private from its menu, naming it", async () => {
    const api = fakeServicesApi({ services: [assessment] });
    const user = userEvent.setup();
    renderDashboard(<ServicesList />);
    await openMenu(user, "Initial assessment");
    await user.click(await screen.findByRole("menuitem", { name: "Make private" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Initial assessment is now private"));
    expect(api.bodies("PUT", "/services/s1")).toEqual([
      expect.objectContaining({
        name: "Initial assessment",
        isPublic: false,
        isActive: true,
        color: "#0e7c70",
      }),
    ]);
    expect(await screen.findByText("Private")).toBeInTheDocument();
  });

  it("deactivates and reactivates a service", async () => {
    fakeServicesApi({ services: [assessment, retired] });
    const user = userEvent.setup();
    renderDashboard(<ServicesList />);
    await openMenu(user, "Initial assessment");
    await user.click(await screen.findByRole("menuitem", { name: "Turn off" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Initial assessment deactivated"));
    await openMenu(user, "Retired massage");
    await user.click(await screen.findByRole("menuitem", { name: "Turn on" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Retired massage activated"));
  });

  it("says why a toggle failed", async () => {
    const api = fakeServicesApi({ services: [assessment] });
    api.fail("PUT", /\/services\/s1$/, () => apiError(409, "CONFLICT", "Someone else changed it."));
    const user = userEvent.setup();
    renderDashboard(<ServicesList />);
    await openMenu(user, "Initial assessment");
    await user.click(await screen.findByRole("menuitem", { name: "Turn off" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Someone else changed it."));
  });

  it("opens the editor from the row or its menu", async () => {
    fakeServicesApi({ services: [assessment] });
    const user = userEvent.setup();
    renderDashboard(<ServicesList />);
    await user.click(await screen.findByRole("button", { name: /^Edit Initial assessment/ }));
    const sheet = await screen.findByRole("dialog", { name: "Edit Initial assessment" });
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await openMenu(user, "Initial assessment");
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    expect(await screen.findByRole("dialog", { name: "Edit Initial assessment" })).toBeInTheDocument();
  });

  it("shows staff the services without ways to change them", async () => {
    fakeServicesApi({ services: [assessment] });
    renderDashboard(<ServicesList />, "staff");
    expect(await screen.findByRole("button", { name: /^Initial assessment/ })).toBeDisabled();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});
