import { memo } from "react";
import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderDashboard } from "@/components/dashboard/test/render";
import {
  AssistantProvider,
  useAssistant,
  useAssistantControls,
  type AssistantControls,
} from "../assistant-context";
import { fakeAssistantApi, Turn } from "./fake-assistant-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio",
  useSearchParams: () => new URLSearchParams(),
}));

let api: ReturnType<typeof fakeAssistantApi>;
beforeEach(() => {
  api = fakeAssistantApi();
});

/** Stands in for the dashboard chrome (launcher, ⌘K): records every render and the controls it saw. */
const seen: AssistantControls[] = [];
const ControlsProbe = memo(function ControlsProbe() {
  const controls = useAssistantControls();
  seen.push(controls);
  return (
    <button type="button" onClick={() => controls.ask("What's on today?")}>
      Ask
    </button>
  );
});

/** Stands in for the panel: the conversation as it streams. */
function ChatProbe() {
  const { chat } = useAssistant();
  return <p data-testid="reply">{chat.messages.map((m) => m.text).join("|")}</p>;
}

describe("AssistantProvider", () => {
  it("does not re-render the chrome for every streamed event", async () => {
    seen.length = 0;
    const turn = new Turn();
    api.next = turn;
    renderDashboard(
      <AssistantProvider>
        <ControlsProbe />
        <ChatProbe />
      </AssistantProvider>,
    );
    const askButton = await screen.findByRole("button", { name: "Ask" });
    // `ask` starts a chat once Bo's state says it is configured.
    await waitFor(() => expect(seen.at(-1)?.state?.configured).toBe(true));
    act(() => askButton.click());
    await waitFor(() => expect(api.sent).toEqual(["What's on today?"]));
    await waitFor(() => expect(seen.at(-1)?.mood).toBe("thinking"));

    const rendersWhileThinking = seen.length;
    const ask = seen.at(-1)?.ask;
    for (const delta of ["You ", "have ", "4 ", "appointments"]) {
      act(() => turn.push({ type: "text", delta }));
    }
    await waitFor(() => expect(screen.getByTestId("reply")).toHaveTextContent("You have 4 appointments"));
    expect(seen.length).toBe(rendersWhileThinking);
    expect(seen.at(-1)?.ask).toBe(ask);
  });
});
