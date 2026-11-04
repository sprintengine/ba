/** Dictation in Bo's composer, against a scriptable SpeechRecognition (lib/assistant/__tests__). */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderDashboard } from "@/components/dashboard/test/render";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  installFakeSpeechRecognition,
  uninstallSpeechRecognition,
} from "@/lib/assistant/__tests__/fake-speech-recognition";
import { expectNoAxeViolations } from "@/test/axe";
import { AssistantProvider } from "../assistant-context";
import { AssistantPanel } from "../assistant-panel";
import { BoLauncher } from "../bo-launcher";
import { Composer } from "../composer";
import { fakeAssistantApi } from "./fake-assistant-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio",
  useSearchParams: () => new URLSearchParams(),
}));

let fake: ReturnType<typeof installFakeSpeechRecognition>;
beforeEach(() => {
  fake = installFakeSpeechRecognition();
});
afterEach(() => uninstallSpeechRecognition());

function renderComposer(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const onSend = vi.fn();
  const onTyping = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <TooltipProvider>
      <Composer disabled={false} busy={false} onSend={onSend} onTyping={onTyping} {...props} />
    </TooltipProvider>,
  );
  const box = () => screen.getByRole("textbox", { name: "Message Bo" });
  const mic = () => screen.getByRole("button", { name: "Dictate" });
  return { ...view, user, onSend, onTyping, box, mic };
}

describe("Composer dictation", () => {
  it("has no microphone where the browser can't recognise speech", () => {
    uninstallSpeechRecognition();
    renderComposer();
    expect(screen.queryByRole("button", { name: "Dictate" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("fills the box with what is heard, after what was typed, and makes Bo listen", async () => {
    const { user, box, mic, onTyping } = renderComposer();
    expect(mic()).toHaveAttribute("aria-pressed", "false");
    await user.type(box(), "Please");
    await user.click(mic());

    expect(mic()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Listening. Speak now.");
    expect(onTyping).toHaveBeenLastCalledWith(true);
    expect(fake.latest().started).toBe(true);

    fake.latest().hear({ interim: "move" });
    expect(box()).toHaveValue("Please move");
    fake.latest().hear({ final: ["move Robin"], interim: "to Friday" });
    expect(box()).toHaveValue("Please move Robin to Friday");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();

    await user.click(mic());
    expect(mic()).toHaveAttribute("aria-pressed", "false");
    expect(box()).toHaveValue("Please move Robin to Friday");
    expect(screen.getByRole("status")).toHaveTextContent("Stopped listening.");
    expect(onTyping).toHaveBeenLastCalledWith(false);
  });

  it("never sends on its own: the engine ending leaves the words in the box", async () => {
    const { user, box, mic, onSend } = renderComposer();
    await user.click(mic());
    fake.latest().hear({ final: ["Block out Friday afternoon"] });
    fake.latest().end();
    expect(box()).toHaveValue("Block out Friday afternoon");
    expect(onSend).not.toHaveBeenCalled();
    expect(mic()).toHaveAttribute("aria-pressed", "false");
  });

  it("Send stops listening and sends the whole box", async () => {
    const { user, box, mic, onSend } = renderComposer();
    await user.click(mic());
    const recognition = fake.latest();
    recognition.hear({ final: ["What's on"], interim: "today" });
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledExactlyOnceWith("What's on today");
    expect(recognition.aborted).toBe(true);
    expect(box()).toHaveValue("");
    expect(mic()).toHaveAttribute("aria-pressed", "false");
  });

  it("Enter sends while listening too", async () => {
    const { user, box, mic, onSend } = renderComposer();
    await user.click(mic());
    fake.latest().hear({ interim: "Any cancellations" });
    await user.click(box());
    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Any cancellations");
  });

  it("Escape stops listening and keeps the words", async () => {
    const { user, box, mic } = renderComposer();
    await user.click(mic());
    fake.latest().hear({ interim: "Remind me" });
    await user.keyboard("{Escape}");
    expect(mic()).toHaveAttribute("aria-pressed", "false");
    expect(box()).toHaveValue("Remind me");
  });

  it("typing takes over from dictation", async () => {
    const { user, box, mic } = renderComposer();
    await user.click(mic());
    const recognition = fake.latest();
    recognition.hear({ interim: "Book Alex" });
    await user.type(box(), " at 10");
    expect(recognition.aborted).toBe(true);
    expect(mic()).toHaveAttribute("aria-pressed", "false");
    expect(box()).toHaveValue("Book Alex at 10");
  });

  it("explains a blocked microphone and clears the message once the owner types", async () => {
    const { user, box, mic } = renderComposer();
    await user.click(mic());
    fake.latest().error("not-allowed");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Microphone access is blocked. Allow it in your browser settings to dictate.",
    );
    expect(mic()).toHaveAttribute("aria-pressed", "false");
    await user.type(box(), "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the microphone usable to stop when the composer is disabled mid-session", async () => {
    const view = renderComposer();
    await view.user.click(view.mic());
    view.rerender(
      <TooltipProvider>
        <Composer disabled busy={false} onSend={view.onSend} onTyping={view.onTyping} />
      </TooltipProvider>,
    );
    expect(view.mic()).toBeEnabled();
    await view.user.click(view.mic());
    expect(view.mic()).toBeDisabled();
  });

  it("is axe-clean idle, listening and with an error", async () => {
    const { user, mic, container } = renderComposer();
    await expectNoAxeViolations(container);
    await user.click(mic());
    fake.latest().hear({ interim: "Hello" });
    await expectNoAxeViolations(container);
    fake.latest().error("audio-capture");
    expect(screen.getByRole("alert")).toHaveTextContent("No microphone found.");
    await expectNoAxeViolations(container);
  });
});

describe("dictating in Bo's panel", () => {
  beforeEach(() => {
    fakeAssistantApi();
  });

  it("Bo listens while the owner dictates, and Escape stops without closing the panel", async () => {
    const user = userEvent.setup();
    renderDashboard(
      <AssistantProvider>
        <BoLauncher />
        <AssistantPanel />
      </AssistantProvider>,
    );
    await user.click(await screen.findByRole("button", { name: /^Open Bo/ }));
    const dialog = await screen.findByRole("dialog");
    const mic = within(dialog).getByRole("button", { name: "Dictate" });
    await waitFor(() => expect(mic).toBeEnabled());
    await user.click(mic);
    expect(within(dialog).getByRole("img", { name: "Bo, listening" })).toBeInTheDocument();

    fake.latest().hear({ interim: "What's on today" });
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mic).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("textbox", { name: "Message Bo" })).toHaveValue("What's on today");
    expect(within(dialog).getByRole("img", { name: "Bo, ready" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
