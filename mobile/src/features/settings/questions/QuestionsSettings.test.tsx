import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Alert } from "react-native";
import { business } from "@shared/api/__tests__/fixtures/business";
import { formQuestion, service } from "@shared/api/__tests__/fixtures/catalog";
import { ids } from "@shared/api/__tests__/fixtures/ids";
import type { FormQuestion } from "@shared/api/types";
import { apiError, json, mockApi } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import { QuestionsSettings } from "./QuestionsSettings";
import { moveUpdates } from "./questions";

const PATH = `/v1/businesses/${business.id}/questions`;

/** Asked for every service, first in the list, sensitive and switched off. */
const reason: FormQuestion = {
  ...formQuestion,
  id: ids.question2,
  serviceId: null,
  label: "Reason for your visit",
  helpText: null,
  kind: "textarea",
  options: [],
  required: false,
  sensitive: true,
  isActive: false,
  sortOrder: 0,
};
const knee: FormQuestion = { ...formQuestion, sortOrder: 1 };

type Req = { method: string; path: string; body: unknown };

function api({
  questions = [reason, knee],
  services = [service],
  handle,
}: {
  questions?: FormQuestion[] | (() => unknown);
  services?: unknown[];
  handle?: (method: string, path: string, body: unknown) => unknown;
} = {}) {
  const writes: Req[] = [];
  // The server's questions: saves change what the next GET returns.
  let store = typeof questions === "function" ? [] : [...questions];
  const fetch = mockApi((method, path, body) => {
    if (method !== "GET") writes.push({ method, path, body });
    const custom = handle?.(method, path, body);
    if (custom !== undefined) return custom;
    if (method === "GET" && path === PATH) return typeof questions === "function" ? questions() : store;
    if (method === "GET" && path.endsWith("/services")) return services;
    if (method === "POST" && path === PATH) {
      const created = { ...knee, ...(body as object), id: "new" };
      store = [...store, created];
      return created;
    }
    const id = path.split("/").pop();
    if (method === "PATCH" && path.startsWith(`${PATH}/`)) {
      store = store.map((q) => (q.id === id ? { ...q, ...(body as object) } : q));
      return store.find((q) => q.id === id);
    }
    if (method === "DELETE") {
      store = store.filter((q) => q.id !== id);
      return new Response(null, { status: 204 });
    }
    if (path === "/v1/me") return { memberships: [] };
    return undefined;
  });
  return { fetch, writes };
}

const render = () => renderBusinessScreen(<QuestionsSettings />, { path: "settings/questions" });

