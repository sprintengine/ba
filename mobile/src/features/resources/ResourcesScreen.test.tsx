import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { Alert, View } from "react-native";
import { business, me, teamMember } from "@shared/api/__tests__/fixtures/business";
import { customerGroup, resource } from "@shared/api/__tests__/fixtures/catalog";
import type {
  AvailabilityOverride,
  AvailabilityRule,
  CustomerGroup,
  Resource,
  TeamMember,
} from "@shared/api/types";
import { calls, json, mockApi, pending } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import * as layout from "~/ui/layout";
import { ResourceScreen } from "./ResourceScreen";
import { ResourcesScreen } from "./ResourcesScreen";

const BASE = `/v1/businesses/${business.id}`;

// Alex is linked to the signed-in member (teamMember.userId is me.user.id).
const alex: Resource = { ...resource, sortOrder: 0 };
const room: Resource = {
  ...resource,
  id: "r_room",
  kind: "space",
  name: "Room 1",
  description: null,
  color: "#3b82f6",
  capacity: 4,
  memberId: null,
  sortOrder: 1,
};
const laser: Resource = {
  ...room,
  id: "r_laser",
  kind: "equipment",
  name: "Laser",
  capacity: 1,
  isActive: false,
  sortOrder: 2,
};
const sam: TeamMember = {
  ...teamMember,
  id: "m_sam",
  userId: "u_sam",
  name: "Sam Lee",
  email: "sam@example.test",
};

const monday: AvailabilityRule = {
  id: "rule1",
  resourceId: alex.id,
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "17:00",
  validFrom: null,
  validUntil: null,
  audienceGroupIds: [],
};
const dayOff: AvailabilityOverride = {
  id: "ov1",
  resourceId: alex.id,
  date: "2099-01-05",
  isAvailable: false,
  startTime: null,
  endTime: null,
  reason: "Holiday",
};
const closure: AvailabilityOverride = {
  ...dayOff,
  id: "cl1",
  resourceId: null,
  date: "2099-12-25",
  reason: "Christmas",
};

type Sent = { method: string; path: string; body: unknown };

function api({
  resources = [alex, room, laser],
  team = [teamMember, sam],
  rules = [monday],
  overrides = [dayOff],
  groups = [] as CustomerGroup[],
  handle,
}: {
  resources?: Resource[];
  team?: TeamMember[];
  rules?: AvailabilityRule[];
  overrides?: AvailabilityOverride[];
  groups?: CustomerGroup[];
  handle?: (method: string, path: string, body: unknown) => unknown;
} = {}) {
  const sent: Sent[] = [];
  const fetch = mockApi((method, path, body) => {
    if (method !== "GET") sent.push({ method, path, body });
    const custom = handle?.(method, path, body);
    if (custom !== undefined) return custom;
    if (method === "GET" && path === `${BASE}/resources`) return resources;
    if (method === "GET" && path === `${BASE}/team`) return team;
    if (method === "GET" && path.endsWith("/availability")) return { rules, overrides };
    if (method === "GET" && path === `${BASE}/closures`) return [closure];
    if (method === "GET" && path === `${BASE}/customer-groups`) return groups;
    if (method === "PUT" && path.endsWith("/rules")) return { rules: [], warnings: [] };
    if (method === "DELETE") return new Response(null, { status: 204 });
    return undefined;
  });
  return { fetch, sent };
}

const wide = (isWide: boolean) =>
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide, width: isWide ? 1024 : 390, height: 800 });

function confirmAlerts() {
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.style === "destructive")?.onPress?.();
  });
}

const renderList = (role: "owner" | "admin" | "staff" = "owner") =>
  renderBusinessScreen(<ResourcesScreen />, {
    role,
    me,
    path: "resources",
    routes: { "dashboard/[slug]/resources/[id]": () => <ResourceScreen /> },
  });

/** A resource's own screen (`resources/[id]`), as a phone opens it from the list. */
function renderResource(id: string, role: "owner" | "admin" | "staff" = "owner") {
  const result = renderBusinessScreen(<View />, {
    role,
    me,
    path: "resources",
    routes: { "dashboard/[slug]/resources/[id]": () => <ResourceScreen /> },
  });
  act(() => router.push(`/dashboard/${result.business.slug}/resources/${id}`));
  return result;
}

