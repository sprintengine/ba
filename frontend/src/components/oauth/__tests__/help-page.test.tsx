import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import AiAssistantHelpPage from "@/app/(marketing)/help/ai-assistant/page";
import BusinessAgentsHelpPage from "@/app/(marketing)/help/ai-agents-for-business/page";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <TooltipProvider>
      <AiAssistantHelpPage />
    </TooltipProvider>,
  );
}

describe("Help: Use bookanything in your AI assistant", () => {
  it("shows the server URL and both vendor guides", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://bookanything.ie");
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Use bookanything in your AI assistant" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Your server URL" })).toHaveTextContent(
      "https://bookanything.ie/mcp",
    );
    expect(screen.getByRole("group", { name: "Read-only server URL" })).toHaveTextContent(
      "https://bookanything.ie/api/v1/mcp",
    );
    expect(screen.getByRole("heading", { level: 2, name: "Claude" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "ChatGPT" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /adding a custom connector/i })).toHaveAttribute(
      "href",
      "https://claude.com/docs/connectors/custom/add-unlisted",
    );
    expect(screen.getByRole("link", { name: /connecting an app to chatgpt/i })).toHaveAttribute(
      "href",
      "https://developers.openai.com/apps-sdk/deploy/connect-chatgpt",
    );
    for (const link of screen.getAllByRole("link", { name: /connected apps/i })) {
      expect(link).toHaveAttribute("href", "/my/connected-apps");
    }
    expect(screen.getByRole("link", { name: "Approvals" })).toHaveAttribute("href", "/my/approvals");
  });

  it("copies the server URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://bookanything.ie");
    const writeText = vi.fn(async () => {});
    renderPage();
    // user-event installs its own clipboard; replace it after setup.
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(screen.getByRole("button", { name: "Copy your server URL" }));
    expect(writeText).toHaveBeenCalledWith("https://bookanything.ie/mcp");
    expect(toast.success).toHaveBeenCalledWith("Server URL copied");
  });
});

describe("Help: Run your business from your AI agent", () => {
  it("gives the business server URL, the vendor guides and how changes are confirmed", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://bookanything.ie");
    render(
      <TooltipProvider>
        <BusinessAgentsHelpPage />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Run your business from your AI agent" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Business server URL" })).toHaveTextContent(
      "https://bookanything.ie/mcp/business",
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Changes wait for your approval" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Claude" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "ChatGPT" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Use bookanything in your AI assistant" })).toHaveAttribute(
      "href",
      "/help/ai-assistant",
    );
  });

  it("only mentions the dashboard's assistant where Bo is offered", () => {
    const renderBusinessPage = () =>
      render(
        <TooltipProvider>
          <BusinessAgentsHelpPage />
        </TooltipProvider>,
      );
    const control = () => screen.getByRole("region", { name: "Stay in control" });
    const { unmount } = renderBusinessPage();
    expect(control()).toHaveTextContent("Turning them off stops every member’s agent at once.");
    expect(control()).not.toHaveTextContent(/assistant in the dashboard/);
    unmount();
    vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ENABLED", "true");
    renderBusinessPage();
    expect(control()).toHaveTextContent(
      "Turning them off stops every member’s agent at once; the assistant in the dashboard keeps working.",
    );
  });

  it("is linked from the customer guide unless the business server is switched off", () => {
    const { unmount } = renderPage();
    expect(screen.getByRole("link", { name: "Run your business from your AI agent" })).toHaveAttribute(
      "href",
      "/help/ai-agents-for-business",
    );
    unmount();
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_MCP_ENABLED", "false");
    renderPage();
    expect(
      screen.queryByRole("link", { name: "Run your business from your AI agent" }),
    ).not.toBeInTheDocument();
  });
});
