import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberRole, Service } from "@/lib/api/types";
import { ServicesList } from "../services/services-list";
import { TeamSection } from "../team/team-view";
import { mockApi, renderDashboard } from "./render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => vi.unstubAllGlobals());

const service: Service = {
  id: "s1",
  name: "Initial assessment",
  description: null,
  category: null,
  color: "#0e7c70",
  durationMinutes: 60,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  slotIntervalMinutes: null,
  minNoticeMinutes: null,
  maxAdvanceDays: null,
  capacity: 1,
  priceCents: 6500,
  paymentMode: "full",
  depositCents: null,
  allowPayAtVenue: false,
  requiresApproval: false,
  locationType: "business",
  allowedGroupIds: [],
  isPublic: true,
  isActive: true,
  sortOrder: 0,
  options: [],
  addons: [],
  requirements: [],
};

const api = () =>
  mockApi((method, path) => {
    if (path.endsWith("/services")) return [service];
    if (path.endsWith("/team"))
      return [
        {
          id: "m1",
          userId: "u1",
          name: "Avery Morgan",
          email: "owner@example.test",
          role: "owner",
          status: "active",
          resourceId: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "m2",
          userId: "u2",
          name: "Casey Lane",
          email: "staff@example.test",
          role: "staff",
          status: "active",
          resourceId: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ];
    if (path.endsWith("/resources")) return [];
    return [];
  });

describe.each<[MemberRole, boolean]>([
  ["owner", true],
  ["admin", true],
  ["staff", false],
])("role %s", (role, canManage) => {
  it(`${canManage ? "can" : "cannot"} manage services`, async () => {
    api();
    renderDashboard(<ServicesList />, role);
    expect(await screen.findByText("Initial assessment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new service/i }) !== null).toBe(canManage);
    expect(screen.queryByRole("button", { name: /more for initial assessment/i }) !== null).toBe(canManage);
    expect(screen.queryByRole("button", { name: /edit initial assessment/i }) !== null).toBe(canManage);
  });

  it(`${canManage ? "can" : "cannot"} invite or change the team`, async () => {
    api();
    renderDashboard(<TeamSection />, role);
    expect(await screen.findByText("Casey Lane")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /invite/i }) !== null).toBe(canManage);
    expect(screen.queryByRole("combobox", { name: /role/i }) !== null).toBe(canManage);
  });
});

it("admins can't change or remove an owner", async () => {
  api();
  renderDashboard(<TeamSection />, "admin");
  expect(await screen.findByText("Avery Morgan")).toBeInTheDocument();
  // Only Casey (staff) gets a role picker and a remove button.
  expect(screen.getAllByRole("combobox", { name: /role/i })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: /^remove /i })).toHaveLength(1);
});