const at = (h: number, m = 0) => ({ nativeEvent: { timestamp: new Date(2001, 0, 1, h, m).getTime() } });

beforeEach(() => wide(false));
afterEach(() => jest.restoreAllMocks());

describe("Resources list", () => {
  it("lists active resources first with their kind and who they're linked to, inactive ones after", async () => {
    api();
    renderList();
    const alexRow = await screen.findByTestId(`resource-${alex.id}`);
    expect(alexRow).toHaveProp("accessibilityLabel", "Alex Morgan, Person, Linked to Avery Morgan");
    expect(screen.getByTestId("resource-r_room")).toHaveTextContent(/Space · 4 places/);
    expect(screen.getByRole("header", { name: "INACTIVE" })).toBeOnTheScreen();
    expect(screen.getByTestId("resource-r_laser")).toHaveTextContent(/Inactive/);
    // Admins add resources and manage the business's closed days.
    expect(screen.getByTestId("resource-add")).toBeOnTheScreen();
    expect(await screen.findByTestId("override-cl1")).toHaveTextContent(/Christmas/);
  });

  it("lets staff see the list but not add resources or closures", async () => {
    api();
    renderList("staff");
    expect(await screen.findByTestId(`resource-${alex.id}`)).toBeOnTheScreen();
    expect(screen.getByText("Your working hours and time off.")).toBeOnTheScreen();
    expect(screen.queryByTestId("resource-add")).toBeNull();
    expect(screen.queryByTestId("closures")).toBeNull();
  });

  it("tells staff with no calendar to ask an admin", async () => {
    api({ resources: [] });
    renderList("staff");
    expect(await screen.findByText("You're not linked to a calendar")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Add/ })).toBeNull();
  });

  it("offers admins the first resource when there are none", async () => {
    api({ resources: [] });
    renderList("admin");
    expect(await screen.findByText("No therapists yet")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Add therapist" }));
    expect(await screen.findByTestId("resource-sheet")).toBeOnTheScreen();
  });

  it("shows a skeleton while loading", async () => {
    mockApi(() => pending());
    renderList();
    expect(await screen.findByLabelText("Loading therapists")).toBeOnTheScreen();
  });

  it("shows an error with a retry when the list can't load", async () => {
    let failing = true;
    api({
      handle: (method, path) =>
        failing && path === `${BASE}/resources`
          ? json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Boom", fields: {} } }, 500)
          : undefined,
    });
    renderList();
    expect(await screen.findByTestId("error-state")).toBeOnTheScreen();
    failing = false;
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId(`resource-${alex.id}`)).toBeOnTheScreen();
  });

  it("adds a resource linked to a team member", async () => {
    const { sent } = api({
      handle: (method, path, body) =>
        method === "POST" && path === `${BASE}/resources`
          ? { ...room, ...(body as object), id: "r_new" }
          : undefined,
    });
    renderList();
    fireEvent.press(await screen.findByTestId("resource-add"));
    const sheet = await screen.findByTestId("resource-sheet");
    fireEvent.press(within(sheet).getByTestId("resource-save"));
    expect(await screen.findByText("Enter a name")).toBeOnTheScreen();

    fireEvent.changeText(within(sheet).getByTestId("resource-name"), "Jordan Kay");
    fireEvent.press(within(sheet).getByTestId("resource-member"));
    fireEvent.press((await screen.findAllByRole("button", { name: "Sam Lee" })).at(-1)!);
    await act(async () => fireEvent.press(within(sheet).getByTestId("resource-save")));
    expect(await screen.findByText("Jordan Kay added")).toBeOnTheScreen();
    expect(sent.at(-1)).toMatchObject({
      method: "POST",
      body: {
        name: "Jordan Kay",
        kind: "person",
        memberId: "m_sam",
        capacity: 1,
        isActive: true,
        sortOrder: 3,
      },
    });
  });

  it("adds a closed day for the whole business", async () => {
    const { sent } = api({
      handle: (method, path, body) =>
        method === "POST" && path === `${BASE}/closures`
          ? { ...closure, ...(body as object), id: "cl2" }
          : undefined,
    });
    renderList();
    fireEvent.press(await screen.findByTestId("closure-add"));
    await screen.findByTestId("closure-sheet");
    fireEvent.changeText(screen.getByTestId("closure-reason"), "Bank holiday");
    await act(async () => fireEvent.press(screen.getByTestId("closure-save")));
    expect(await screen.findByText("Closure added")).toBeOnTheScreen();
    expect(sent.at(-1)).toMatchObject({
      method: "POST",
      body: { isAvailable: false, reason: "Bank holiday" },
    });
  });

  it("opens a resource on its own screen on phones", async () => {
    api();
    renderList();
    fireEvent.press(await screen.findByTestId("resource-r_room"));
    expect(await screen.findByTestId("resource-screen")).toBeOnTheScreen();
    expect(await screen.findByText("Room 1", { exact: true })).toBeOnTheScreen();
  });
});

