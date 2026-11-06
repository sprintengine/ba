import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppNotification, NotificationList, NotificationSettings } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { calls, mockApi, renderWithProviders } from "@/components/oauth/__tests__/render";
import { NotificationBell, timeAgo } from "../notification-bell";
import { NotificationsPage } from "../notifications-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/my/notifications",
  useSearchParams: () => new URLSearchParams(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

afterEach(() => vi.unstubAllGlobals());

const note = (patch: Partial<AppNotification> = {}): AppNotification => ({
  id: "n1",
  kind: "agent_approval",
  title: "Claude wants to: Cancel 1 appointment",
  body: "Rowan Hale, Tue 6 Oct, 13:00",
  link: "/dashboard/lumen-physio/approvals/a1",
  businessName: "Lumen Physiotherapy",
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  read: false,
  ...patch,
});

const settings: NotificationSettings = {
  items: [
    {
      kind: "agent_approval",
      label: "Your AI agent's changes",
      description: "A change your AI agent prepared is waiting for you to approve it.",
      email: true,
      forMembers: true,
      forCustomers: true,
    },
    {
      kind: "new_booking",
      label: "New bookings",
      description: "A customer booked online.",
      email: false,
      forMembers: true,
      forCustomers: false,
    },
  ],
};

/** A stateful fake of the notifications API. */
function fakeApi(items: AppNotification[], memberships: unknown[] = []) {
  let list: NotificationList = { items, unreadCount: items.filter((n) => !n.read).length };
  let current = settings;
  return mockApi((method, path, body) => {
    if (path === "/v1/me/notifications") return list;
    if (method === "POST" && path === "/v1/me/notifications/read-all") {
      list = { items: list.items.map((n) => ({ ...n, read: true })), unreadCount: 0 };
      return undefined;
    }
    if (method === "POST" && path.endsWith("/read")) return undefined;
    if (method === "PATCH" && path === "/v1/me/notification-settings") {
      const email = (body as { email: Record<string, boolean> }).email;
      current = { items: current.items.map((k) => (k.kind in email ? { ...k, email: email[k.kind]! } : k)) };
      return current;
    }
    if (path === "/v1/me/notification-settings") return current;
    if (path === "/v1/me") {
      return {
        user: { id: "u1", email: "rowan@example.test", name: "Rowan", emailVerified: true },
        memberships,
        pendingInvitations: [],
        hasCustomerBookings: true,
      };
    }
    return {};
  });
}

describe("NotificationBell", () => {
  it("shows the unread count and the latest, and opening one marks it read, axe-clean", async () => {
    const fetchMock = fakeApi([
      note(),
      note({ id: "n2", title: "New appointment: Jordan", read: true, kind: "new_booking" }),
    ]);
    const { container } = renderWithProviders(<NotificationBell />);
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    await userEvent.click(bell);
    const link = await screen.findByRole("link", { name: /claude wants to: cancel 1 appointment/i });
    expect(link).toHaveAttribute("href", "/dashboard/lumen-physio/approvals/a1");
    expect(within(link).getByText(/5 min ago/i)).toBeInTheDocument();
    await expectNoAxeViolations(container.ownerDocument.body);
    await userEvent.click(link);
    await waitFor(() => expect(calls(fetchMock)).toContain("POST /v1/me/notifications/n1/read"));
  });

  it("offers Review on a request waiting for an answer, and only there", async () => {
    fakeApi([
      note({ id: "n3", title: "Request to approve: Jordan", kind: "booking_request" }),
      note({ id: "n4", title: "Request to approve: Sam", kind: "booking_request", read: true }),
      note({ id: "n5", title: "New appointment: Alex", kind: "new_booking" }),
    ]);
    renderWithProviders(<NotificationBell />);
    await userEvent.click(await screen.findByRole("button", { name: /^Notifications, 2 unread/ }));
    const waiting = await screen.findByRole("link", { name: /Request to approve: Jordan/ });
    expect(within(waiting).getByText("Review")).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /Request to approve: Sam/ })).queryByText("Review"),
    ).toBeNull();
    expect(
      within(screen.getByRole("link", { name: /New appointment: Alex/ })).queryByText("Review"),
    ).toBeNull();
  });

  it("marks everything read and says when there's nothing new", async () => {
    fakeApi([note()]);
    renderWithProviders(<NotificationBell />);
    await userEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    await userEvent.click(screen.getByRole("button", { name: /mark all read/i }));
    expect(await screen.findByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("counts in words past nine", () => {
    const now = Date.parse("2026-10-14T12:00:00Z");
    expect(timeAgo("2026-10-14T11:59:40Z", now)).toBe("Just now");
    expect(timeAgo("2026-10-14T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-10-13T10:00:00Z", now)).toBe("Yesterday");
  });
});

describe("NotificationsPage", () => {
  it("lists everything and lets a customer choose what's emailed, without team-only kinds", async () => {
    const fetchMock = fakeApi([note({ link: "/my/approvals/r1" })]);
    renderWithProviders(<NotificationsPage />);
    expect(await screen.findByRole("link", { name: /claude wants to/i })).toHaveAttribute(
      "href",
      "/my/approvals/r1",
    );
    const email = await screen.findByRole("group", { name: "Notifications to email" });
    expect(within(email).getByRole("switch", { name: /your ai agent's changes/i })).toBeChecked();
    expect(within(email).queryByRole("switch", { name: /new bookings/i })).not.toBeInTheDocument();
    await userEvent.click(within(email).getByRole("switch", { name: /your ai agent's changes/i }));
    await waitFor(() => expect(calls(fetchMock)).toContain("PATCH /v1/me/notification-settings"));
    expect(toast.success).toHaveBeenCalledWith("No more emails for these");
  });

  it("offers the team's kinds to members of a business", async () => {
    fakeApi([], [{ businessId: "b1", slug: "lumen-physio", name: "Lumen", role: "owner", branding: {} }]);
    renderWithProviders(<NotificationsPage />);
    expect(await screen.findByText("Nothing yet")).toBeInTheDocument();
    expect(await screen.findByRole("switch", { name: /new bookings/i })).not.toBeChecked();
  });
});
