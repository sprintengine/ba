import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Speech from "expo-speech";
import { AccessibilityInfo } from "react-native";
import { business as businessFixture, me as meFixture } from "@shared/api/__tests__/fixtures/business";
import type { Business, Me, MemberRole } from "@shared/api/types";
import { BusinessContextProvider } from "@shared/business/business-context";
import { VocabularyProvider } from "@shared/vocabulary";
import { apiError } from "~/test/api-mock";
import { renderWithProviders } from "~/test/render";
import { AssistantProvider } from "./assistant-context";
import { AssistantPanel } from "./AssistantPanel";
import { fakeRecognizer, type FakeRecognizer } from "./dictation/fake-recognizer";
import { credits, fakeAssistantApi, nudge, proposal, reply, Turn } from "./fake-assistant-api";

jest.mock("expo-speech", () => ({ speak: jest.fn(), stop: jest.fn(() => Promise.resolve()) }));

const business: Business = {
  ...businessFixture,
  slug: "lumen-physio",
  locale: "en-IE",
  timezone: "Europe/Dublin",
};
const me = (role: MemberRole): Me => ({
  ...meFixture,
  memberships: [{ ...meFixture.memberships[0]!, slug: "lumen-physio", role }],
});

function renderPanel({
  role = "owner",
  recognizer = fakeRecognizer(),
  navigate = jest.fn(),
}: { role?: MemberRole; recognizer?: FakeRecognizer; navigate?: jest.Mock } = {}) {
  const result = renderWithProviders(
    <BusinessContextProvider value={{ business, role, me: me(role) }}>
      <VocabularyProvider vocabulary={business.vocabulary}>
        <AssistantProvider onClose={jest.fn()} onNavigate={navigate}>
          <AssistantPanel recognizer={recognizer} />
        </AssistantProvider>
      </VocabularyProvider>
    </BusinessContextProvider>,
  );
  return { ...result, navigate, recognizer };
}

const input = () => screen.getByTestId("assistant-input");
/** Bo's state has loaded (the composer is enabled). */
const ready = () => screen.findByText(/AI credits left/);
const send = (text: string) => {
  fireEvent.changeText(input(), text);
  fireEvent.press(screen.getByRole("button", { name: "Send" }));
};

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
});