describe("Settings › Questions", () => {
  it("lists the questions in order with their marks, type and service", async () => {
    api();
    render();
    const first = await screen.findByTestId(`question-${reason.id}`);
    expect(first).toHaveAccessibleName("Reason for your visit, sensitive, off. Long answer · All services");
    expect(screen.getByTestId(`question-${knee.id}`)).toHaveAccessibleName(
      "Which knee?, required. Choice: Left, Right, Both · Initial assessment",
    );
    expect(screen.getByText("Sensitive")).toBeOnTheScreen();
    expect(screen.getByText("Off")).toBeOnTheScreen();
    expect(screen.getByText("Required")).toBeOnTheScreen();
    // The first can't move up, the last can't move down.
    expect(screen.getByTestId(`question-up-${reason.id}`)).toBeDisabled();
    expect(screen.getByTestId(`question-down-${knee.id}`)).toBeDisabled();
    expect(screen.getByText(/Name, email and phone are always collected/)).toBeOnTheScreen();
  });

  it("filters by service, without the move buttons", async () => {
    api();
    render();
    fireEvent.press(await screen.findByTestId("questions-filter"));
    fireEvent.press(await screen.findByRole("button", { name: "Initial assessment" }));
    await waitFor(() => expect(screen.queryByTestId(`question-${reason.id}`)).toBeNull());
    expect(screen.getByTestId(`question-${knee.id}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`question-up-${knee.id}`)).toBeNull();

    fireEvent.press(screen.getByTestId("questions-filter"));
    fireEvent.press(await screen.findByRole("button", { name: "Asked for all services" }));
    expect(await screen.findByTestId(`question-${reason.id}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`question-${knee.id}`)).toBeNull();

    // A new question from a service's filter is asked for that service.
    fireEvent.press(screen.getByTestId("questions-filter"));
    fireEvent.press(await screen.findByRole("button", { name: "Initial assessment" }));
    fireEvent.press(screen.getByTestId("question-new"));
    expect(await screen.findByTestId("question-service")).toHaveAccessibleName("Ask for: Initial assessment");
  });

  it("moves a question by swapping sort orders with its neighbour", async () => {
    const { writes } = api();
    render();
    fireEvent.press(await screen.findByTestId(`question-down-${reason.id}`));
    await waitFor(() => expect(writes).toHaveLength(2));
    // Once both are saved the list re-sorts: the moved question can go back up.
    await waitFor(() => expect(screen.getByTestId(`question-up-${reason.id}`)).toBeEnabled());
    expect(writes).toEqual(
      expect.arrayContaining([
        { method: "PATCH", path: `${PATH}/${reason.id}`, body: { sortOrder: 1 } },
        { method: "PATCH", path: `${PATH}/${knee.id}`, body: { sortOrder: 0 } },
      ]),
    );
  });

  it("offers moving as a screen reader action, and says when it fails", async () => {
    api({ handle: (method) => (method === "PATCH" ? apiError(409, "CONFLICT", "Try again") : undefined) });
    render();
    const row = await screen.findByTestId(`question-${knee.id}`);
    expect(row.props.accessibilityActions).toEqual([{ name: "moveUp", label: "Move up" }]);
    await act(async () => fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "moveUp" } }));
    expect(await screen.findByText("Try again")).toBeOnTheScreen();
  });

  it("adds a question, checking a choice question has choices", async () => {
    const { writes } = api();
    render();
    fireEvent.press(await screen.findByTestId("question-new"));
    const sheet = await screen.findByTestId("question-sheet");
    fireEvent.changeText(within(sheet).getByTestId("question-label"), "  Which instrument?  ");
    fireEvent.changeText(within(sheet).getByTestId("question-hint"), "So we bring the right teacher");
    fireEvent.press(within(sheet).getByTestId("question-kind"));
    fireEvent.press(await screen.findByRole("button", { name: "Choice" }));
    await act(async () => fireEvent.press(screen.getByTestId("question-save")));
    expect(await screen.findByText("Add at least one choice")).toBeOnTheScreen();
    expect(writes).toEqual([]);

    fireEvent.changeText(screen.getByTestId("question-choices"), "Piano\n\n Guitar \n");
    fireEvent(screen.getByTestId("question-required"), "valueChange", true);
    await act(async () => fireEvent.press(screen.getByTestId("question-save")));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: "POST",
      path: PATH,
      body: {
        label: "Which instrument?",
        helpText: "So we bring the right teacher",
        kind: "select",
        options: ["Piano", "Guitar"],
        required: true,
        sensitive: false,
        serviceId: null,
        isActive: true,
        sortOrder: 2,
      },
    });
    expect(await screen.findByText("Question added")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId("question-sheet")).toBeNull());
  });

  it("edits a question, putting the server's choice errors on the choices", async () => {
    const { writes } = api({
      handle: (method) =>
        method === "PATCH"
          ? json(
              {
                error: {
                  code: "INVALID_REQUEST",
                  message: "Check the highlighted fields.",
                  fields: { "options[1]": "Too long" },
                },
              },
              400,
            )
          : undefined,
    });
    render();
    fireEvent.press(await screen.findByTestId(`question-${knee.id}`));
    expect(await screen.findByTestId("question-label")).toHaveDisplayValue("Which knee?");
    expect(screen.getByTestId("question-choices")).toHaveDisplayValue("Left\nRight\nBoth");
    fireEvent(screen.getByTestId("question-active"), "valueChange", false);
    await act(async () => fireEvent.press(screen.getByTestId("question-save")));
    expect(await screen.findByText("Too long")).toBeOnTheScreen();
    expect(writes[0]).toMatchObject({
      method: "PATCH",
      path: `${PATH}/${knee.id}`,
      body: { isActive: false, sortOrder: 1, serviceId: service.id },
    });
  });

  it("deletes a question after confirming", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    const { writes } = api();
    render();
    fireEvent.press(await screen.findByTestId(`question-${reason.id}`));
    await act(async () => fireEvent.press(await screen.findByTestId("question-delete")));
    expect(alert.mock.calls[0]?.[0]).toBe("Delete this question?");
    await waitFor(() =>
      expect(writes).toEqual([{ method: "DELETE", path: `${PATH}/${reason.id}`, body: undefined }]),
    );
    expect(await screen.findByText("Question deleted")).toBeOnTheScreen();
  });

  it("asks before closing a sheet with changes", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    api();
    render();
    fireEvent.press(await screen.findByTestId("question-new"));
    fireEvent.changeText(await screen.findByTestId("question-label"), "Anything else?");
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Close" })));
    expect(alert).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("question-sheet")).toBeNull());
  });

  it("shows the empty state, with a way to add one, and no filter without services", async () => {
    api({ questions: [], services: [] });
    render();
    expect(await screen.findByTestId("questions-empty")).toBeOnTheScreen();
    expect(screen.queryByTestId("questions-filter")).toBeNull();
    fireEvent.press(
      within(screen.getByTestId("questions-empty")).getByRole("button", { name: "New question" }),
    );
    expect(await screen.findByTestId("question-sheet")).toBeOnTheScreen();
  });

  it("shows an error with a retry", async () => {
    let fail = true;
    api({ questions: () => (fail ? apiError(500, "INTERNAL", "Server down") : [knee]) });
    render();
    expect(await screen.findByText("Server down")).toBeOnTheScreen();
    fail = false;
    await act(async () => fireEvent.press(screen.getByRole("button", { name: /try again/i })));
    expect(await screen.findByTestId(`question-${knee.id}`)).toBeOnTheScreen();
  });
});

describe("moveUpdates", () => {
  it("swaps with the neighbour, using positions when sort orders tie, and nothing at the ends", () => {
    const a = { ...knee, id: "a", sortOrder: 3 };
    const b = { ...knee, id: "b", sortOrder: 3 };
    expect(moveUpdates([a, b], "a", 1)).toEqual([
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 0 },
    ]);
    expect(moveUpdates([a, b], "a", -1)).toBeNull();
    expect(moveUpdates([a, b], "missing", 1)).toBeNull();
  });
});
