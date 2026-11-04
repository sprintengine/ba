import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Alert } from "react-native";
import { business } from "@shared/api/__tests__/fixtures/business";
import { customerGroup, service as serviceFixture } from "@shared/api/__tests__/fixtures/catalog";
import type {
  CustomerGroup,
  ReleaseDay,
  Releases,
  ReleaseSchedule,
  ReleaseScheduleInput,
  Service,
} from "@shared/api/types";
import { json, mockApi, pending } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import { SettingsSplitContext } from "../SettingsPage";
import { ReleaseSchedulesSettings } from "./ReleaseSchedulesSettings";

// Tuesday 13 October 2026, 15:00 in Dublin.
const NOW = new Date("2026-10-13T14:00:00Z");
const BASE = `/v1/businesses/${business.id}`;

beforeEach(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
});
afterEach(() => jest.useRealTimers());

const service = (id: string, name: string, patch: Partial<Service> = {}): Service => ({
  ...serviceFixture,
  id,
  name,
  allowedGroupIds: [],
  ...patch,
});
const gp = service("s1", "GP consultation");
const nurse = service("s2", "Nurse appointment");
const bloods = service("s3", "Blood test");
const hidden = service("s4", "Staff only", { isPublic: false });
const gms: CustomerGroup = {
  ...customerGroup,
  id: "g1",
  name: "GMS / medical card holder",
  restricted: true,
};

const schedule = (patch: Partial<ReleaseSchedule> = {}): ReleaseSchedule => ({
  id: "r1",
  name: "GMS next-day",
  serviceIds: ["s1", "s2"],
  everyone: false,
  groupIds: ["g1"],
  cadence: "daily",
  time: "17:00",
  daysBefore: 1,
  weekdaysOnly: true,
  weekday: null,
  weeksAhead: null,
  status: "active",
  createdAt: "2026-09-01T10:00:00+01:00",
  updatedAt: "2026-09-01T10:00:00+01:00",
  ...patch,
});

const day = (date: string, patch: Partial<ReleaseDay> = {}): ReleaseDay => ({
  date,
  scheduledAt: `${date}T17:00:00+01:00`,
  opensAt: `${date}T17:00:00+01:00`,
  state: "scheduled",
  changed: false,
  changedBy: null,
  changedAt: null,
  times: 12,
  ...patch,
});

/** Tuesday open with 3 times left; Wednesday opens today at 17:00; Thursday moved to 22:00 tomorrow; Friday held. */
const releaseDays: ReleaseDay[] = [
  day("2026-10-13", {
    scheduledAt: "2026-10-12T17:00:00+01:00",
    opensAt: "2026-10-12T17:00:00+01:00",
    state: "open",
    times: 3,
  }),
  day("2026-10-14", { scheduledAt: "2026-10-13T17:00:00+01:00", opensAt: "2026-10-13T17:00:00+01:00" }),
  day("2026-10-15", {
    scheduledAt: "2026-10-14T17:00:00+01:00",
    opensAt: "2026-10-14T22:00:00+01:00",
    state: "moved",
    changed: true,
    changedBy: "Avery Morgan",
  }),
  day("2026-10-16", {
    scheduledAt: "2026-10-15T17:00:00+01:00",
    opensAt: null,
    state: "held",
    changed: true,
  }),
];

const releases = (days = releaseDays, scheduleId = "r1"): Releases => ({
  timezone: "Europe/Dublin",
  from: "2026-10-13",
  to: "2026-10-26",
  schedules: [{ scheduleId, name: "GMS next-day", days }],
});

type Sent = { method: string; path: string; body: unknown };

/** A fake of the release endpoints (and the services and groups they need), recording what was sent. */
function fakeApi({
  schedules = [schedule()],
  services = [gp, nurse, bloods, hidden],
  groups = [gms],
  days = releaseDays,
  handle,
}: {
  schedules?: ReleaseSchedule[] | (() => unknown);
  services?: Service[];
  groups?: CustomerGroup[];
  days?: ReleaseDay[];
  handle?: (method: string, path: string, body: unknown) => unknown;
} = {}) {
  const sent: Sent[] = [];
  const fetch = mockApi((method, path, body) => {
    if (method !== "GET") sent.push({ method, path, body });
    const custom = handle?.(method, path, body);
    if (custom !== undefined) return custom;
    if (path.endsWith("/services")) return services;
    if (path.endsWith("/customer-groups")) return groups;
    if (path.endsWith("/release-schedules") && method === "GET")
      return typeof schedules === "function" ? schedules() : schedules;
    if (path.endsWith("/release-schedules") && method === "POST")
      return schedule({ ...(body as ReleaseScheduleInput), id: "r2", status: "active" });
    if (path.includes("/release-schedules/") && method === "PUT" && !path.includes("/changes/"))
      return schedule({ ...(body as ReleaseScheduleInput), id: "r1" });
    if (path.includes("/release-schedules/") && method === "DELETE" && !path.includes("/changes/"))
      return new Response(null, { status: 204 });
    if (path.endsWith("/releases")) return releases(days);
    if (path.includes("/changes/")) return releases(days);
    return undefined;
  });
  return { fetch, sent };
}

