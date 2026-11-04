import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FormQuestion, FormQuestionInput, Service } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { mockApi, renderDashboard } from "../../test/render";
import { QuestionsSettings } from "../questions-settings";
import { apiError, invalidRequest, question, service } from "./settings-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio/settings/questions",
  useSearchParams: () => new URLSearchParams(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

type Overrides = {
  list?: () => unknown;
  create?: (input: FormQuestionInput) => unknown;
  update?: (id: string, input: Partial<FormQuestionInput>) => unknown;
  remove?: () => unknown;
};

/** A stateful fake of the questions endpoints (and the services list), recording what was sent. */
function fakeQuestions(initial: FormQuestion[], services: Service[] = [], overrides: Overrides = {}) {
  let questions = [...initial];
  const sent: { method: string; path: string; body: unknown }[] = [];
  mockApi((method, path, body) => {
    if (path.endsWith("/services")) return services;
    if (!path.includes("/questions")) return {};
    if (method !== "GET") sent.push({ method, path, body });
    const id = path.split("/questions/")[1] ?? "";
    if (method === "GET") return overrides.list ? overrides.list() : questions;
    if (method === "POST") {
      const input = body as FormQuestionInput;
      if (overrides.create) return overrides.create(input);
      const created = { ...input, id: `q${questions.length + 1}` };
      questions = [...questions, created];
      return created;
    }
    if (method === "PATCH") {
      const input = body as Partial<FormQuestionInput>;
      if (overrides.update) return overrides.update(id, input);
      questions = questions.map((q) => (q.id === id ? { ...q, ...input } : q));
      return questions.find((q) => q.id === id);
    }
    if (method === "DELETE") {
      if (overrides.remove) return overrides.remove();
      questions = questions.filter((q) => q.id !== id);
      return new Response(null, { status: 204 });
    }
    return {};
  });
  return sent;
}

const reason = question({ id: "q1", label: "Reason for visit", sortOrder: 0, required: true });
const instrument = question({
  id: "q2",
  label: "Instrument",
  kind: "select",
  options: ["Piano", "Guitar"],
  serviceId: "s1",
  sortOrder: 1,
});
const history = question({
  id: "q3",
  label: "Medical history",
  kind: "textarea",
  sensitive: true,
  isActive: false,
  serviceId: "gone",
  sortOrder: 2,
});
const services = [service("s1", "Lessons"), service("s2", "Assessment")];

const items = () =>
  within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((li) => li.textContent);

describe("QuestionsSettings", () => {
  it("explains questions when there are none", async () => {
    fakeQuestions([]);
    const { container } = renderDashboard(<QuestionsSettings />);
    expect(await screen.findByText("No questions")).toBeInTheDocument();
    expect(screen.getByText("What to ask patients when they book.")).toBeInTheDocument();
    // No services: no filter.
    expect(screen.queryByRole("combobox", { name: "Filter by service" })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("shows the error and retries", async () => {
    let fail = true;
    fakeQuestions([reason], [], {
      list: () => (fail ? apiError(500, "INTERNAL_SERVER_ERROR", "Questions are unavailable.") : [reason]),
    });
    const user = userEvent.setup();
    renderDashboard(<QuestionsSettings />);
    expect(await screen.findByText("Questions are unavailable.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Reason for visit")).toBeInTheDocument();
  });

  it("lists the questions in order with their type, service and badges; axe-clean", async () => {
    fakeQuestions([history, instrument, reason], services);
    const { container } = renderDashboard(<QuestionsSettings />);
    await screen.findByText("Reason for visit");
    await screen.findByRole("combobox", { name: "Filter by service" });
    expect(items()).toEqual([
      expect.stringContaining("Reason for visitRequiredShort answer · All services"),
      expect.stringContaining("InstrumentChoice: Piano, Guitar · Lessons"),
      expect.stringMatching(/Medical history\s*Sensitive\s*OffLong answer · A service/),
    ]);
    // Row buttons say which question they act on.
    expect(screen.getByRole("button", { name: "Move “Reason for visit” up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move “Reason for visit” down" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move “Medical history” down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit “Instrument”" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete “Instrument”" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("moves a question by swapping sort orders with its neighbour", async () => {
    const sent = fakeQuestions([reason, instrument, history]);
    const user = userEvent.setup();
    renderDashboard(<QuestionsSettings />);
    await user.click(await screen.findByRole("button", { name: "Move “Instrument” up" }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent).toEqual(
      expect.arrayContaining([
        { method: "PATCH", path: "/v1/businesses/b1/questions/q2", body: { sortOrder: 0 } },
        { method: "PATCH", path: "/v1/businesses/b1/questions/q1", body: { sortOrder: 1 } },
      ]),
    );
    await waitFor(() => expect(items()[0]).toContain("Instrument"));
  });

  it("gives questions that share a sort order distinct positions when moved", async () => {
    const sent = fakeQuestions([
      question({ id: "a", label: "First", sortOrder: 0 }),
      question({ id: "b", label: "Second", sortOrder: 0 }),
    ]);
    const user = userEvent.setup();
    renderDashboard(<QuestionsSettings />);
    await user.click(await screen.findByRole("button", { name: "Move “First” down" }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent).toEqual(
      expect.arrayContaining([
        { method: "PATCH", path: "/v1/businesses/b1/questions/a", body: { sortOrder: 1 } },
        { method: "PATCH", path: "/v1/businesses/b1/questions/b", body: { sortOrder: 0 } },
      ]),
    );
  });

  it("holds the arrows while a move is saving, so moves can't cross", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    fakeQuestions([reason, instrument, history]);
    const fake = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") await held;
      return fake(input, init);
    });
    const user = userEvent.setup();
    renderDashboard(<QuestionsSettings />);
    await user.click(await screen.findByRole("button", { name: "Move “Instrument” up" }));
    expect(screen.getByRole("button", { name: "Move “Medical history” up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move “Reason for visit” down" })).toBeDisabled();
    release();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move “Medical history” up" })).toBeEnabled(),
    );
  });

  it("adds a new question after the last one, past any gaps left by deletes", async () => {
    const sent = fakeQuestions([reason, { ...history, sortOrder: 5 }]);
    const user = userEvent.setup();
    renderDashboard(<QuestionsSettings />);
    await screen.findByText("Reason for visit");
    await user.click(screen.getByRole("button", { name: "New question" }));
    const dialog = await screen.findByRole("dialog", { name: "New question" });
    await user.type(within(dialog).getByRole("textbox", { name: "Question" }), "Any injuries?");
    await user.click(within(dialog).getByRole("button", { name: "Add question" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.body).toMatchObject({ label: "Any injuries?", sortOrder: 6 });
  });

  it("reports a failed move", async () => {
    fakeQuestions([reason, instrument], [], {
      update: () => apiError(409, "CONFLICT", "Someone else is editing the questions."),
    });
    const user = userEvent.setup();
    renderDashboard(<QuestionsSettings />);
    await user.click(await screen.findByRole("button", { name: "Move “Reason for visit” down" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Someone else is editing the questions."));
  });

  it("filters by service, without reordering, and adds new questions to that service", async () => {
    const sent = fakeQuestions([reason, instrument], services);
    const user = userEvent.setup();
    renderDashboard(<QuestionsSettings />);
    await screen.findByText("Reason for visit");
    const filter = await screen.findByRole("combobox", { name: "Filter by service" });

    await user.click(filter);
    await user.click(await screen.findByRole("option", { name: "Lessons" }));
    expect(items()).toEqual([expect.stringContaining("Instrument")]);
    expect(screen.queryByRole("button", { name: /Move/ })).not.toBeInTheDocument();

    await user.click(filter);
    await user.click(await screen.findByRole("option", { name: "Asked for all services" }));
    expect(items()).toEqual([expect.stringContaining("Reason for visit")]);

    await user.click(filter);
    await user.click(await screen.findByRole("option", { name: "Assessment" }));
    expect(screen.getByText("No questions")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New question" }));
    const dialog = await screen.findByRole("dialog", { name: "New question" });
    expect(within(dialog).getByRole("combobox", { name: "Ask for" })).toHaveTextContent("Assessment");
    await user.type(within(dialog).getByRole("textbox", { name: "Question" }), "Any injuries?");
    await user.click(within(dialog).getByRole("button", { name: "Add question" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.body).toMatchObject({ label: "Any injuries?", serviceId: "s2", sortOrder: 2 });
  });

  describe("the question dialog", () => {
    it("adds a choice question: validates, then sends the parsed choices", async () => {
      const sent = fakeQuestions([reason], services);
      const user = userEvent.setup();
      renderDashboard(<QuestionsSettings />);
      await screen.findByText("Reason for visit");
      await user.click(screen.getByRole("button", { name: "New question" }));
      const dialog = await screen.findByRole("dialog", { name: "New question" });
      const label = within(dialog).getByRole("textbox", { name: "Question" });
      expect(label).toHaveFocus();
      expect(within(dialog).queryByRole("switch", { name: "Active" })).not.toBeInTheDocument();
      await expectNoAxeViolations(document.body);

      await user.click(within(dialog).getByRole("button", { name: "Add question" }));
      expect(label).toHaveAccessibleDescription("Write the question");
      expect(label).toHaveAttribute("aria-invalid", "true");

      await user.type(label, "Which instrument?");
      await user.click(within(dialog).getByRole("combobox", { name: "Answer type" }));
      await user.click(await screen.findByRole("option", { name: "Choice" }));
      const choices = within(dialog).getByRole("textbox", { name: "Choices" });
      await user.click(within(dialog).getByRole("button", { name: "Add question" }));
      expect(choices).toHaveAccessibleDescription(/Add at least one choice/);
      expect(choices).toHaveFocus();

      await user.type(choices, "Piano{Enter}{Enter} Guitar ");
      await user.click(within(dialog).getByRole("combobox", { name: "Ask for" }));
      await user.click(await screen.findByRole("option", { name: "Lessons" }));
      await user.click(within(dialog).getByRole("switch", { name: "Required" }));
      await user.click(within(dialog).getByRole("switch", { name: "Sensitive" }));
      await user.click(within(dialog).getByRole("button", { name: "Add question" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(sent).toEqual([
        {
          method: "POST",
          path: "/v1/businesses/b1/questions",
          body: {
            label: "Which instrument?",
            helpText: null,
            kind: "select",
            options: ["Piano", "Guitar"],
            required: true,
            sensitive: true,
            serviceId: "s1",
            isActive: true,
            sortOrder: 1,
          },
        },
      ]);
      expect(toast.success).toHaveBeenCalledWith("Question added");
      expect(await screen.findByText("Which instrument?")).toBeInTheDocument();
    });

    it("edits a question and can switch it off", async () => {
      const sent = fakeQuestions([instrument], services);
      const user = userEvent.setup();
      renderDashboard(<QuestionsSettings />);
      await user.click(await screen.findByRole("button", { name: "Edit “Instrument”" }));
      const dialog = await screen.findByRole("dialog", { name: "Edit question" });
      expect(within(dialog).getByRole("textbox", { name: "Choices" })).toHaveValue("Piano\nGuitar");
      await user.type(within(dialog).getByRole("textbox", { name: /hint/i }), "Pick one");
      await user.click(within(dialog).getByRole("switch", { name: "Active" }));
      await user.click(within(dialog).getByRole("button", { name: "Save" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(sent[0]).toMatchObject({
        method: "PATCH",
        path: "/v1/businesses/b1/questions/q2",
        body: { helpText: "Pick one", isActive: false, sortOrder: 1, serviceId: "s1" },
      });
      expect(toast.success).toHaveBeenCalledWith("Question saved");
    });

    it("puts the server's option errors under Choices", async () => {
      fakeQuestions([instrument], services, {
        update: () => invalidRequest({ "options[1]": "Must be 1 to 100 characters" }),
      });
      const user = userEvent.setup();
      renderDashboard(<QuestionsSettings />);
      await user.click(await screen.findByRole("button", { name: "Edit “Instrument”" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Save" }));

      const choices = await within(dialog).findByRole("textbox", {
        name: "Choices",
        description: /1 to 100 characters/,
      });
      expect(choices).toHaveAttribute("aria-invalid", "true");
      expect(choices).toHaveFocus();
      expect(within(dialog).getAllByRole("alert")).toHaveLength(1);
    });

    it("puts other errors at the top of the dialog", async () => {
      fakeQuestions([reason], [], {
        create: () => apiError(403, "FORBIDDEN", "Only admins can add questions."),
      });
      const user = userEvent.setup();
      renderDashboard(<QuestionsSettings />);
      await screen.findByText("Reason for visit");
      await user.click(screen.getByRole("button", { name: "New question" }));
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByRole("textbox", { name: "Question" }), "Allergies?");
      await user.click(within(dialog).getByRole("button", { name: "Add question" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("Only admins can add questions.");
    });

    it("closes on Escape and Cancel, returning focus to the button that opened it", async () => {
      fakeQuestions([reason]);
      const user = userEvent.setup();
      renderDashboard(<QuestionsSettings />);
      const edit = await screen.findByRole("button", { name: "Edit “Reason for visit”" });
      await user.click(edit);
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(edit).toHaveFocus());

      await user.click(screen.getByRole("button", { name: "New question" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
  });

  describe("deleting", () => {
    it("asks first, then deletes", async () => {
      const sent = fakeQuestions([reason, instrument]);
      const user = userEvent.setup();
      renderDashboard(<QuestionsSettings />);
      await user.click(await screen.findByRole("button", { name: "Delete “Instrument”" }));
      const confirm = await screen.findByRole("alertdialog", { name: "Delete this question?" });
      expect(confirm).toHaveAccessibleDescription("Answers already given stay on past appointments.");
      await user.click(within(confirm).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(screen.queryByText("Instrument")).not.toBeInTheDocument());
      expect(sent).toEqual([{ method: "DELETE", path: "/v1/businesses/b1/questions/q2", body: undefined }]);
      expect(toast.success).toHaveBeenCalledWith("Question deleted");
    });

    it("reports a failure", async () => {
      fakeQuestions([reason], [], { remove: () => apiError(404, "NOT_FOUND", "That question is gone.") });
      const user = userEvent.setup();
      renderDashboard(<QuestionsSettings />);
      await user.click(await screen.findByRole("button", { name: "Delete “Reason for visit”" }));
      await user.click(await screen.findByRole("button", { name: "Delete" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That question is gone."));
    });
  });
});