describe("Resources on a large screen", () => {
  beforeEach(() => wide(true));

  it("shows the list beside the first resource, and switches the detail in place", async () => {
    api();
    renderList();
    const detail = await screen.findByTestId("resource-detail");
    expect(within(detail).getByText("Alex Morgan")).toBeOnTheScreen();
    expect(screen.getByTestId(`resource-${alex.id}`)).toHaveProp("accessibilityState", { selected: true });
    fireEvent.press(screen.getByTestId("resource-r_room"));
    await waitFor(() =>
      expect(within(screen.getByTestId("resource-detail")).getByText("Room 1")).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId("resource-screen")).toBeNull();
  });

  it("asks before leaving unsaved hours for another resource", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "cancel")?.onPress?.();
    });
    api();
    renderList();
    fireEvent(await screen.findByTestId("hours-tuesday-open"), "valueChange", true);
    fireEvent.press(screen.getByTestId("resource-r_room"));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "Discard changes?",
        expect.anything(),
        expect.anything(),
        expect.anything(),
      ),
    );
    expect(within(screen.getByTestId("resource-detail")).getByText("Alex Morgan")).toBeOnTheScreen();
  });

  it("edits a resource's details", async () => {
    const { sent } = api({
      handle: (method, path, body) => (method === "PATCH" ? { ...alex, ...(body as object) } : undefined),
    });
    renderList();
    fireEvent.press(await screen.findByTestId("resource-edit"));
    const sheet = await screen.findByTestId("resource-sheet");
    fireEvent.changeText(within(sheet).getByTestId("resource-name"), "Alex M.");
    fireEvent(within(sheet).getByTestId("resource-active"), "valueChange", false);
    await act(async () => fireEvent.press(within(sheet).getByTestId("resource-save")));
    expect(await screen.findByText("Saved")).toBeOnTheScreen();
    expect(sent.at(-1)).toMatchObject({
      method: "PATCH",
      path: `${BASE}/resources/${alex.id}`,
      body: { name: "Alex M.", isActive: false },
    });
  });

  it("deletes a resource after confirming", async () => {
    confirmAlerts();
    const { fetch } = api();
    renderList();
    fireEvent.press(await screen.findByTestId("resource-edit"));
    await act(async () => fireEvent.press(await screen.findByTestId("resource-delete")));
    expect(await screen.findByText("Alex Morgan removed")).toBeOnTheScreen();
    expect(calls(fetch)).toContain(`DELETE ${BASE}/resources/${alex.id}`);
  });

  it("asks admins to choose a resource when none is open", async () => {
    api({ resources: [] });
    renderList();
    expect(await screen.findByText("Choose a therapist")).toBeOnTheScreen();
  });
});

