import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRole } from "@/lib/api/types";
import { BO_MOODS } from "@/lib/assistant/mood";
import { json, renderDashboard } from "@/components/dashboard/test/render";
import { AssistantProvider } from "../assistant-context";
import { AssistantPanel } from "../assistant-panel";
import { BoCharacter } from "../bo-character";
import { BoLauncher } from "../bo-launcher";
import { credits, fakeAssistantApi, nudge, proposal, reply, Turn } from "./fake-assistant-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio",
  useSearchParams: () => new URLSearchParams(),
}));

const reducedMotion = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/hooks/use-reduced-motion", () => ({ useReducedMotion: () => reducedMotion.value }));

let api: ReturnType<typeof fakeAssistantApi>;
beforeEach(() => {
  reducedMotion.value = false;
  api = fakeAssistantApi();
});

function renderBo(role: MemberRole = "owner") {
  return renderDashboard(
    <AssistantProvider>
      <BoLauncher />
      <AssistantPanel />
    </AssistantProvider>,
    role,
  );
}

async function openBo(user = userEvent.setup()) {
  renderBo();
  await user.click(await screen.findByRole("button", { name: /^Open Bo/ }));
  return { user, dialog: await screen.findByRole("dialog") };
}

async function sendMessage(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByRole("textbox", { name: "Message Bo" }), text);
  await user.keyboard("{Enter}");
}

const face = () => within(screen.getByRole("dialog")).getByRole("img", { name: /^Bo, / });

