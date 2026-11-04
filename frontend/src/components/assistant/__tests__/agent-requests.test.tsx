import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRequest } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { mockApi, renderDashboard } from "@/components/dashboard/test/render";
import { AgentRequestPage, AgentRequestsPage } from "../agent-requests";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio/approvals",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => vi.unstubAllGlobals());

const ID = "00000000-0000-4000-8000-0000000000c1";

const request = (patch: Partial<AgentRequest> = {}, status: AgentRequest["action"]["status"] = "pending") =>
  ({
    action: {
      id: ID,
      tool: "cancel_bookings",
      status,
      proposal: {
        title: "Cancel 1 appointment",
        summary: "Rowan Hale, Tuesday 6 October at 13:00",
        changes: [],
        items: [{ title: "Rowan Hale", detail: "€15 refund" }],
        warnings: ["Rowan is told by email."],
        confirmLabel: "Cancel appointment",
        destructive: true,
      },
      result: status === "confirmed" ? { message: "Cancelled 1 appointment.", links: [] } : null,
      error: null,
      expiresAt: "2026-10-02T10:00:00+01:00",
      createdAt: "2026-10-01T10:00:00+01:00",
      decidedAt: status === "pending" ? null : "2026-10-01T10:05:00+01:00",
    },
    app: "Claude",
    needsApproval: true,
    appDisconnected: false,
    ...patch,
  }) satisfies AgentRequest;

describe("AgentRequestPage", () => {
  it("shows what the agent wants to change and carries it out when approved, axe-clean", async () => {
    const calls: string[] = [];
    let current = request();
    mockApi((method, path) => {
      calls.push(`${method} ${path}`);
      if (method === "POST" && path === `/v1/businesses/b1/agent-requests/${ID}/approve`) {
        current = request({}, "confirmed");
        return current;
      }
      if (path === `/v1/businesses/b1/agent-requests/${ID}`) return current;
      return {};
    });
    const { container } = renderDashboard(<AgentRequestPage id={ID} />);

    expect(await screen.findByText("Cancel 1 appointment")).toBeInTheDocument();
    expect(screen.getByText(/claude wants to make this change at/i)).toBeInTheDocument();
    expect(screen.getByText("Rowan is told by email.")).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await userEvent.click(screen.getByRole("button", { name: "Cancel appointment" }));
    expect(await screen.findByText("Cancelled 1 appointment.")).toBeInTheDocument();
    expect(screen.getByText(/you can go back to claude/i)).toBeInTheDocument();
    expect(calls).toContain(`POST /v1/businesses/b1/agent-requests/${ID}/approve`);
  });

  it("declines, so nothing happens", async () => {
    let current = request();
    mockApi((method, path) => {
      if (method === "POST" && path.endsWith("/decline")) current = request({}, "rejected");
      return path.startsWith(`/v1/businesses/b1/agent-requests/${ID}`) ? current : {};
    });
    renderDashboard(<AgentRequestPage id={ID} />);
    await userEvent.click(await screen.findByRole("button", { name: "Decline" }));
    expect(await screen.findByText(/declined\. nothing changed/i)).toBeInTheDocument();
  });

  it("can't be approved once the app was disconnected", async () => {
    mockApi((_method, path) => (path.endsWith(ID) ? request({ appDisconnected: true }) : {}));
    renderDashboard(<AgentRequestPage id={ID} />);
    expect(await screen.findByText(/claude was disconnected/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel appointment" })).not.toBeInTheDocument();
  });
});

describe("AgentRequestsPage", () => {
  it("puts what's waiting first and says when there's nothing", async () => {
    mockApi((_method, path) =>
      path === "/v1/businesses/b1/agent-requests"
        ? { items: [request({}, "confirmed"), request({ action: { ...request().action, id: "other" } })] }
        : {},
    );
    const { unmount } = renderDashboard(<AgentRequestsPage />);
    const waiting = await screen.findByRole("region", { name: "Waiting for you" });
    expect(waiting).toHaveTextContent("Cancel 1 appointment");
    expect(screen.getByRole("region", { name: "This week" })).toHaveTextContent("Cancelled 1 appointment.");
    unmount();

    mockApi(() => ({ items: [] }));
    renderDashboard(<AgentRequestsPage />);
    await waitFor(() => expect(screen.getByText("Nothing to approve")).toBeInTheDocument());
  });
});
