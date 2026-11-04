import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerAgentRequest } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { AgentSettingsCard } from "../agent-settings-card";
import { CustomerRequestPage, CustomerRequestsPage } from "../customer-approvals";
import { apiError, calls, mockApi, renderWithProviders } from "./render";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

afterEach(() => vi.unstubAllGlobals());

const ID = "00000000-0000-4000-8000-0000000000d1";

const request = (
  status: CustomerAgentRequest["action"]["status"] = "pending",
  patch: Partial<CustomerAgentRequest> = {},
): CustomerAgentRequest => ({
  action: {
    id: ID,
    tool: "book",
    status,
    proposal: {
      title: "Book Sports massage at Lumen Physiotherapy",
      summary: "Tue 6 Oct, 14:00–15:00",
      changes: [{ label: "Price", before: null, after: "€40 · Pay €40 online once you approve" }],
      items: [],
      warnings: [],
      confirmLabel: "Book",
      destructive: false,
    },
    result:
      status === "confirmed"
        ? {
            message: "Your time is held. Pay to confirm it.",
            links: [{ label: "Pay now", path: "https://checkout.example.test/pay/1" }],
          }
        : null,
    error: null,
    expiresAt: "2026-10-06T09:00:00+01:00",
    createdAt: "2026-10-05T09:00:00+01:00",
    decidedAt: status === "pending" ? null : "2026-10-05T09:05:00+01:00",
  },
  app: "Claude",
  business: { name: "Lumen Physiotherapy", slug: "lumen-physio" },
  timezone: "Europe/Dublin",
  needsApproval: true,
  appDisconnected: false,
  ...patch,
});

describe("Customer approvals", () => {
  it("shows what the assistant asks and books it when approved, with the payment link, axe-clean", async () => {
    let current = request();
    const fetchMock = mockApi((method, path) => {
      if (method === "POST" && path === `/v1/me/agent-requests/${ID}/approve`) current = request("confirmed");
      return path.startsWith(`/v1/me/agent-requests/${ID}`) ? current : {};
    });
    const { container } = renderWithProviders(<CustomerRequestPage id={ID} />);
    expect(await screen.findByText("Book Sports massage at Lumen Physiotherapy")).toBeInTheDocument();
    expect(screen.getByText(/claude wants to do this with lumen physiotherapy/i)).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await userEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(await screen.findByRole("link", { name: "Pay now" })).toHaveAttribute(
      "href",
      "https://checkout.example.test/pay/1",
    );
    expect(screen.getByText(/you can go back to claude/i)).toBeInTheDocument();
    expect(calls(fetchMock)).toContain(`POST /v1/me/agent-requests/${ID}/approve`);
  });

  it("explains a refusal (it changed since it was prepared)", async () => {
    mockApi((method, path) => {
      if (method === "POST")
        return apiError(409, "CONFLICT", "This is different now from when it was prepared.");
      return path.startsWith("/v1/me/agent-requests") ? request() : {};
    });
    renderWithProviders(<CustomerRequestPage id={ID} />);
    await userEvent.click(await screen.findByRole("button", { name: "Book" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("different now");
  });

  it("lists what's waiting first, and says when there's nothing", async () => {
    mockApi((_m, path) =>
      path === "/v1/me/agent-requests"
        ? {
            items: [
              request("rejected"),
              request("pending", { action: { ...request().action, id: "other" } }),
            ],
          }
        : {},
    );
    const { unmount } = renderWithProviders(<CustomerRequestsPage />);
    expect(await screen.findByRole("region", { name: "Waiting for you" })).toHaveTextContent(
      "Book Sports massage",
    );
    expect(screen.getByRole("region", { name: "This week" })).toHaveTextContent(/declined/i);
    unmount();
    mockApi(() => ({ items: [] }));
    renderWithProviders(<CustomerRequestsPage />);
    expect(await screen.findByText("Nothing to approve")).toBeInTheDocument();
  });

  it("lets the customer choose what their apps may do without approving here", async () => {
    let autoApprove: string[] = [];
    const fetchMock = mockApi((method, path, body) => {
      if (method === "PATCH") autoApprove = (body as { autoApprove: string[] }).autoApprove;
      return path === "/v1/me/agent-settings" ? { autoApprove } : {};
    });
    renderWithProviders(<AgentSettingsCard />);
    const cancelling = await screen.findByRole("checkbox", { name: /cancelling/i });
    expect(cancelling).not.toBeChecked();
    await userEvent.click(cancelling);
    await waitFor(() => expect(calls(fetchMock)).toContain("PATCH /v1/me/agent-settings"));
    expect(autoApprove).toEqual(["cancellations"]);
    expect(await screen.findByRole("checkbox", { name: /cancelling/i })).toBeChecked();
  });
});