describe("Bo's character", () => {
  it("has a face for every mood and names it for screen readers when asked", () => {
    for (const mood of BO_MOODS) {
      const { container, unmount } = renderDashboard(<BoCharacter mood={mood} labelled />);
      const svg = container.querySelector("svg")!;
      expect(svg).toHaveAttribute("data-mood", mood);
      expect(svg).toHaveAttribute("data-motion", "full");
      unmount();
    }
    renderDashboard(<BoCharacter mood="thinking" labelled />);
    expect(screen.getByRole("img", { name: "Bo, thinking" }).querySelectorAll(".bo-dot")).toHaveLength(3);
  });

  it("is decorative unless labelled, and still under reduced motion", () => {
    reducedMotion.value = true;
    const { container } = renderDashboard(<BoCharacter mood="success" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("data-motion", "reduced");
    expect(svg.querySelector(".bo-eyes")).toBeNull(); // happy eyes are arcs
    expect(svg.querySelectorAll(".bo-eyes-happy path")).toHaveLength(2);
  });

  it("is a plain blob whose two capsule eyes carry the expression", () => {
    const { container } = renderDashboard(<BoCharacter mood="idle" />);
    const svg = container.querySelector("svg")!;
    expect(svg.querySelectorAll(".bo-eye")).toHaveLength(2);
    expect(svg.querySelector("linearGradient, radialGradient")).toBeNull();
    expect(svg.querySelector(".bo-dot")).toBeNull();
  });
});

describe("launcher", () => {
  it("shows a badge for nudges and opens and closes with ⌘J", async () => {
    api.state = {
      ...api.state,
      nudges: [
        nudge(),
        nudge({ id: "n2", kind: "site_not_published", title: "Your site isn't published yet" }),
      ],
    };
    const user = userEvent.setup();
    renderBo();
    const launcher = await screen.findByRole("button", { name: "Open Bo, 2 things need your attention" });
    expect(launcher).toHaveAttribute("data-mood", "attention");
    await user.keyboard("{Meta>}j{/Meta}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("2 things need a look.")).toBeInTheDocument();
    await user.keyboard("{Control>}j{/Control}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("home", () => {
  it("lists nudges: ask Bo about one, follow its link, or dismiss it", async () => {
    api.state = { ...api.state, nudges: [nudge()] };
    const { user } = await openBo();
    const card = screen.getByText("2 appointments waiting for approval").closest("li")!;
    expect(within(card).getByRole("link", { name: /Review/ })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/bookings?status=pending_approval",
    );
    await user.click(
      within(card).getByRole("button", { name: "Dismiss: 2 appointments waiting for approval" }),
    );
    await waitFor(() => expect(api.calls.some((c) => c.path.endsWith("/nudges/n1/dismiss"))).toBe(true));
    await waitFor(() =>
      expect(screen.queryByText("2 appointments waiting for approval")).not.toBeInTheDocument(),
    );
  });

  it("starts a conversation from a nudge", async () => {
    api.state = { ...api.state, nudges: [nudge()] };
    api.next = new Turn();
    const { user } = await openBo();
    await user.click(screen.getByRole("button", { name: "Ask Bo" }));
    await waitFor(() => expect(api.sent).toEqual(["Show me the appointments waiting for my approval."]));
    expect(
      within(screen.getByRole("log")).getByText("Show me the appointments waiting for my approval."),
    ).toBeInTheDocument();
  });

  it("offers quick actions in the business's own words", async () => {
    await openBo();
    const actions = screen.getByRole("list", { name: "Quick actions" });
    expect(within(actions).getByRole("button", { name: "What's on today?" })).toBeEnabled();
    expect(within(actions).getByRole("link", { name: /New appointment/ })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/bookings?new=1",
    );
  });

  it("warns when credits are running low", async () => {
    api.state = { ...api.state, credits: credits({ used: 800, remaining: 200, runningLow: true }) };
    await openBo();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Running low on AI credits: 200 left until Sun, 1 Nov.",
    );
  });

  it("without an AI model: an honest notice, no chatting, shortcuts still work", async () => {
    api.state = { ...api.state, configured: false, nudges: [nudge()] };
    await openBo();
    expect(screen.getByText("AI isn't configured on this server")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message Bo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "What's on today?" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Ask Bo" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New appointment/ })).toBeInTheDocument();
  });
});

describe("chat", () => {
  it("streams the reply with tool progress while Bo thinks, then settles happy", async () => {
    const turn = new Turn();
    api.next = turn;
    const { user } = await openBo();
    await sendMessage(user, "What's on today?");
    const log = await screen.findByRole("log", { name: "Conversation with Bo" });
    expect(within(log).getByText("What's on today?")).toBeInTheDocument();
    await waitFor(() => expect(face()).toHaveAttribute("data-mood", "thinking"));
    expect(screen.getByText("Bo is thinking…")).toBeInTheDocument();
    expect(log).toHaveAttribute("aria-busy", "true");

    act(() =>
      turn.push({
        type: "tool",
        tool: { id: "t1", name: "get_schedule", label: "Checking the schedule", status: "running" },
      }),
    );
    expect(await screen.findByText(/Checking the schedule/)).toBeInTheDocument();
    act(() =>
      turn.push(
        {
          type: "tool",
          tool: {
            id: "t1",
            name: "get_schedule",
            label: "Checking the schedule",
            status: "done",
            summary: "Found 4 appointments",
          },
        },
        { type: "text", delta: "You have **4** appointments" },
      ),
    );
    expect(await screen.findByText("Found 4 appointments")).toBeInTheDocument();
    expect(within(log).getByText("4").tagName).toBe("STRONG");
    act(() => turn.push({ type: "text", delta: " today." }));
    await waitFor(() => expect(log).toHaveTextContent("You have 4 appointments today."));

    act(() =>
      turn.end({
        type: "done",
        message: reply({
          text: "You have **4** appointments today.",
          tools: [
            {
              id: "t1",
              name: "get_schedule",
              label: "Checking the schedule",
              status: "done",
              summary: "Found 4 appointments",
            },
          ],
        }),
        credits: credits({ remaining: 986.9 }),
      }),
    );
    await waitFor(() => expect(face()).toHaveAttribute("data-mood", "success"));
    expect(screen.getByText("986 AI credits left")).toBeInTheDocument();
    expect(screen.queryByText("Bo is thinking…")).not.toBeInTheDocument();
    expect(log).toHaveAttribute("aria-busy", "false");
  });

  it("renders a proposal card; confirming shows what was done", async () => {
    const turn = new Turn();
    api.next = turn;
    const { user } = await openBo();
    await sendMessage(user, "Book Robin in tomorrow at 10");
    act(() =>
      turn.end(
        { type: "proposal", action: proposal() },
        {
          type: "done",
          message: reply({ text: "I've prepared that booking.", actions: [proposal()] }),
          credits: credits(),
        },
      ),
    );
    const card = await screen.findByRole("region", { name: "New booking" });
    expect(within(card).getByText("Needs your OK")).toBeInTheDocument();
    expect(within(card).getByText("Tue 6 Oct, 10:00–11:00")).toBeInTheDocument();
    expect(within(card).getByText("€40").tagName).toBe("DEL");
    expect(within(card).getByText("BA-7K3F9Q · Consult · Jordan Casey")).toBeInTheDocument();
    expect(
      within(card).getByText("A new customer record will be created for Robin Example."),
    ).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Book it" }));
    expect(
      await within(card).findByText("Booked Consult for Robin Example (BA-NEW001)."),
    ).toBeInTheDocument();
    expect(within(card).getByText("Done")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Open calendar" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/calendar?date=2026-10-06",
    );
    expect(within(card).queryByRole("button", { name: "Book it" })).not.toBeInTheDocument();
  });

  it("declining a proposal changes nothing", async () => {
    const turn = new Turn();
    api.next = turn;
    const { user } = await openBo();
    await sendMessage(user, "Book Robin");
    act(() => turn.end({ type: "done", message: reply({ actions: [proposal()] }), credits: credits() }));
    const card = await screen.findByRole("region", { name: "New booking" });
    await user.click(within(card).getByRole("button", { name: "Decline" }));
    expect(await within(card).findByText("Declined. Nothing changed.")).toBeInTheDocument();
    expect(api.calls.some((c) => c.path.endsWith("/actions/act1/reject"))).toBe(true);
  });

  it("explains when credits run out, and shows notices from the turn", async () => {
    api.next = json(
      {
        error: {
          code: "AI_LIMIT_REACHED",
          message: "You've used all 100 AI credits on the Free plan this month.",
          fields: {},
        },
      },
      409,
    );
    const { user } = await openBo();
    await sendMessage(user, "Hello");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Out of AI credits for this month");
    expect(within(alert).getByRole("link", { name: "See usage and plans" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/settings/billing",
    );
    await waitFor(() => expect(face()).toHaveAttribute("data-mood", "error"));

    const turn = new Turn();
    api.next = turn;
    await sendMessage(user, "Delete my business");
    act(() =>
      turn.end(
        { type: "notice", notice: { kind: "refusal", message: "That's not something I can help with." } },
        {
          type: "done",
          message: reply({ notice: { kind: "refusal", message: "That's not something I can help with." } }),
          credits: credits(),
        },
      ),
    );
    expect(await screen.findByText("That's not something I can help with.")).toBeInTheDocument();
  });

  it("stops thinking when the stream ends without a finished turn, and says so", async () => {
    const turn = new Turn();
    api.next = turn;
    const { user } = await openBo();
    await sendMessage(user, "What's on today?");
    await waitFor(() => expect(face()).toHaveAttribute("data-mood", "thinking"));
    act(() => turn.end({ type: "text", delta: "Let me look" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Bo stopped before finishing that answer. Please try again.");
    await waitFor(() => expect(face()).toHaveAttribute("data-mood", "error"));
    expect(screen.queryByText("Bo is thinking…")).not.toBeInTheDocument();
    const log = screen.getByRole("log", { name: "Conversation with Bo" });
    expect(within(log).getByText("What's on today?")).toBeInTheDocument();
    expect(within(log).getByText("Let me look")).toBeInTheDocument();
  });

  it("puts a message refused before Bo saw it back in the box", async () => {
    api.next = json(
      { error: { code: "CONFLICT", message: "Bo is still answering in this conversation.", fields: {} } },
      409,
    );
    const { user } = await openBo();
    await sendMessage(user, "Move Robin to Friday");
    expect(await screen.findByRole("alert")).toHaveTextContent("Bo is still answering in this conversation.");
    expect(screen.getByRole("textbox", { name: "Message Bo" })).toHaveValue("Move Robin to Friday");
  });

  it("leaving while a conversation is being created sends nothing", async () => {
    let release!: () => void;
    api.creating = new Promise((resolve) => (release = resolve));
    api.next = new Turn();
    const { user } = await openBo();
    await user.click(screen.getByRole("button", { name: "What's on today?" }));
    await waitFor(() =>
      expect(api.fetch.mock.calls.some(([input]) => String(input).endsWith("/assistant/threads"))).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "New chat" }));
    await act(async () => release());
    expect(await screen.findByText("What can I help with?")).toBeInTheDocument();
    expect(api.sent).toEqual([]);
  });

  it("is keyboard friendly: Enter sends, Shift+Enter adds a line", async () => {
    api.next = new Turn();
    const { user } = await openBo();
    const box = screen.getByRole("textbox", { name: "Message Bo" });
    await user.type(box, "Line one{Shift>}{Enter}{/Shift}Line two");
    expect(box).toHaveValue("Line one\nLine two");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(api.sent).toEqual(["Line one\nLine two"]));
    expect(box).toHaveValue("");
  });
});

describe("memory", () => {
  it("owners add facts; staff can only read them", async () => {
    const { user } = await openBo();
    await user.click(screen.getByRole("button", { name: "Memory" }));
    expect(await screen.findByText(/Nothing saved yet/)).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Add something to remember" }),
      "We close early on Fridays",
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(
      await within(await screen.findByRole("list", { name: "What Bo remembers" })).findByText(
        "We close early on Fridays",
      ),
    ).toBeInTheDocument();
  });

  it("shows the server's error under the field and keeps the text", async () => {
    api.nextMemoryResponse = json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Please check the highlighted fields.",
          fields: { text: "Contains invalid characters" },
        },
      },
      400,
    );
    const { user } = await openBo();
    await user.click(screen.getByRole("button", { name: "Memory" }));
    const box = await screen.findByRole("textbox", { name: "Add something to remember" });
    await user.type(box, "Odd text");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Contains invalid characters")).toBeInTheDocument();
    expect(box).toHaveValue("Odd text");
    expect(api.memory).toEqual([]);
  });

  it("is read-only for staff", async () => {
    api.memory = [{ id: "m1", text: "Parking at the back", createdBy: null, createdAt: "", updatedAt: "" }];
    const user = userEvent.setup();
    renderBo("staff");
    await user.click(await screen.findByRole("button", { name: /^Open Bo/ }));
    await user.click(await screen.findByRole("button", { name: "Memory" }));
    expect(await screen.findByText("Parking at the back")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Add something to remember" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit:/ })).not.toBeInTheDocument();
  });
});