const render = (ui = <ReleaseSchedulesSettings />) =>
  renderBusinessScreen(ui, { role: "admin", path: "settings/release-schedules" });

function confirmAlerts() {
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.style === "destructive")?.onPress?.();
  });
}

const row = (date: string) => screen.findByTestId(`release-row-${date}`);

async function openEditor() {
  // Enabled once the services are in (a schedule needs one).
  await waitFor(() => expect(screen.getByTestId("release-new")).toBeEnabled());
  fireEvent.press(screen.getByTestId("release-new"));
  return screen.findByTestId("release-editor");
}

describe("Settings › Release schedules", () => {
  it("lists schedules in plain words, the services no schedule covers and the upcoming releases", async () => {
    fakeApi();
    render();
    const card = await screen.findByTestId("release-schedule-r1");
    expect(card).toHaveTextContent(/GMS next-day/);
    expect(
      screen.getByText("Each day opens the day before at 17:00. Monday opens on Friday."),
    ).toBeOnTheScreen();
    expect(
      screen.getByText("GP consultation, Nurse appointment · GMS / medical card holder"),
    ).toBeOnTheScreen();
    expect(card).toHaveProp("accessibilityRole", "button");
    // Only active public services count; the staff-only one isn't bookable online.
    expect(screen.getByTestId("release-uncovered")).toHaveTextContent(
      "Blood test isn't in an active schedule: they can be booked as far ahead as your policies allow.",
    );
    // Today is open and unchanged, so it isn't listed.
    expect(await row("2026-10-14")).toHaveTextContent(/Opens today at 17:00/);
    expect(screen.queryByTestId("release-row-2026-10-13")).toBeNull();
    expect(screen.getByTestId("release-row-2026-10-15")).toHaveTextContent(/Opens tomorrow at 22:00/);
    expect(screen.getByTestId("release-row-2026-10-15")).toHaveTextContent(
      /Moved from tomorrow at 17:00 by Avery Morgan/,
    );
    expect(screen.getByTestId("release-row-2026-10-16")).toHaveTextContent(/Opens when you open it/);
    expect(screen.getByTestId("release-row-2026-10-16")).toHaveTextContent(/On hold/);
    // Changed releases offer Reset instead of Hold; open ones can't be opened again.
    expect(screen.getByTestId("release-hold-2026-10-14")).toBeOnTheScreen();
    expect(screen.queryByTestId("release-reset-2026-10-14")).toBeNull();
    expect(screen.getByTestId("release-reset-2026-10-15")).toBeOnTheScreen();
  });

  it("opens, holds and resets one release", async () => {
    const { sent } = fakeApi();
    render();
    fireEvent.press(within(await row("2026-10-14")).getByTestId("release-open-2026-10-14"));
    await waitFor(() =>
      expect(sent).toContainEqual({
        method: "PUT",
        path: `${BASE}/release-schedules/r1/changes/2026-10-14`,
        body: { action: "open_now", scope: "release" },
      }),
    );
    expect(await screen.findByText("Opened for booking")).toBeOnTheScreen();

    await waitFor(() => expect(screen.getByTestId("release-hold-2026-10-14")).toBeEnabled());
    fireEvent.press(screen.getByTestId("release-hold-2026-10-14"));
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        method: "PUT",
        path: `${BASE}/release-schedules/r1/changes/2026-10-14`,
        body: { action: "hold", scope: "release" },
      }),
    );
    expect(await screen.findByText("On hold until you open it")).toBeOnTheScreen();

    await waitFor(() => expect(screen.getByTestId("release-reset-2026-10-15")).toBeEnabled());
    fireEvent.press(screen.getByTestId("release-reset-2026-10-15"));
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        method: "DELETE",
        path: `${BASE}/release-schedules/r1/changes/2026-10-15`,
        body: undefined,
      }),
    );
    expect(await screen.findByText("Back on schedule")).toBeOnTheScreen();
  });

  it("says when a change is refused", async () => {
    fakeApi({
      handle: (method, path) =>
        method === "PUT" && path.includes("/changes/")
          ? json({ error: { code: "CONFLICT", message: "That day has already opened.", fields: {} } }, 409)
          : undefined,
    });
    render();
    fireEvent.press(within(await row("2026-10-14")).getByTestId("release-open-2026-10-14"));
    expect(await screen.findByText("That day has already opened.")).toBeOnTheScreen();
  });

  it("moves a release to another time", async () => {
    const { sent } = fakeApi();
    render();
    fireEvent.press(within(await row("2026-10-14")).getByTestId("release-change-2026-10-14"));
    const sheet = await screen.findByTestId("release-change-sheet");
    // A daily schedule opens one day at a time: no "just this day".
    expect(within(sheet).queryByTestId("release-change-day-only")).toBeNull();
    fireEvent(within(sheet).getByTestId("release-change-time-picker"), "change", {
      nativeEvent: { timestamp: new Date(2001, 0, 1, 22, 0).getTime() },
    });
    await act(async () => fireEvent.press(screen.getByTestId("release-change-save")));
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        method: "PUT",
        path: `${BASE}/release-schedules/r1/changes/2026-10-14`,
        body: { action: "move", opensAt: "2026-10-13T22:00:00+01:00", scope: "release" },
      }),
    );
    expect(await screen.findByText("Release time changed")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId("release-change-sheet")).toBeNull());
  });

  it("offers just this day when the release opens a whole week at once", async () => {
    const weekly = schedule({
      cadence: "weekly",
      daysBefore: null,
      weekdaysOnly: false,
      weekday: 5,
      weeksAhead: 1,
    });
    const { sent } = fakeApi({ schedules: [weekly] });
    render();
    expect(await screen.findByText("Every Friday at 17:00, next week (Mon–Sun) opens.")).toBeOnTheScreen();
    fireEvent.press(within(await row("2026-10-14")).getByTestId("release-change-2026-10-14"));
    fireEvent.press(await screen.findByTestId("release-change-day-only"));
    expect(screen.getByTestId("release-change-day-only")).toBeChecked();
    await act(async () => fireEvent.press(screen.getByTestId("release-change-save")));
    await waitFor(() =>
      expect(sent.at(-1)).toMatchObject({
        method: "PUT",
        body: { action: "move", opensAt: "2026-10-13T17:00:00+01:00", scope: "day" },
      }),
    );
  });

  it("switches between schedules' releases", async () => {
    fakeApi({
      schedules: [
        schedule(),
        schedule({ id: "r2", name: "Nurse weekly", serviceIds: ["s3"], everyone: true }),
      ],
    });
    render();
    expect(await row("2026-10-14")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("tab", { name: "Nurse weekly" }));
    expect(await screen.findByText(/Nothing to release in the next 14 days/)).toBeOnTheScreen();
    // Everyone's covered now, so there's no note.
    expect(screen.queryByTestId("release-uncovered")).toBeNull();
  });

  it("has an empty state that starts a schedule", async () => {
    fakeApi({ schedules: [] });
    render();
    const empty = await screen.findByTestId("release-empty");
    fireEvent.press(within(empty).getByRole("button", { name: "New schedule" }));
    expect(await screen.findByTestId("release-editor")).toBeOnTheScreen();
  });

  it("can't start a schedule without a bookable service", async () => {
    fakeApi({ schedules: [], services: [hidden] });
    render();
    const empty = await screen.findByTestId("release-empty");
    expect(within(empty).queryByRole("button", { name: "New schedule" })).toBeNull();
    expect(screen.getByTestId("release-new")).toBeDisabled();
  });

  it("shows a placeholder while loading", async () => {
    mockApi(() => pending());
    render();
    expect(await screen.findByLabelText("Loading the release schedules")).toBeOnTheScreen();
    expect(screen.queryByText("No release schedules")).toBeNull();
  });

  it("shows the error and retries", async () => {
    let fail = true;
    fakeApi({
      schedules: () =>
        fail
          ? json(
              { error: { code: "INTERNAL_SERVER_ERROR", message: "Couldn't load schedules", fields: {} } },
              500,
            )
          : [schedule()],
    });
    render();
    expect(await screen.findByText("Couldn't load schedules")).toBeOnTheScreen();
    fail = false;
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("release-schedule-r1")).toBeOnTheScreen();
  });

  it("creates a schedule from the editor, previewing when days open", async () => {
    const { sent } = fakeApi({ schedules: [] });
    render();
    const sheet = await openEditor();
    // Only bookable services can be chosen.
    expect(within(sheet).queryByTestId("release-editor-services-s4")).toBeNull();
    fireEvent.changeText(within(sheet).getByTestId("release-editor-name"), " GMS next-day ");
    fireEvent.press(within(sheet).getByTestId("release-editor-services-s1"));
    fireEvent.press(within(sheet).getByRole("tab", { name: "Some groups" }));
    fireEvent.press(within(sheet).getByTestId("release-editor-groups-g1"));
    fireEvent(within(sheet).getByTestId("release-editor-weekdays-only"), "valueChange", true);
    // The preview: Wednesday opens today at 17:00; Monday opens on Friday.
    expect(within(sheet).getByTestId("release-editor-summary")).toHaveTextContent(
      "Each day opens the day before at 17:00. Monday opens on Friday.",
    );
    expect(within(sheet).getAllByText("Opens today at 17:00")).toHaveLength(1);
    expect(within(sheet).getAllByText(/^Opens Fri,? 16 Oct at 17:00$/)).toHaveLength(3);
    expect(within(sheet).getAllByText("Open")).toHaveLength(1);
    expect(
      within(sheet).getByText(
        "Saving closes the days that haven't opened yet straight away. Bookings already made are kept.",
      ),
    ).toBeOnTheScreen();
    await act(async () => fireEvent.press(within(sheet).getByTestId("release-editor-save")));
    await waitFor(() =>
      expect(sent).toContainEqual({
        method: "POST",
        path: `${BASE}/release-schedules`,
        body: {
          name: "GMS next-day",
          serviceIds: ["s1"],
          everyone: false,
          groupIds: ["g1"],
          cadence: "daily",
          time: "17:00",
          daysBefore: 1,
          weekdaysOnly: true,
          weekday: null,
          weeksAhead: null,
          active: true,
        },
      }),
    );
    expect(await screen.findByText("GMS next-day created")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId("release-editor")).toBeNull());
  });

  it("asks for services and a group before saving, and switches to week by week", async () => {
    const { sent } = fakeApi({ schedules: [] });
    render();
    const sheet = await openEditor();
    await act(async () => fireEvent.press(within(sheet).getByTestId("release-editor-save")));
    expect(await within(sheet).findByText("Give the schedule a name")).toBeOnTheScreen();
    expect(within(sheet).getByText("Choose at least one service")).toBeOnTheScreen();
    fireEvent.press(within(sheet).getByRole("tab", { name: "Some groups" }));
    await act(async () => fireEvent.press(within(sheet).getByTestId("release-editor-save")));
    expect(await within(sheet).findByText("Choose at least one group, or everyone")).toBeOnTheScreen();

    fireEvent.press(within(sheet).getByRole("tab", { name: "Week by week" }));
    expect(within(sheet).getByTestId("release-editor-summary")).toHaveTextContent(
      "Every Friday at 17:00, next week (Mon–Sun) opens.",
    );
    fireEvent.press(within(sheet).getByTestId("release-editor-weeks-ahead"));
    fireEvent.press(await screen.findByRole("button", { name: "the week after next" }));
    expect(within(sheet).getByTestId("release-editor-summary")).toHaveTextContent(
      "Every Friday at 17:00, the week after next opens.",
    );
    fireEvent.press(within(sheet).getByTestId("release-editor-weekday"));
    fireEvent.press(await screen.findByRole("button", { name: "Sunday" }));
    expect(within(sheet).getByTestId("release-editor-summary")).toHaveTextContent(
      "Every Sunday at 17:00, the week after next opens.",
    );
    expect(sent).toEqual([]);
  });

  it("warns when the policies close the end of a released week", async () => {
    fakeApi({ schedules: [] });
    renderBusinessScreen(<ReleaseSchedulesSettings />, {
      role: "admin",
      path: "settings/release-schedules",
      business: { policies: { ...business.policies, maxAdvanceDays: 10 } },
    });
    const sheet = await openEditor();
    fireEvent.press(within(sheet).getByRole("tab", { name: "Week by week" }));
    expect(within(sheet).getByText(/only let people book 10 days ahead/)).toBeOnTheScreen();
  });

  it("puts the server's overlap error on the services and keeps the sheet open", async () => {
    fakeApi({
      schedules: [],
      handle: (method) =>
        method === "POST"
          ? json(
              {
                error: {
                  code: "INVALID_REQUEST",
                  message: "Check the highlighted fields.",
                  fields: { serviceIds: "GP consultation is already in “Old”, which covers everyone" },
                },
              },
              400,
            )
          : undefined,
    });
    render();
    const sheet = await openEditor();
    fireEvent.changeText(within(sheet).getByTestId("release-editor-name"), "Clash");
    fireEvent.press(within(sheet).getByTestId("release-editor-services-s1"));
    await act(async () => fireEvent.press(within(sheet).getByTestId("release-editor-save")));
    expect(
      await within(sheet).findByText("GP consultation is already in “Old”, which covers everyone"),
    ).toBeOnTheScreen();
    expect(screen.getByTestId("release-editor")).toBeOnTheScreen();
  });

  it("shows the API's message when the business already has 20 schedules", async () => {
    fakeApi({
      schedules: [],
      handle: (method) =>
        method === "POST"
          ? json(
              {
                error: {
                  code: "POLICY_VIOLATION",
                  message: "A business can have at most 20 release schedules.",
                  fields: {},
                },
              },
              422,
            )
          : undefined,
    });
    render();
    const sheet = await openEditor();
    fireEvent.changeText(within(sheet).getByTestId("release-editor-name"), "One more");
    fireEvent.press(within(sheet).getByTestId("release-editor-services-s1"));
    await act(async () => fireEvent.press(within(sheet).getByTestId("release-editor-save")));
    expect(await within(sheet).findByTestId("form-error")).toHaveTextContent(
      "A business can have at most 20 release schedules.",
    );
  });

  it("edits a schedule, pausing it", async () => {
    const { sent } = fakeApi();
    render();
    fireEvent.press(await screen.findByTestId("release-schedule-r1"));
    const sheet = await screen.findByTestId("release-editor");
    expect(within(sheet).getByTestId("release-editor-name")).toHaveDisplayValue("GMS next-day");
    expect(
      within(sheet).getByText("Days that are already open stay open when you change the time."),
    ).toBeOnTheScreen();
    fireEvent(within(sheet).getByTestId("release-editor-active"), "valueChange", false);
    fireEvent.press(within(sheet).getByTestId("release-editor-days-before"));
    fireEvent.press(await screen.findByRole("button", { name: "2 days before" }));
    await act(async () => fireEvent.press(within(sheet).getByTestId("release-editor-save")));
    await waitFor(() =>
      expect(sent).toContainEqual({
        method: "PUT",
        path: `${BASE}/release-schedules/r1`,
        body: {
          name: "GMS next-day",
          serviceIds: ["s1", "s2"],
          everyone: false,
          groupIds: ["g1"],
          cadence: "daily",
          time: "17:00",
          daysBefore: 2,
          weekdaysOnly: true,
          weekday: null,
          weeksAhead: null,
          active: false,
        },
      }),
    );
    expect(await screen.findByText("GMS next-day saved")).toBeOnTheScreen();
  });

  it("deletes a schedule after confirming", async () => {
    confirmAlerts();
    const { sent } = fakeApi();
    render();
    fireEvent.press(await screen.findByTestId("release-schedule-r1"));
    await act(async () => fireEvent.press(await screen.findByTestId("release-editor-delete")));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Delete GMS next-day?",
      "Its days open to online booking straight away, as far ahead as your policies allow.",
      expect.anything(),
      expect.anything(),
    );
    await waitFor(() =>
      expect(sent).toContainEqual({
        method: "DELETE",
        path: `${BASE}/release-schedules/r1`,
        body: undefined,
      }),
    );
    expect(await screen.findByText("Schedule deleted")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId("release-editor")).toBeNull());
  });

  it("asks before throwing away an edited schedule", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "cancel")?.onPress?.();
    });
    fakeApi();
    render();
    const sheet = await openEditor();
    fireEvent.changeText(within(sheet).getByTestId("release-editor-name"), "Draft");
    await act(async () => fireEvent.press(within(sheet).getByRole("button", { name: "Close" })));
    expect(alert).toHaveBeenCalledWith(
      "Discard changes?",
      expect.any(String),
      expect.anything(),
      expect.anything(),
    );
    expect(screen.getByTestId("release-editor")).toBeOnTheScreen();

    alert.mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    await act(async () => fireEvent.press(within(sheet).getByRole("button", { name: "Close" })));
    await waitFor(() => expect(screen.queryByTestId("release-editor")).toBeNull());
  });

  it("titles itself beside the sections list on iPad", async () => {
    fakeApi();
    render(
      <SettingsSplitContext.Provider value>
        <ReleaseSchedulesSettings />
      </SettingsSplitContext.Provider>,
    );
    expect(await screen.findByRole("header", { name: "Release schedules" })).toBeOnTheScreen();
    expect(await screen.findByTestId("release-schedule-r1")).toBeOnTheScreen();
  });
});
