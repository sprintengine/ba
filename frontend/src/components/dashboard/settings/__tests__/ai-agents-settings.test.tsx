import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Business, UpdateBusiness } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { visibleSettings } from "@/components/shells/dashboard-nav";
import { business, mockApi, renderDashboard } from "../../test/render";
import { AiAgentsSettings } from "../ai-agents-settings";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio/settings/ai-agents",
  useSearchParams: () => new URLSearchParams(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const available: Partial<Business> = {
  aiAgentsAvailable: true,
  aiAgentsAccess: "admins",
  aiAgentsAutoApprove: [],
};

/** Records PATCHes of the business, answering with [answer] merged in. */
function recordPatches(answer: Partial<Business>) {
  const patches: UpdateBusiness[] = [];
  mockApi((method, path, body) => {
    if (method === "PATCH" && path === "/v1/businesses/b1") {
      patches.push(body as UpdateBusiness);
      return { ...business, ...available, ...answer } satisfies Business;
    }
    return {};
  });
  return patches;
}

describe("AiAgentsSettings", () => {
  it("shows who can use agents, what needs approval and how to connect, axe-clean", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://bookanything.ie");
    mockApi(() => ({}));
    const { container } = renderDashboard(<AiAgentsSettings />, "owner", available);
    expect(screen.getByRole("heading", { name: "AI agents" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /owners and admins/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /cancellations/i })).not.toBeChecked();
    expect(screen.getByRole("group", { name: "Business server URL" })).toHaveTextContent(
      "https://bookanything.ie/mcp/business",
    );
    expect(screen.getByRole("link", { name: /step-by-step for claude and chatgpt/i })).toHaveAttribute(
      "href",
      "/help/ai-agents-for-business",
    );
    expect(screen.getByRole("link", { name: /your agents.+requests/i })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/approvals",
    );
    await expectNoAxeViolations(container);
  });

  it("lets the owner open agents to the whole team", async () => {
    const patches = recordPatches({ aiAgentsAccess: "team" });
    renderDashboard(<AiAgentsSettings />, "owner", available);
    await userEvent.click(screen.getByRole("radio", { name: /everyone on the team/i }));
    await waitFor(() => expect(patches).toEqual([{ aiAgentsAccess: "team" }]));
    expect(toast.success).toHaveBeenCalledWith("Saved who can use AI agents");
  });

  it("lets the owner choose kinds of change that skip approval, keeping the others", async () => {
    const patches = recordPatches({ aiAgentsAutoApprove: ["records", "time_off"] });
    renderDashboard(<AiAgentsSettings />, "owner", { ...available, aiAgentsAutoApprove: ["records"] });
    expect(screen.getByRole("checkbox", { name: /notes and customer details/i })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: /time off and closures/i }));
    await waitFor(() => expect(patches).toEqual([{ aiAgentsAutoApprove: ["records", "time_off"] }]));
  });

  it("shows admins the rules without letting them change them", () => {
    mockApi(() => ({}));
    renderDashboard(<AiAgentsSettings />, "admin", available);
    expect(screen.getByRole("radio", { name: /nobody/i })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /cancellations/i })).toBeDisabled();
    expect(screen.getAllByText("Only an owner can change this.")).toHaveLength(2);
  });

  it("says when the deployment doesn't offer it, and the section is only listed where it does", () => {
    mockApi(() => ({}));
    renderDashboard(<AiAgentsSettings />, "owner", { aiAgentsAvailable: false });
    expect(screen.getByText("Not available yet")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    const segments = (b: Partial<Business>, role: "owner" | "admin" | "staff") =>
      visibleSettings(
        b,
        (r) => ({ staff: 1, admin: 2, owner: 3 })[role] >= { staff: 1, admin: 2, owner: 3 }[r],
      ).map((s) => s.segment);
    expect(segments({ aiAgentsAvailable: true }, "admin")).toContain("ai-agents");
    expect(segments({ aiAgentsAvailable: false }, "owner")).not.toContain("ai-agents");
    expect(segments({ aiAgentsAvailable: true }, "staff")).toEqual([]);
  });

  it("mentions the assistant in the dashboard only where the deployment offers Bo", () => {
    mockApi(() => ({}));
    const kept = /The assistant in the dashboard (isn't affected|works as usual)/;
    const { unmount } = renderDashboard(<AiAgentsSettings />, "owner", {
      ...available,
      assistantAvailable: true,
    });
    expect(
      screen.getByText(/Every agent is stopped\. The assistant in the dashboard isn't affected\./),
    ).toBeInTheDocument();
    unmount();
    const off = renderDashboard(<AiAgentsSettings />, "owner", { ...available, assistantAvailable: false });
    expect(screen.getByText("Every agent is stopped.")).toBeInTheDocument();
    expect(screen.queryByText(kept)).not.toBeInTheDocument();
    off.unmount();
    renderDashboard(<AiAgentsSettings />, "owner", { aiAgentsAvailable: false, assistantAvailable: false });
    expect(
      screen.getByText("Connecting your own AI agents isn't switched on for bookanything yet."),
    ).toBeInTheDocument();
  });
});