describe("A resource's weekly hours", () => {
  it("opens a day, changes its times and saves the week", async () => {
    const { sent } = api();
    renderResource(alex.id);
    expect(await screen.findByTestId("hours-total")).toHaveTextContent("8 h a week");
    expect(screen.getByTestId("hours-save")).toBeDisabled();

    fireEvent(screen.getByTestId("hours-wednesday-open"), "valueChange", true);
    fireEvent(screen.getByTestId("hours-wednesday-0-start-picker"), "change", at(10));
    fireEvent(screen.getByTestId("hours-wednesday-0-end-picker"), "change", at(14));
    expect(screen.getByTestId("hours-unsaved")).toBeOnTheScreen();
    expect(screen.getByTestId("hours-total")).toHaveTextContent("12 h a week");
    await act(async () => fireEvent.press(screen.getByTestId("hours-save")));
    expect(await screen.findByText("Hours saved")).toBeOnTheScreen();
    expect(sent.at(-1)).toEqual({
      method: "PUT",
      path: `${BASE}/resources/${alex.id}/rules`,
      body: {
        rules: [
          {
            dayOfWeek: 1,
            startTime: "09:00",
            endTime: "17:00",
            validFrom: null,
            validUntil: null,
            audienceGroupIds: [],
          },
          {
            dayOfWeek: 3,
            startTime: "10:00",
            endTime: "14:00",
            validFrom: null,
            validUntil: null,
            audienceGroupIds: [],
          },
        ],
      },
    });
  });

  it("adds a second range, flags an overlap and blocks saving until it's fixed", async () => {
    api();
    renderResource(alex.id);
    fireEvent.press(await screen.findByTestId("hours-monday-add"));
    expect(screen.getByTestId("hours-monday-1")).toBeOnTheScreen();
    fireEvent(screen.getByTestId("hours-monday-1-start-picker"), "change", at(16));
    expect(screen.getByTestId("hours-monday-1-error")).toHaveTextContent(/Overlaps 09:00–17:00/);
    expect(screen.getByTestId("hours-save")).toBeDisabled();
    fireEvent.press(screen.getByRole("button", { name: /Remove Monday 16:00/ }));
    expect(screen.queryByTestId("hours-monday-1")).toBeNull();
    expect(screen.getByTestId("hours-save")).toBeDisabled();
  });

  it("copies a day to the weekdays and discards the change", async () => {
    api();
    renderResource(alex.id);
    fireEvent.press(await screen.findByTestId("hours-monday-copy"));
    fireEvent.press(await screen.findByTestId("copy-weekdays"));
    expect(screen.getByTestId("hours-friday-0")).toBeOnTheScreen();
    expect(screen.queryByTestId("hours-saturday-0")).toBeNull();
    expect(screen.getByTestId("hours-total")).toHaveTextContent("40 h a week");
    fireEvent.press(screen.getByTestId("hours-discard"));
    expect(screen.queryByTestId("hours-friday-0")).toBeNull();
    expect(screen.queryByTestId("hours-unsaved")).toBeNull();
  });

  it("closes a day", async () => {
    const { sent } = api();
    renderResource(alex.id);
    fireEvent(await screen.findByTestId("hours-monday-open"), "valueChange", false);
    expect(screen.queryByTestId("hours-monday-0")).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId("hours-save")));
    await waitFor(() => expect(sent.at(-1)).toMatchObject({ method: "PUT", body: { rules: [] } }));
  });

  it("limits hours to customer groups", async () => {
    const { sent } = api({
      groups: [customerGroup, { ...customerGroup, id: "g_off", name: "Old", isActive: false }],
    });
    renderResource(alex.id);
    const who = await screen.findByTestId("hours-monday-0-audience");
    expect(who).toHaveProp("accessibilityLabel", "Who can book Monday 09:00–17:00: Everyone");
    fireEvent.press(who);
    const sheet = await screen.findByTestId("audience-sheet");
    // Inactive groups aren't offered.
    expect(within(sheet).queryByText("Old")).toBeNull();
    fireEvent.press(within(sheet).getByRole("checkbox", { name: "Members" }));
    fireEvent.press(within(sheet).getByTestId("audience-done"));
    expect(screen.getByTestId("hours-monday-0-audience")).toHaveProp(
      "accessibilityLabel",
      "Who can book Monday 09:00–17:00: Members",
    );
    await act(async () => fireEvent.press(screen.getByTestId("hours-save")));
    await waitFor(() =>
      expect(sent.at(-1)).toMatchObject({
        body: { rules: [{ dayOfWeek: 1, audienceGroupIds: [customerGroup.id] }] },
      }),
    );
  });

  it("adds seasonal hours for a period, then removes them", async () => {
    const { sent } = api();
    renderResource(alex.id);
    fireEvent.press(await screen.findByTestId("hours-seasonal"));
    await screen.findByTestId("period-sheet");
    expect(screen.getByTestId("period-add")).toBeDisabled();
    fireEvent.press(screen.getByTestId("period-from"));
    fireEvent(screen.getByTestId("period-from-picker"), "change", {
      nativeEvent: { timestamp: new Date(2099, 5, 1, 12).getTime() },
    });
    fireEvent.press(screen.getByTestId("period-until"));
    fireEvent(screen.getByTestId("period-until-picker"), "change", {
      nativeEvent: { timestamp: new Date(2099, 4, 1, 12).getTime() },
    });
    expect(screen.getByText("The end is before the start")).toBeOnTheScreen();
    fireEvent(screen.getByTestId("period-until-picker"), "change", {
      nativeEvent: { timestamp: new Date(2099, 7, 31, 12).getTime() },
    });
    fireEvent.press(screen.getByTestId("period-add"));

    expect(await screen.findByTestId("hours-period")).toBeOnTheScreen();
    expect(screen.getByTestId("hours-which")).toHaveProp(
      "accessibilityLabel",
      expect.stringMatching(/1 Jun – 31 Aug 2099/),
    );
    fireEvent(screen.getByTestId("hours-friday-open"), "valueChange", true);
    await act(async () => fireEvent.press(screen.getByTestId("hours-save")));
    await waitFor(() =>
      expect(sent.at(-1)).toMatchObject({
        body: {
          rules: [
            { dayOfWeek: 1, validFrom: null },
            {
              dayOfWeek: 5,
              startTime: "09:00",
              endTime: "17:00",
              validFrom: "2099-06-01",
              validUntil: "2099-08-31",
            },
          ],
        },
      }),
    );
  });

  it("switches between regular and seasonal hours and removes a period", async () => {
    api({
      rules: [monday, { ...monday, id: "rule2", dayOfWeek: 6, validFrom: "2099-06-01", validUntil: null }],
    });
    renderResource(alex.id);
    const which = await screen.findByTestId("hours-which");
    expect(which).toHaveProp("accessibilityLabel", "Which hours: Regular hours");
    expect(screen.queryByTestId("hours-period")).toBeNull();
    fireEvent.press(which);
    fireEvent.press((await screen.findAllByRole("button", { name: /1 Jun onwards/ })).at(-1)!);
    expect(await screen.findByTestId("hours-period")).toBeOnTheScreen();
    expect(screen.getByTestId("hours-saturday-0")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("hours-period-remove"));
    expect(screen.queryByTestId("hours-period")).toBeNull();
    expect(screen.queryByTestId("hours-which")).toBeNull();
    expect(screen.getByTestId("hours-unsaved")).toBeOnTheScreen();
  });

  it("lets staff edit their own calendar's hours, and only view others'", async () => {
    api();
    const { unmount } = renderResource(alex.id, "staff");
    expect(await screen.findByTestId("hours-save")).toBeOnTheScreen();
    expect(screen.queryByText(/View only/)).toBeNull();
    expect(screen.queryByTestId("resource-edit")).toBeNull();
    unmount();

    renderResource("r_room", "staff");
    expect(
      await screen.findByText("View only — you can edit hours for your own calendar."),
    ).toBeOnTheScreen();
    expect(await screen.findByTestId("hours-monday-open")).toHaveProp("disabled", true);
    expect(screen.queryByTestId("hours-save")).toBeNull();
    expect(screen.queryByTestId("hours-monday-add")).toBeNull();
    expect(screen.queryByTestId("hours-seasonal")).toBeNull();
  });

  it("shows an error when the hours can't load", async () => {
    api({
      handle: (method, path) =>
        path.endsWith("/availability")
          ? json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Boom", fields: {} } }, 500)
          : undefined,
    });
    renderResource(alex.id);
    expect(await screen.findByTestId("error-state")).toBeOnTheScreen();
  });

  it("says when the resource is gone", async () => {
    api();
    renderResource("r_gone");
    expect(await screen.findByTestId("resource-missing")).toBeOnTheScreen();
  });
});

