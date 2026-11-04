import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { resource } from "@shared/api/__tests__/fixtures/catalog";
import { ids } from "@shared/api/__tests__/fixtures/ids";
import type { MemberRole, Resource } from "@shared/api/types";
import { apiError, calls, mockApi } from "~/test/api-mock";
import { B, renderOpsScreen } from "~/test/render-ops-screen";
import * as layout from "~/ui/layout";
import { BlockTimeSheet } from "./BlockTimeSheet";

const alex: Resource = resource;
const jordan: Resource = { ...resource, id: ids.resource2, name: "Jordan Casey", sortOrder: 1 };
const retired: Resource = { ...resource, id: ids.room, name: "Sasha Former", isActive: false };

function api(
  resources: Resource[] = [alex, jordan, retired],
  extra?: (m: string, p: string, body: unknown) => unknown,
) {
  const posted: { path: string; body: unknown }[] = [];
  const fetch = mockApi((method, path, body) => {
    const custom = extra?.(method, path, body);
    if (custom !== undefined) return custom;
    if (path === `${B}/resources`) return resources;
    if (method === "POST" && (path.endsWith("/overrides") || path === `${B}/closures`)) {
      posted.push({ path, body });
      return { id: "00000000-0000-4000-8000-000000000099", resourceId: null, ...(body as object) };
    }
    return undefined;
  });
  return { fetch, posted };
}

function renderSheet({
  role = "owner",
  date = "2026-10-08",
  visible = true,
}: { role?: MemberRole; date?: string; visible?: boolean } = {}) {
  const onClose = jest.fn();
  renderOpsScreen(<BlockTimeSheet visible={visible} onClose={onClose} date={date} />, {
    section: "overview",
    role,
  });
  return onClose;
}

