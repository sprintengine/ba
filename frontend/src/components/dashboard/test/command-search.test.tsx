import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRole } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { CommandMenu } from "@/components/shells/command-menu";
import { DashboardCommandSearch } from "../command-search";
import { customer } from "./booking-builders";
import { booking, mockApi, renderDashboard } from "./render";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/context", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock("@/components/common/theme-toggle", () => ({ useThemeChoice: () => ({ setTheme: vi.fn() }) }));
const actions = vi.hoisted(() => ({ openBooking: vi.fn(), openNewBooking: vi.fn() }));
vi.mock("../booking/booking-actions-provider", () => ({ useBookingActions: () => actions }));

beforeEach(() => {
  push.mockClear();
  actions.openBooking.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

function api(found = true) {
  return mockApi((method, path) => {
    if (path.endsWith("/customers"))
      return { items: found ? [customer({ phone: "087 123 4567", email: null })] : [], nextCursor: null };
    if (path.endsWith("/bookings")) return { items: found ? [booking()] : [], nextCursor: null };
    return [];
  });
}

/** ⌘K as the dashboard layout mounts it: with live search of the business. */
function renderSearch(role: MemberRole = "owner") {
  const onOpenChange = vi.fn();
  renderDashboard(
    <CommandMenu
      open
      onOpenChange={onOpenChange}
      slug="lumen-physio"
      role={role}
      memberships={[]}
      extension={(ctx) => <DashboardCommandSearch {...ctx} />}
    />,
    role,
  );
  return { onOpenChange };
}

describe("⌘K search", () => {
  it("finds customers and bookings by what was typed, and opens a customer", async () => {
    const calls = api();
    const { onOpenChange } = renderSearch();
    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox"), "alex");
    const customers = (await screen.findByText("Patients", { selector: "[cmdk-group-heading]" }))
      .parentElement;
    expect(within(customers ?? document.body).getByRole("option", { name: /Alex Morgan/ })).toHaveTextContent(
      "087 123 4567",
    );
    expect(screen.getByRole("option", { name: /BA-TEST01/ })).toHaveTextContent(/Alex Morgan · Follow-up/);
    const searched = calls.mock.calls.map(([u]) => new URL(String(u), "http://x"));
    expect(searched.find((u) => u.pathname.endsWith("/customers"))?.searchParams.get("q")).toBe("alex");
    expect(searched.find((u) => u.pathname.endsWith("/bookings"))?.searchParams.get("limit")).toBe("5");
    await expectNoAxeViolations(document.body);

    await user.click(within(customers ?? document.body).getByRole("option", { name: /Alex Morgan/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(push).toHaveBeenCalledWith("/dashboard/lumen-physio/customers/c1");
  });

  it("opens a found booking in the drawer", async () => {
    api();
    renderSearch();
    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox"), "BA-TEST");
    await user.click(await screen.findByRole("option", { name: /BA-TEST01/ }));
    expect(actions.openBooking).toHaveBeenCalledWith("bk1");
  });

  it("waits for two characters before searching, offering settings pages meanwhile", async () => {
    const calls = api();
    renderSearch();
    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox"), "b");
    expect(await screen.findByRole("option", { name: /Billing/ })).toBeInTheDocument();
    expect(calls.mock.calls.some(([u]) => String(u).includes("/customers"))).toBe(false);
  });

  it("offers settings pages when nothing is found, and opens one", async () => {
    api(false);
    renderSearch();
    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox"), "billing");
    await user.click(await screen.findByRole("option", { name: /Billing/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/lumen-physio/settings/billing"));
  });

  it("offers staff no settings", async () => {
    api(false);
    renderSearch("staff");
    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox"), "billing");
    await waitFor(() => expect(screen.getByText("Nothing found.")).toBeInTheDocument());
    expect(screen.queryByRole("option", { name: /Billing/ })).not.toBeInTheDocument();
  });
});