describe("Bo's home", () => {
  it("greets, shows nudges, quick actions and recent conversations", async () => {
    const api = fakeAssistantApi({
      nudges: [nudge()],
      threads: [{ id: "t-earlier", title: "Earlier", updatedAt: "2026-10-05T08:00:00Z" }],
    });
    const { navigate } = renderPanel();
    expect(await screen.findByText("2 appointments waiting for approval")).toBeOnTheScreen();
    expect(screen.getByText("One thing needs a look.")).toBeOnTheScreen();
    expect(screen.getByTestId("assistant-subtitle")).toHaveTextContent(/AI credits left/);
    fireEvent.press(screen.getByRole("button", { name: "Review" }));
    expect(navigate).toHaveBeenCalledWith("/dashboard/lumen-physio/bookings?status=pending_approval");
    fireEvent.press(screen.getByRole("button", { name: "Dismiss: 2 appointments waiting for approval" }));
    await waitFor(() =>
      expect(api.calls).toContain("POST /v1/businesses/" + business.id + "/assistant/nudges/n1/dismiss"),
    );
    // A recent conversation opens with its messages.
    fireEvent.press(screen.getByTestId("thread-t-earlier"));
    expect(await screen.findByText(/all confirmed/)).toBeOnTheScreen();
  });

  it("says when AI isn't configured, and keeps the shortcuts that don't need it", async () => {
    fakeAssistantApi({ configured: false });
    renderPanel();
    expect(await screen.findByTestId("assistant-not-configured")).toBeOnTheScreen();
    expect(screen.getByTestId("assistant-subtitle")).toHaveTextContent("AI not connected");
    expect(screen.queryByTestId("quick-today")).toBeNull();
    expect(screen.getByTestId("quick-new")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("warns when credits run low or out, with the way to plans for owners", async () => {
    fakeAssistantApi({ credits: credits({ remaining: 0, used: 1000, limitReached: true }) });
    const { navigate } = renderPanel();
    expect(await screen.findByText(/used up/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "See plans" }));
    expect(navigate).toHaveBeenCalledWith("/dashboard/lumen-physio/settings/billing");
    expect(input()).toHaveProp("placeholder", "Out of AI credits this month");
  });
});

describe("chatting with Bo", () => {
  it("streams the reply live, shows tool activity, and announces the finished answer", async () => {
    const api = fakeAssistantApi();
    renderPanel();
    await ready();
    const turn = new Turn();
    api.next = turn;
    send("What's on tomorrow?");
    expect(await screen.findByText("What's on tomorrow?")).toBeOnTheScreen();
    expect(await screen.findByTestId("assistant-thinking")).toBeOnTheScreen();
    await act(async () => {
      turn.push({
        type: "tool",
        tool: { id: "tool1", name: "get_schedule", label: "Checking the calendar", status: "running" },
      });
      turn.push({ type: "text", delta: "Tomorrow you have " });
    });
    expect(await screen.findByText("Checking the calendar…")).toBeOnTheScreen();
    expect(await screen.findByText(/Tomorrow you have/)).toBeOnTheScreen();
    expect(screen.getByTestId("message-live")).toBeOnTheScreen();
    await act(async () => {
      turn.end(
        { type: "text", delta: "**two** bookings." },
        {
          type: "done",
          message: reply({
            text: "Tomorrow you have **two** bookings.",
            tools: [
              {
                id: "tool1",
                name: "get_schedule",
                label: "Checking the calendar",
                status: "done",
                summary: "2 bookings",
              },
            ],
          }),
          credits: credits({ remaining: 980 }),
        },
      );
    });
    expect(await screen.findByText("2 bookings")).toBeOnTheScreen();
    expect(screen.queryByTestId("message-live")).toBeNull();
    expect(api.sent).toEqual(["What's on tomorrow?"]);
    expect(api.calls.filter((c) => c.startsWith("POST"))).toEqual([
      `POST /v1/businesses/${business.id}/assistant/threads`,
      `POST /v1/businesses/${business.id}/assistant/threads/t1/messages`,
    ]);
    await waitFor(() =>
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
        "Bo said: Tomorrow you have two bookings.",
      ),
    );
  });

  it("confirms a proposal: the change runs and the card shows what was done, with its links", async () => {
    const api = fakeAssistantApi();
    const { navigate } = renderPanel();
    await ready();
    const turn = new Turn();
    api.next = turn;
    send("Book Robin in tomorrow at 10");
    await act(async () => {
      turn.end(
        { type: "proposal", action: proposal() },
        { type: "done", message: reply({ actions: [proposal()] }), credits: credits() },
      );
    });
    const card = await screen.findByTestId("proposal-act1");
    expect(within(card).getByText("Needs your OK")).toBeOnTheScreen();
    expect(
      within(card).getByText("A new customer record will be created for Robin Example."),
    ).toBeOnTheScreen();
    expect(within(card).getByLabelText("Price: €40 to €45")).toBeOnTheScreen();
    fireEvent.press(within(card).getByRole("button", { name: "Book it" }));
    expect(await within(card).findByText("Booked Consult for Robin Example (BA-NEW001).")).toBeOnTheScreen();
    expect(within(card).getByText("Done")).toBeOnTheScreen();
    expect(api.calls).toContain(`POST /v1/businesses/${business.id}/assistant/actions/act1/confirm`);
    fireEvent.press(within(card).getByRole("button", { name: "Open calendar" }));
    expect(navigate).toHaveBeenCalledWith("/dashboard/lumen-physio/calendar?date=2026-10-06");
  });

  it("declines a proposal: nothing changes", async () => {
    const api = fakeAssistantApi();
    renderPanel();
    await ready();
    const turn = new Turn();
    api.next = turn;
    send("Cancel Jordan");
    await act(async () => {
      turn.end({
        type: "done",
        message: reply({
          actions: [
            proposal({ proposal: { ...proposal().proposal, destructive: true, confirmLabel: "Cancel it" } }),
          ],
        }),
        credits: credits(),
      });
    });
    fireEvent.press(await screen.findByRole("button", { name: "Decline" }));
    expect(await screen.findByText("Declined. Nothing changed.")).toBeOnTheScreen();
    expect(api.calls).toContain(`POST /v1/businesses/${business.id}/assistant/actions/act1/reject`);
  });

  it("a message refused before the turn (out of credits) comes back into the box, with the way out", async () => {
    const api = fakeAssistantApi();
    renderPanel();
    await ready();
    api.next = apiError(409, "AI_LIMIT_REACHED", "This month's AI credits are used up.");
    send("How was last week?");
    expect(await screen.findByText("Out of AI credits for this month")).toBeOnTheScreen();
    expect(screen.getByText("This month's AI credits are used up.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "See usage and plans" })).toBeOnTheScreen();
    expect(input()).toHaveProp("value", "How was last week?");
  });

  it("a turn that stops without finishing keeps what was said and says so", async () => {
    const api = fakeAssistantApi();
    renderPanel();
    await ready();
    const turn = new Turn();
    api.next = turn;
    send("Move Sam");
    // What the server kept of the turn (the refreshed thread replaces the local copy).
    api.stored = [
      { ...reply({ id: "u1", text: "Move Sam" }), role: "user" },
      reply({ id: "p1", text: "Looking at Sam's" }),
    ];
    await act(async () => {
      turn.end({ type: "text", delta: "Looking at Sam's" });
    });
    expect(await screen.findByText(/stopped before finishing/)).toBeOnTheScreen();
    expect(screen.getByText("Looking at Sam's")).toBeOnTheScreen();
  });

  it("reads replies aloud when hands-free is on", async () => {
    const api = fakeAssistantApi();
    renderPanel();
    await ready();
    fireEvent.press(screen.getByRole("button", { name: "Read replies aloud" }));
    expect(screen.getByRole("button", { name: "Stop reading replies aloud" })).toBeOnTheScreen();
    const turn = new Turn();
    api.next = turn;
    send("Anything today?");
    await act(async () => {
      turn.end({
        type: "done",
        message: reply({ text: "- One booking\n- One request" }),
        credits: credits(),
      });
    });
    await waitFor(() =>
      expect(Speech.speak).toHaveBeenCalledWith(
        "One booking. One request.",
        expect.objectContaining({ language: "en-IE" }),
      ),
    );
  });
});

describe("dictation", () => {
  it("dictates into the box in the business's language; nothing is sent until Send", async () => {
    const api = fakeAssistantApi();
    const recognizer = fakeRecognizer({ onDevice: true });
    renderPanel({ recognizer });
    await ready();
    fireEvent.changeText(input(), "Hi Bo.");
    fireEvent.press(screen.getByRole("button", { name: "Dictate" }));
    await waitFor(() => expect(recognizer.started).toHaveLength(1));
    expect(recognizer.started[0]).toMatchObject({ lang: "en-IE", requiresOnDeviceRecognition: true });
    act(() => recognizer.emit("start"));
    expect(screen.getByRole("button", { name: "Stop dictating" })).toBeOnTheScreen();
    expect(input()).toHaveProp("placeholder", "Listening on this device…");
    act(() => recognizer.emit("result", { transcript: "what's on", isFinal: false }));
    expect(input()).toHaveProp("value", "Hi Bo. What's on");
    act(() => recognizer.emit("result", { transcript: "what's on today?", isFinal: true }));
    fireEvent.press(screen.getByRole("button", { name: "Stop dictating" }));
    expect(recognizer.calls).toContain("stop");
    act(() => recognizer.emit("end"));
    expect(screen.getByRole("button", { name: "Dictate" })).toBeOnTheScreen();
    expect(input()).toHaveProp("value", "Hi Bo. What's on today?");
    expect(api.sent).toEqual([]);
    expect(recognizer.listeners()).toBe(0);
  });

  it("sending while listening sends what was heard and turns the microphone off", async () => {
    const api = fakeAssistantApi();
    const recognizer = fakeRecognizer();
    renderPanel({ recognizer });
    await ready();
    api.next = new Turn();
    fireEvent.press(screen.getByRole("button", { name: "Dictate" }));
    await waitFor(() => expect(recognizer.started).toHaveLength(1));
    act(() => recognizer.emit("start"));
    act(() => recognizer.emit("result", { transcript: "block Friday afternoon", isFinal: false }));
    fireEvent.press(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(api.sent).toEqual(["Block Friday afternoon"]));
    expect(recognizer.calls).toContain("abort");
    expect(input()).toHaveProp("value", "");
  });

  it("explains a refused permission, with Settings", async () => {
    fakeAssistantApi();
    renderPanel({ recognizer: fakeRecognizer({ granted: false }) });
    await ready();
    fireEvent.press(screen.getByRole("button", { name: "Dictate" }));
    expect(await screen.findByTestId("dictation-error")).toHaveTextContent(/Settings/);
    expect(screen.getByRole("button", { name: "Open Settings" })).toBeOnTheScreen();
  });
});

describe("memory", () => {
  it("owners add what Bo should remember; staff only read it", async () => {
    const api = fakeAssistantApi();
    renderPanel();
    fireEvent.press(await screen.findByRole("tab", { name: "Memory" }));
    expect(await screen.findByText(/Nothing saved yet/)).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId("memory-input"), "We close early on Fridays");
    fireEvent.press(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("We close early on Fridays")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Forget: We close early on Fridays" }));
    await waitFor(() => expect(api.memory).toEqual([]));
  });

  it("staff can't change it", async () => {
    const api = fakeAssistantApi();
    api.memory = [{ id: "mem1", text: "Parking at the back", createdBy: null, createdAt: "", updatedAt: "" }];
    renderPanel({ role: "staff" });
    fireEvent.press(await screen.findByRole("tab", { name: "Memory" }));
    expect(await screen.findByText("Parking at the back")).toBeOnTheScreen();
    expect(screen.getByText(/Owners and admins can change them/)).toBeOnTheScreen();
    expect(screen.queryByTestId("memory-input")).toBeNull();
  });
});