describe("BlockTimeSheet", () => {
  beforeEach(() => {
    // Tuesday 6 October 2026 in Dublin; only the clock is fake.
    jest.useFakeTimers({
      now: new Date("2026-10-06T07:30:00Z"),
      doNotFake: [
        "nextTick",
        "setImmediate",
        "clearImmediate",
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "queueMicrotask",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "requestIdleCallback",
        "cancelIdleCallback",
        "hrtime",
        "performance",
      ],
    });
    jest.spyOn(layout, "useLayout").mockReturnValue({ isWide: false, width: 390, height: 844 });
  });
  afterEach(() => jest.useRealTimers());

  it("blocks part of a day for the chosen therapist", async () => {
    const { posted } = api();
    const onClose = renderSheet();
    const sheet = await screen.findByTestId("block-time-sheet");
    expect(
      within(sheet).getByText("Existing appointments aren't changed — move or cancel them separately."),
    ).toBeOnTheScreen();
    // The first active therapist is chosen; a deactivated one can't be.
    expect(await within(sheet).findByTestId(`block-for-${alex.id}`)).toBeChecked();
    expect(within(sheet).queryByTestId(`block-for-${retired.id}`)).toBeNull();
    expect(within(sheet).getByTestId("date-2026-10-08")).toBeChecked();

    fireEvent.press(within(sheet).getByTestId(`block-for-${jordan.id}`));
    fireEvent.press(within(sheet).getByTestId("date-2026-10-09"));
    fireEvent.press(within(sheet).getByTestId("block-partial"));
    fireEvent.changeText(within(sheet).getByLabelText("From"), "10:00");
    fireEvent.changeText(within(sheet).getByLabelText("Until"), "12:30");
    fireEvent.changeText(within(sheet).getByLabelText("Note (optional)"), "  Training  ");
    fireEvent.press(within(sheet).getByTestId("save-block-time"));

    expect(await screen.findByText("Time blocked")).toBeOnTheScreen();
    expect(posted).toEqual([
      {
        path: `${B}/resources/${jordan.id}/overrides`,
        body: {
          date: "2026-10-09",
          isAvailable: false,
          startTime: "10:00",
          endTime: "12:30",
          reason: "Training",
        },
      },
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes the whole business for the day", async () => {
    const { posted } = api();
    const onClose = renderSheet();
    fireEvent.press(await screen.findByTestId("block-for-business"));
    expect(screen.getByTestId("block-for-business")).toBeChecked();
    expect(screen.getByText("All day")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("save-block-time"));
    expect(await screen.findByText("Closure added")).toBeOnTheScreen();
    expect(posted).toEqual([
      {
        path: `${B}/closures`,
        body: { date: "2026-10-08", isAvailable: false, startTime: null, endTime: null, reason: null },
      },
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it("won't save a time that ends before it starts", async () => {
    const { fetch } = api();
    renderSheet();
    fireEvent.press(await screen.findByTestId("block-partial"));
    expect(screen.getByTestId("block-partial")).toBeChecked();
    fireEvent.changeText(screen.getByLabelText("Until"), "08:00");
    expect(await screen.findByText("Ends before it starts")).toBeOnTheScreen();
    expect(screen.getByTestId("save-block-time")).toBeDisabled();
    // Back to a whole day off: the times no longer matter.
    fireEvent.press(screen.getByTestId("block-all-day"));
    expect(screen.queryByLabelText("Until")).toBeNull();
    expect(screen.getByTestId("save-block-time")).toBeEnabled();
    expect(calls(fetch).filter((c) => c.startsWith("POST"))).toEqual([]);
  });

  it("says when the note is too long", async () => {
    const { posted } = api();
    const onClose = renderSheet();
    fireEvent.changeText(await screen.findByLabelText("Note (optional)"), "x".repeat(201));
    fireEvent.press(screen.getByTestId("save-block-time"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Keep it under 200 characters");
    expect(posted).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the API's error and stays open", async () => {
    api(undefined, (method, path) =>
      method === "POST" && path === `${B}/resources/${alex.id}/overrides`
        ? apiError(409, "CONFLICT", "Alex is already off that day")
        : undefined,
    );
    const onClose = renderSheet();
    // Save waits for the therapists (until then, "who" would be the whole business).
    expect(await screen.findByTestId("save-block-time")).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId("save-block-time")).toBeEnabled());
    expect(screen.getByTestId(`block-for-${alex.id}`)).toBeChecked();
    fireEvent.press(screen.getByTestId("save-block-time"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Alex is already off that day");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("block-time-sheet")).toBeOnTheScreen();
  });

  it("lets staff block their own time, from today on", async () => {
    const { posted } = api([alex]);
    renderSheet({ role: "staff", date: "2026-10-01" });
    const sheet = await screen.findByTestId("block-time-sheet");
    // One therapist and no closures for staff: nothing to choose.
    expect(within(sheet).queryByText("For")).toBeNull();
    expect(within(sheet).queryByTestId("block-for-business")).toBeNull();
    // A past date starts at today.
    expect(within(sheet).getByTestId("date-2026-10-06")).toBeChecked();
    expect(within(sheet).getByText("Day off")).toBeOnTheScreen();
    await waitFor(() => expect(within(sheet).getByTestId("save-block-time")).toBeEnabled());
    fireEvent.press(within(sheet).getByTestId("save-block-time"));
    expect(await screen.findByText("Time blocked")).toBeOnTheScreen();
    expect(posted).toEqual([
      {
        path: `${B}/resources/${alex.id}/overrides`,
        body: { date: "2026-10-06", isAvailable: false, startTime: null, endTime: null, reason: null },
      },
    ]);
  });

  it("can't save when there's nobody to block time for", async () => {
    const { fetch } = api([]);
    renderSheet({ role: "staff" });
    await waitFor(() => expect(calls(fetch)).toContain(`GET ${B}/resources`));
    await screen.findByTestId("save-block-time");
    expect(screen.queryByText("For")).toBeNull();
    expect(screen.getByTestId("save-block-time")).toBeDisabled();
  });

  it("closes, and shows nothing when hidden", async () => {
    api();
    const onClose = renderSheet();
    fireEvent.press(
      within(await screen.findByTestId("block-time-sheet")).getByRole("button", { name: "Close" }),
    );
    expect(onClose).toHaveBeenCalled();
    screen.unmount();
    renderSheet({ visible: false });
    expect(screen.queryByTestId("block-time-sheet")).toBeNull();
  });
});