describe("A resource's time off", () => {
  const openTimeOff = async () => {
    fireEvent.press(await screen.findByRole("tab", { name: "Time off" }));
    return screen.findByTestId("time-off");
  };

  it("lists upcoming time off and adds part of a day off", async () => {
    const { sent } = api({
      handle: (method, path, body) =>
        method === "POST" && path.endsWith("/overrides")
          ? { ...dayOff, ...(body as object), id: "ov2" }
          : undefined,
    });
    renderResource(alex.id);
    await openTimeOff();
    expect(await screen.findByTestId("override-ov1")).toHaveTextContent(/All day · Holiday/);
    fireEvent.press(screen.getByTestId("time-off-add"));
    const sheet = await screen.findByTestId("time-off-sheet");
    fireEvent.press(within(sheet).getByRole("radio", { name: "Part of the day" }));
    fireEvent(within(sheet).getByTestId("time-off-start-picker"), "change", at(14));
    fireEvent(within(sheet).getByTestId("time-off-end-picker"), "change", at(12));
    expect(within(sheet).getByTestId("time-off-time-error")).toBeOnTheScreen();
    expect(within(sheet).getByTestId("time-off-save")).toBeDisabled();
    fireEvent(within(sheet).getByTestId("time-off-end-picker"), "change", at(17));
    fireEvent.changeText(within(sheet).getByTestId("time-off-reason"), "Dentist");
    await act(async () => fireEvent.press(within(sheet).getByTestId("time-off-save")));
    expect(await screen.findByText("Added")).toBeOnTheScreen();
    expect(sent.at(-1)).toMatchObject({
      method: "POST",
      path: `${BASE}/resources/${alex.id}/overrides`,
      body: { isAvailable: false, startTime: "14:00", endTime: "17:00", reason: "Dentist" },
    });
  });

  it("removes time off after confirming", async () => {
    confirmAlerts();
    const { fetch } = api();
    renderResource(alex.id);
    await openTimeOff();
    await act(async () => fireEvent.press(await screen.findByTestId("override-remove-ov1")));
    expect(await screen.findByText("Removed")).toBeOnTheScreen();
    expect(calls(fetch)).toContain(`DELETE ${BASE}/overrides/ov1`);
  });

  it("keeps unsaved hours while looking at time off", async () => {
    api({ overrides: [] });
    renderResource(alex.id);
    fireEvent(await screen.findByTestId("hours-friday-open"), "valueChange", true);
    await openTimeOff();
    expect(await screen.findByText("Nothing planned")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("tab", { name: "Weekly hours" }));
    expect(screen.getByTestId("hours-friday-0")).toBeOnTheScreen();
  });

  it("shows the server's refusal on the time-off form, and asks before discarding it", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
    api({
      handle: (method, path) =>
        method === "POST" && path.endsWith("/overrides")
          ? json({ error: { code: "CONFLICT", message: "Already off that day", fields: {} } }, 409)
          : undefined,
    });
    renderResource(alex.id);
    await openTimeOff();
    fireEvent.press(await screen.findByTestId("time-off-add"));
    const sheet = await screen.findByTestId("time-off-sheet");
    fireEvent.changeText(within(sheet).getByTestId("time-off-reason"), "Holiday");
    await act(async () => fireEvent.press(within(sheet).getByTestId("time-off-save")));
    expect(await within(sheet).findByText("Already off that day")).toBeOnTheScreen();
    await act(async () => fireEvent.press(within(sheet).getByRole("button", { name: "Close" })));
    expect(alert).toHaveBeenCalledWith(
      "Discard changes?",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    await waitFor(() => expect(screen.queryByTestId("time-off-sheet")).toBeNull());
  });

  it("shows others' time off read-only to staff", async () => {
    api({ overrides: [{ ...dayOff, resourceId: "r_room" }] });
    renderResource("r_room", "staff");
    await openTimeOff();
    expect(await screen.findByTestId("override-ov1")).toBeOnTheScreen();
    expect(screen.queryByTestId("time-off-add")).toBeNull();
    expect(screen.queryByTestId("override-remove-ov1")).toBeNull();
  });
});

