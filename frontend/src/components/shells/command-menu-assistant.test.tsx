import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderDashboard } from "@/components/dashboard/test/render";
import {
  installFakeSpeechRecognition,
  uninstallSpeechRecognition,
} from "@/lib/assistant/__tests__/fake-speech-recognition";
import { CommandMenu } from "./command-menu";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/context", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock("@/components/common/theme-toggle", () => ({ useThemeChoice: () => ({ setTheme: vi.fn() }) }));

describe("⌘K", () => {
  it("asks Bo whatever was typed", async () => {
    const onAsk = vi.fn();
    const user = userEvent.setup();
    renderDashboard(
      <CommandMenu
        open
        onOpenChange={() => {}}
        slug="lumen-physio"
        role="staff"
        memberships={[]}
        onAskAssistant={onAsk}
      />,
    );
    expect(screen.getByRole("option", { name: /Ask Bo…/ })).toBeInTheDocument();
    await user.type(screen.getByRole("combobox"), "move Jordan to 3pm");
    await user.click(screen.getByRole("option", { name: /Ask Bo: “move Jordan to 3pm”/ }));
    expect(onAsk).toHaveBeenCalledWith("move Jordan to 3pm");
  });

  it("asks Bo by voice: what is heard fills the search, and nothing goes until Ask is chosen", async () => {
    const fake = installFakeSpeechRecognition();
    try {
      const onAsk = vi.fn();
      const user = userEvent.setup();
      renderDashboard(
        <CommandMenu
          open
          onOpenChange={() => {}}
          slug="lumen-physio"
          role="staff"
          memberships={[]}
          onAskAssistant={onAsk}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Dictate" }));
      expect(screen.getByRole("button", { name: "Dictate" })).toHaveAttribute("aria-pressed", "true");
      fake.latest().hear({ final: ["What's on"], interim: "today" });
      expect(await screen.findByRole("combobox")).toHaveValue("What's on today");
      await user.click(screen.getByRole("button", { name: "Dictate" }));
      expect(onAsk).not.toHaveBeenCalled();
      await user.click(screen.getByRole("option", { name: /Ask Bo: “What's on today”/ }));
      expect(onAsk).toHaveBeenCalledWith("What's on today");
    } finally {
      uninstallSpeechRecognition();
    }
  });

  it("has no microphone without a way to ask Bo, or where speech isn't recognised", () => {
    renderDashboard(
      <CommandMenu open onOpenChange={() => {}} slug="lumen-physio" role="staff" memberships={[]} />,
    );
    expect(screen.queryByRole("button", { name: "Dictate" })).not.toBeInTheDocument();
  });
});
