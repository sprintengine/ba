import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReleaseDay, Releases, ReleaseSchedule, ReleaseScheduleInput } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { group, invalidRequest, service } from "../../settings/__tests__/settings-fixtures";
import { ReleaseSettings } from "../../settings/release-settings";
import { mockApi, renderDashboard } from "../../test/render";
import { CalendarReleaseRow } from "../calendar-release-row";
import { CalendarReleases, OverviewRelease } from "../lazy-releases";
import { NextReleaseCard, nextRelease } from "../next-release-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio/settings/release-schedules",
  useSearchParams: () => new URLSearchParams(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

// Tuesday 13 October 2026, 15:00 in Dublin.
const NOW = new Date("2026-10-13T14:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  toast.success.mockClear();
  toast.error.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const gp = service("s1", "GP consultation");
const nurse = service("s2", "Nurse appointment");
const bloods = service("s3", "Blood test");
const gms = group({ id: "g1", name: "GMS / medical card holder", restricted: true });

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

const releases = (days = releaseDays): Releases => ({
  timezone: "Europe/Dublin",
  from: days[0]?.date ?? "2026-10-13",
  to: days.at(-1)?.date ?? "2026-10-13",
  schedules: [{ scheduleId: "r1", name: "GMS next-day", days }],
});

/** A fake of the release endpoints (and the services and groups they need), recording what was sent. */
function fakeApi({
  schedules = [schedule()],
  create,
}: { schedules?: ReleaseSchedule[]; create?: (input: ReleaseScheduleInput) => unknown } = {}) {
  const sent: { method: string; path: string; body: unknown }[] = [];
  const fetchMock = mockApi((method, path, body) => {
    if (method !== "GET") sent.push({ method, path, body });
    if (path.endsWith("/services")) return [gp, nurse, bloods];
    if (path.endsWith("/customer-groups")) return [gms];
    if (path.endsWith("/release-schedules") && method === "GET") return schedules;
    if (path.endsWith("/release-schedules") && method === "POST") {
      const input = body as ReleaseScheduleInput;
      return create ? create(input) : schedule({ ...input, id: "r2", status: "active" });
    }
    if (path.endsWith("/releases")) return releases();
    if (path.includes("/changes/")) return releases();
    return {};
  });
  return { fetchMock, sent };
}

describe("ReleaseSettings", () => {
  it("lists schedules in plain words, the services no schedule covers and the upcoming releases", async () => {
    fakeApi();
    const { container } = renderDashboard(<ReleaseSettings />);
    expect(await screen.findByText("GMS next-day")).toBeInTheDocument();
    expect(
      screen.getByText("Each day opens the day before at 17:00. Monday opens on Friday."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("GP consultation, Nurse appointment · GMS / medical card holder"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Blood test isn't in an active schedule/)).toBeInTheDocument();
    const rows = within(await screen.findByRole("list", { name: "Upcoming releases" })).getAllByRole(
      "listitem",
    );
    // Today is open and unchanged, so it isn't listed.
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Opens today at 17:00"),
      expect.stringContaining("Opens tomorrow at 22:00"),
      expect.stringContaining("Opens when you open it"),
    ]);
    expect(rows[1]).toHaveTextContent("Moved from tomorrow at 17:00 by Avery Morgan");
    await expectNoAxeViolations(container);
  });

  it("opens, holds and resets one release", async () => {
    const { sent } = fakeApi();
    const user = userEvent.setup();
    renderDashboard(<ReleaseSettings />);
    const rows = within(await screen.findByRole("list", { name: "Upcoming releases" })).getAllByRole(
      "listitem",
    );
    await user.click(within(rows[0] as HTMLElement).getByRole("button", { name: "Open now" }));
    await waitFor(() =>
      expect(sent).toContainEqual({
        method: "PUT",
        path: "/v1/businesses/b1/release-schedules/r1/changes/2026-10-14",
        body: { action: "open_now", scope: "release" },
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Opened for booking");
    await user.click(within(rows[0] as HTMLElement).getByRole("button", { name: "Hold" }));
    await waitFor(() =>
      expect(sent.at(-1)).toMatchObject({ method: "PUT", body: { action: "hold", scope: "release" } }),
    );
    await user.click(within(rows[1] as HTMLElement).getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        method: "DELETE",
        path: "/v1/businesses/b1/release-schedules/r1/changes/2026-10-15",
        body: undefined,
      }),
    );
  });

  it("moves a release to another time, refusing one after the day ends", async () => {
    const { sent } = fakeApi();
    const user = userEvent.setup();
    renderDashboard(<ReleaseSettings />);
    const rows = within(await screen.findByRole("list", { name: "Upcoming releases" })).getAllByRole(
      "listitem",
    );
    await user.click(within(rows[0] as HTMLElement).getByRole("button", { name: "Change" }));
    const time = await screen.findByRole("textbox", { name: "Time" });
    await user.clear(time);
    await user.type(time, "22:00");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Save time" }));
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        method: "PUT",
        path: "/v1/businesses/b1/release-schedules/r1/changes/2026-10-14",
        body: { action: "move", opensAt: "2026-10-13T22:00:00+01:00", scope: "release" },
      }),
    );
  });

  it("has an empty state that starts a schedule", async () => {
    fakeApi({ schedules: [] });
    renderDashboard(<ReleaseSettings />);
    expect(await screen.findByText("No release schedules")).toBeInTheDocument();
  });

  it("creates a schedule from the editor, previewing when days open", async () => {
    const { sent } = fakeApi({ schedules: [] });
    const user = userEvent.setup();
    renderDashboard(<ReleaseSettings />);
    await user.click((await screen.findAllByRole("button", { name: "New schedule" }))[0] as HTMLElement);
    const sheet = await screen.findByRole("dialog");
    await user.type(within(sheet).getByRole("textbox", { name: /Name/ }), "GMS next-day");
    await user.click(within(sheet).getByRole("checkbox", { name: "GP consultation" }));
    await user.click(within(sheet).getByRole("radio", { name: "Some groups" }));
    await user.click(within(sheet).getByRole("checkbox", { name: /GMS/ }));
    await user.click(within(sheet).getByRole("switch", { name: "Skip weekends" }));
    // The preview: Wednesday opens today at 17:00; Monday opens on Friday.
    expect(
      within(sheet).getByText("Each day opens the day before at 17:00. Monday opens on Friday."),
    ).toBeInTheDocument();
    expect(within(sheet).getAllByText("Opens today at 17:00")).toHaveLength(1);
    expect(within(sheet).getAllByText("Opens Fri, 16 Oct at 17:00")).toHaveLength(3);
    await user.click(within(sheet).getByRole("button", { name: "Create schedule" }));
    await waitFor(() =>
      expect(sent).toContainEqual({
        method: "POST",
        path: "/v1/businesses/b1/release-schedules",
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
    expect(toast.success).toHaveBeenCalledWith("GMS next-day created");
  });

  it("shows the server's overlap error on the services and keeps the sheet open", async () => {
    fakeApi({
      schedules: [],
      create: () =>
        invalidRequest({ serviceIds: "GP consultation is already in “Old”, which covers everyone" }),
    });
    const user = userEvent.setup();
    renderDashboard(<ReleaseSettings />);
    await user.click((await screen.findAllByRole("button", { name: "New schedule" }))[0] as HTMLElement);
    const sheet = await screen.findByRole("dialog");
    await user.type(within(sheet).getByRole("textbox", { name: /Name/ }), "Clash");
    await user.click(within(sheet).getByRole("checkbox", { name: "GP consultation" }));
    await user.click(within(sheet).getByRole("button", { name: "Create schedule" }));
    expect(
      await within(sheet).findByText("GP consultation is already in “Old”, which covers everyone"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("asks for services and a time before saving, and switches to week by week", async () => {
    const { sent } = fakeApi({ schedules: [] });
    const user = userEvent.setup();
    renderDashboard(<ReleaseSettings />);
    await user.click((await screen.findAllByRole("button", { name: "New schedule" }))[0] as HTMLElement);
    const sheet = await screen.findByRole("dialog");
    await user.type(within(sheet).getByRole("textbox", { name: /Name/ }), "Week ahead");
    await user.click(within(sheet).getByRole("button", { name: "Create schedule" }));
    expect(await within(sheet).findByText("Choose at least one service")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("radio", { name: "Week by week" }));
    expect(within(sheet).getByText("Every Friday at 17:00, next week (Mon–Sun) opens.")).toBeInTheDocument();
    expect(sent).toEqual([]);
  });
});

describe("CalendarReleaseRow", () => {
  const days = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];

  it("shows each day's release and changes one from its chip", async () => {
    const { sent } = fakeApi();
    const user = userEvent.setup();
    renderDashboard(<CalendarReleaseRow days={days} view="week" today="2026-10-13" columnClass="" />);
    const row = await screen.findByRole("group", { name: "Online booking releases" });
    const chips = within(row).getAllByRole("button");
    // Past days have no chip.
    expect(chips.map((c) => c.textContent)).toEqual(["Open", "Opens 17:00", "Wed 22:00", "On hold"]);
    await user.click(chips[1] as HTMLElement);
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Opens today at 17:00")).toBeInTheDocument();
    // What's still free the day before, to fill before this one opens.
    expect(within(panel).getByText("Still free today")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Open now" }));
    await waitFor(() =>
      expect(sent).toContainEqual({
        method: "PUT",
        path: "/v1/businesses/b1/release-schedules/r1/changes/2026-10-14",
        body: { action: "open_now", scope: "release" },
      }),
    );
  });

  it("offers just this day when the release opens several days at once", async () => {
    // Week by week: one release opens the whole week.
    const { sent } = fakeApi({
      schedules: [
        schedule({ cadence: "weekly", daysBefore: null, weekdaysOnly: false, weekday: 5, weeksAhead: 1 }),
      ],
    });
    const user = userEvent.setup();
    renderDashboard(<CalendarReleaseRow days={days} view="week" today="2026-10-13" columnClass="" />);
    const row = await screen.findByRole("group", { name: "Online booking releases" });
    await user.click(within(row).getAllByRole("button")[1] as HTMLElement);
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("checkbox", { name: /Just this day/ }));
    await user.click(within(panel).getByRole("button", { name: "Open now" }));
    await waitFor(() => expect(sent.at(-1)).toMatchObject({ body: { action: "open_now", scope: "day" } }));
  });

  it("is hidden from staff and when there are no schedules", async () => {
    fakeApi();
    const { container } = renderDashboard(
      <CalendarReleaseRow days={days} view="week" today="2026-10-13" columnClass="" />,
      "staff",
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("NextReleaseCard", () => {
  it("picks the release due soonest within a day, grouping the days it opens together", () => {
    const next = nextRelease(releases(), [schedule()], "2026-10-13", NOW);
    expect(next).toMatchObject({ day: { date: "2026-10-14" }, dates: ["2026-10-14"], times: 12 });
    expect(next?.before).toEqual({ date: "2026-10-13", times: 3 });
    // Early on Wednesday, Thursday's moved release (Wednesday 22:00) is the next one; nothing is due once everything
    // is open or far off.
    expect(
      nextRelease(releases(), [schedule()], "2026-10-14", new Date("2026-10-14T01:00:00Z")),
    ).toMatchObject({
      day: { date: "2026-10-15" },
    });
    expect(nextRelease(releases([releaseDays[0] as ReleaseDay]), [schedule()], "2026-10-13", NOW)).toBeNull();
    // Two held days are two releases (a daily schedule opens them separately).
    const held = releases([
      day("2026-10-13", { opensAt: null, state: "held", changed: true }),
      day("2026-10-14", { opensAt: null, state: "held", changed: true }),
    ]);
    expect(nextRelease(held, [schedule()], "2026-10-13", NOW)?.dates).toEqual(["2026-10-13"]);
    // Paused schedules are ignored.
    expect(nextRelease(releases(), [schedule({ status: "paused" })], "2026-10-13", NOW)).toBeNull();
  });

  it("names the release with what's still free before it, and opens it now", async () => {
    const { sent } = fakeApi();
    const user = userEvent.setup();
    renderDashboard(<NextReleaseCard />);
    expect(await screen.findByText("Tomorrow opens for booking today at 17:00")).toBeInTheDocument();
    expect(screen.getByText("GMS next-day · 3 still free today · 12 will open")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open now" }));
    await waitFor(() =>
      expect(sent).toContainEqual(
        expect.objectContaining({ method: "PUT", body: { action: "open_now", scope: "release" } }),
      ),
    );
  });
});

describe("lazy release UI", () => {
  it("loads the overview card and the calendar row only when there's an active schedule", async () => {
    fakeApi();
    renderDashboard(
      <>
        <OverviewRelease />
        <CalendarReleases days={["2026-10-13", "2026-10-14"]} view="week" today="2026-10-13" columnClass="" />
      </>,
    );
    expect(await screen.findByText("Tomorrow opens for booking today at 17:00")).toBeInTheDocument();
    expect(await screen.findByRole("group", { name: "Online booking releases" })).toBeInTheDocument();
  });

  it("loads nothing without one", async () => {
    fakeApi({ schedules: [schedule({ status: "paused" })] });
    const { container } = renderDashboard(<OverviewRelease />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });
});