describe("A resource on a phone", () => {
  it("goes back to the list after deleting the resource", async () => {
    confirmAlerts();
    const { fetch } = api();
    renderList();
    fireEvent.press(await screen.findByTestId("resource-r_room"));
    fireEvent.press(await screen.findByTestId("resource-edit"));
    await act(async () => fireEvent.press(await screen.findByTestId("resource-delete")));
    expect(await screen.findByText("Room 1 removed")).toBeOnTheScreen();
    expect(calls(fetch)).toContain(`DELETE ${BASE}/resources/r_room`);
    await waitFor(() => expect(screen.queryByTestId("resource-screen")).toBeNull());
  });

  it("puts the server's field error on the resource form", async () => {
    api({
      handle: (method) =>
        method === "PATCH"
          ? json(
              {
                error: {
                  code: "VALIDATION_FAILED",
                  message: "Check the form",
                  fields: { name: "Name taken" },
                },
              },
              422,
            )
          : undefined,
    });
    renderResource("r_room");
    fireEvent.press(await screen.findByTestId("resource-edit"));
    const sheet = await screen.findByTestId("resource-sheet");
    // A room has a capacity, not a linked member.
    expect(within(sheet).queryByTestId("resource-member")).toBeNull();
    fireEvent.changeText(within(sheet).getByTestId("resource-name"), "Room 2");
    await act(async () => fireEvent.press(within(sheet).getByTestId("resource-save")));
    expect(await within(sheet).findByText("Name taken")).toBeOnTheScreen();
  });

  it("refreshes the resource and its hours on pull", async () => {
    const { fetch } = api();
    renderResource(alex.id);
    await screen.findByTestId("hours-total");
    const before = calls(fetch).filter((c) => c.endsWith("/availability")).length;
    const scroll = screen.getByTestId("resource-detail");
    await act(async () => {
      await (
        scroll.props as { refreshControl: { props: { onRefresh: () => Promise<void> } } }
      ).refreshControl.props.onRefresh();
    });
    await waitFor(() =>
      expect(calls(fetch).filter((c) => c.endsWith("/availability")).length).toBeGreaterThan(before),
    );
  });

  it("takes a restricted group off a range again", async () => {
    const vip = { ...customerGroup, id: "g_vip", name: "VIP", restricted: true };
    api({ groups: [vip], rules: [{ ...monday, audienceGroupIds: ["g_vip"] }] });
    renderResource(alex.id);
    fireEvent.press(await screen.findByTestId("hours-monday-0-audience"));
    const sheet = await screen.findByTestId("audience-sheet");
    const box = within(sheet).getByRole("checkbox", { name: "VIP" });
    expect(box).toBeChecked();
    expect(within(sheet).getByText("Restricted")).toBeOnTheScreen();
    fireEvent.press(box);
    fireEvent.press(within(sheet).getByTestId("audience-done"));
    expect(screen.getByTestId("hours-monday-0-audience")).toHaveProp(
      "accessibilityLabel",
      "Who can book Monday 09:00–17:00: Everyone",
    );
  });

  it("changes a seasonal period's dates and flags an end before the start", async () => {
    api({ rules: [monday, { ...monday, id: "rule2", validFrom: "2099-06-01", validUntil: "2099-08-31" }] });
    renderResource(alex.id);
    fireEvent.press(await screen.findByTestId("hours-which"));
    fireEvent.press((await screen.findAllByRole("button", { name: /1 Jun – 31 Aug 2099/ })).at(-1)!);
    fireEvent(await screen.findByTestId("hours-period-until-picker"), "change", {
      nativeEvent: { timestamp: new Date(2099, 4, 1, 12).getTime() },
    });
    expect(screen.getByText("The end date is before the start date")).toBeOnTheScreen();
    expect(screen.getByTestId("hours-save")).toBeDisabled();
    fireEvent(screen.getByTestId("hours-period-from-picker"), "change", {
      nativeEvent: { timestamp: new Date(2099, 3, 1, 12).getTime() },
    });
    expect(screen.queryByText("The end date is before the start date")).toBeNull();
    expect(screen.getByTestId("hours-save")).toBeEnabled();
  });
});
