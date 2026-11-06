import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailabilityRule } from "@/lib/api/types";
import { MAX_RULES_PER_RESOURCE } from "@/lib/availability/weekly-hours";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { renderDashboard } from "@/components/dashboard/test/render";
import { WeeklyHours } from "../weekly-hours/weekly-hours";
import { apiError, fakeResourcesApi, group, resource, rule } from "./fake-resources-api";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  toast.success.mockReset();
  toast.error.mockReset();
});

const sam = resource();
const monday = rule({ id: "mon", dayOfWeek: 1, startTime: "09:00", endTime: "17:00" });

function setup(rules: AvailabilityRule[] = [monday], extra: Parameters<typeof fakeResourcesApi>[0] = {}) {
  const api = fakeResourcesApi({ resources: [sam], rules: { r1: rules }, ...extra });
  return api;
}

function render(editable = true) {
  const view = renderDashboard(<WeeklyHours resource={sam} editable={editable} />);
  return { ...view, user: userEvent.setup() };
}

const time = (name: string) => screen.getByRole("textbox", { name });
const saveButton = () => screen.getByRole("button", { name: "Save hours" });
const savedRules = (api: ReturnType<typeof fakeResourcesApi>) =>
  api.bodies("PUT", "/resources/r1/rules").map((b) => (b as { rules: unknown[] }).rules);

/** The times beside a day's timeline, which open its editor. */
const dayButton = (day: string) => screen.findByRole("button", { name: new RegExp(`^Edit ${day}: `) });

async function openDay(user: ReturnType<typeof userEvent.setup>, day: string) {
  await user.click(await dayButton(day));
  return screen.findByRole("switch", { name: `${day} open` });
}

describe("WeeklyHours", () => {
  it("shows a loading state, then the week", async () => {
    setup();
    render();
    expect(screen.getByRole("status", { name: "Loading hours" })).toBeInTheDocument();
    expect(await dayButton("Monday")).toHaveTextContent("09:00–17:00");
    expect(screen.queryByRole("status", { name: "Loading hours" })).not.toBeInTheDocument();
  });

  it("shows the API's error with a retry", async () => {
    const api = setup();
    api.fail("GET", /\/availability$/, () => apiError(500, "INTERNAL", "Hours are unavailable."));
    const { user } = render();
    expect(await screen.findByText("Hours are unavailable.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await dayButton("Monday")).toBeInTheDocument();
  });

  it("shows every day on one timeline, with its times in words and the weekly total, axe-clean", async () => {
    setup([monday, rule({ id: "wed", dayOfWeek: 3, startTime: "10:00", endTime: "12:30" })]);
    const { container } = render();
    expect(await dayButton("Monday")).toHaveTextContent("09:00–17:00");
    expect(await dayButton("Wednesday")).toHaveTextContent("10:00–12:30");
    expect(await dayButton("Tuesday")).toHaveTextContent("Closed");
    expect(screen.getAllByRole("group")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Edit Monday 09:00–17:00" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Monday 09:00–17:00 start" })).toHaveAttribute(
      "aria-valuetext",
      "09:00",
    );
    expect(screen.getByText("Regular hours")).toBeInTheDocument();
    expect(screen.getByText("10 h 30 min a week")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save hours" })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("opens a day from the keyboard and saves the whole week", async () => {
    const api = setup();
    const { user } = render();
    (await dayButton("Tuesday")).focus();
    await user.keyboard("{Enter}");
    const tuesday = await screen.findByRole("switch", { name: "Tuesday open" });
    tuesday.focus();
    await user.keyboard(" ");
    expect(tuesday).toBeChecked();
    expect(time("Tuesday start")).toHaveValue("09:00");
    expect(time("Tuesday end")).toHaveValue("17:00");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await user.click(saveButton());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Hours saved"));
    expect(savedRules(api)).toEqual([
      [
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "17:00",
          validFrom: null,
          validUntil: null,
          audienceGroupIds: [],
        },
        {
          dayOfWeek: 2,
          startTime: "09:00",
          endTime: "17:00",
          validFrom: null,
          validUntil: null,
          audienceGroupIds: [],
        },
      ],
    ]);
    await waitFor(() => expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument());
    expect(await dayButton("Tuesday")).toHaveTextContent("09:00–17:00");
  });

  it("draws a date's time off on the week it falls in, and only that week", async () => {
    const off = { id: "o", resourceId: "r1", date: "2026-10-12", isAvailable: false };
    setup([monday], { overrides: [{ ...off, startTime: null, endTime: null, reason: null }] });
    const { user } = render();
    await dayButton("Monday");
    expect(document.querySelector("[data-exception]")).toBeNull();
    await user.click(screen.getByRole("radio", { name: /12–18 Oct/ }));
    expect(document.querySelector('[data-exception="off"]')).not.toBeNull();
  });

  it("opens the day's editor from a bar on the timeline", async () => {
    setup();
    const { user } = render();
    await user.click(await screen.findByRole("button", { name: "Edit Monday 09:00–17:00" }));
    expect(await screen.findByRole("textbox", { name: "Monday start" })).toHaveValue("09:00");
  });

  it("moves a bar's edge with the arrow keys and saves the new time", async () => {
    const api = setup();
    const { user } = render();
    const end = await screen.findByRole("slider", { name: "Monday 09:00–17:00 end" });
    end.focus();
    await user.keyboard("{ArrowDown}");
    expect(await dayButton("Monday")).toHaveTextContent("09:00–17:15");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await user.click(saveButton());
    await waitFor(() => expect(savedRules(api)).toHaveLength(1));
    expect(must(savedRules(api)[0], "saved rules")[0]).toMatchObject({
      startTime: "09:00",
      endTime: "17:15",
    });
  });

  it("drags a bar's edge along the day, staying on the axis", async () => {
    setup();
    render();
    const end = await screen.findByRole("slider", { name: "Monday 09:00–17:00 end" });
    end.setPointerCapture = vi.fn();
    const track = must(must(end.parentElement, "bar").parentElement, "track");
    // The axis is 08:00–18:00: 100px is an hour.
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({ top: 0, height: 1000 } as DOMRect);
    fireEvent.pointerDown(end, { pointerId: 1, clientY: 900 });
    fireEvent.pointerMove(end, { pointerId: 1, clientY: 655 });
    expect(await dayButton("Monday")).toHaveTextContent("09:00–14:30");
    fireEvent.pointerUp(end, { pointerId: 1, clientY: 655 });
    fireEvent.pointerMove(end, { pointerId: 1, clientY: 300 });
    expect(await dayButton("Monday")).toHaveTextContent("09:00–14:30");
  });

  it("adds a stretch by clicking a free part of the day, and not on a taken one", async () => {
    setup();
    render();
    const bar = await screen.findByRole("button", { name: "Edit Monday 09:00–17:00" });
    const track = must(must(bar.parentElement, "bar").parentElement, "track");
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({ top: 0, height: 1000 } as DOMRect);
    fireEvent.click(track, { clientY: 950 });
    expect(await dayButton("Monday")).toHaveTextContent("09:00–17:00, 17:30–21:30");

    const tuesday = must((await dayButton("Tuesday")).closest("[role=group]"), "column");
    const free = must(tuesday.querySelector("[data-touch-exempt]"), "Tuesday's track");
    vi.spyOn(free, "getBoundingClientRect").mockReturnValue({ top: 0, height: 1000 } as DOMRect);
    fireEvent.click(free, { clientY: 100 });
    expect(await dayButton("Tuesday")).toHaveTextContent("09:00–13:00");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("keeps unsaved edits when the hours are fetched again unchanged (back to the tab)", async () => {
    const api = setup();
    const { user } = render();
    await user.click(await openDay(user, "Tuesday"));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    const fetches = () => api.requests.filter((c) => c.method === "GET" && c.path.endsWith("/availability"));
    const before = fetches().length;

    // Some minutes later (the clock is pinned), the member comes back to the tab.
    vi.setSystemTime(new Date("2026-10-01T09:05:00Z"));
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(fetches().length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Tuesday open" })).toBeChecked());
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    act(() => focusManager.setFocused(undefined));
  });

  it("types and steps times, and flags ranges that end before they start", async () => {
    setup();
    const { user } = render();
    await openDay(user, "Monday");
    const end = time("Monday end");
    await user.clear(end);
    await user.type(end, "8am{Enter}");
    expect(end).toHaveValue("08:00");

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Ends before it starts");
    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAccessibleDescription("Ends before it starts");
    expect(time("Monday start")).toHaveAccessibleDescription("Ends before it starts");
    expect(saveButton()).toBeDisabled();

    const start = time("Monday start");
    start.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(start).toHaveValue("08:30");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(start).toHaveValue("07:45");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("adds a second range after the first, names each, and flags an overlap", async () => {
    setup();
    const { user } = render();
    await openDay(user, "Monday");
    await user.click(await screen.findByRole("button", { name: "Add hours to Monday" }));
    expect(time("Monday start (1)")).toHaveValue("09:00");
    expect(time("Monday start (2)")).toHaveValue("18:00");
    expect(time("Monday end (2)")).toHaveValue("20:00");

    const start = time("Monday start (2)");
    await user.clear(start);
    await user.type(start, "16:00");
    await user.tab();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Overlaps 09:00–17:00");
    expect(start).toHaveAccessibleDescription("Overlaps 09:00–17:00");
    expect(saveButton()).toBeDisabled();
    await expectNoAxeViolations(document.body);

    await user.click(screen.getByRole("button", { name: "Remove Monday 16:00–20:00" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(time("Monday start")).toHaveValue("09:00");
  });

  it("closes a day by removing its last range, and discards back to the saved hours", async () => {
    setup();
    const { user } = render();
    await openDay(user, "Monday");
    await user.click(await screen.findByRole("button", { name: "Remove Monday 09:00–17:00" }));
    expect(screen.getByRole("switch", { name: "Monday open" })).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: "Monday start" })).not.toBeInTheDocument();
    expect(screen.getByText("0 min a week")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(await dayButton("Monday")).toHaveTextContent("09:00–17:00");
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
  });

  it("copies a day to the weekdays with the keyboard", async () => {
    setup();
    const { user } = render();
    await openDay(user, "Monday");
    screen.getByRole("button", { name: "Copy Monday to weekdays" }).focus();
    await user.keyboard("{Enter}");
    for (const day of ["Tuesday", "Wednesday", "Thursday", "Friday"]) {
      expect(await dayButton(day)).toHaveTextContent("09:00–17:00");
    }
    expect(await dayButton("Saturday")).toHaveTextContent("Closed");
    expect(screen.getByText("40 h a week")).toBeInTheDocument();
  });

  it("copies to the weekend and to all days", async () => {
    setup();
    const { user } = render();
    await openDay(user, "Monday");
    await user.click(screen.getByRole("button", { name: "Copy Monday to the weekend" }));
    expect(await dayButton("Sunday")).toHaveTextContent("09:00–17:00");
    expect(await dayButton("Tuesday")).toHaveTextContent("Closed");

    await user.click(screen.getByRole("button", { name: "Copy Monday to all days" }));
    expect(await dayButton("Tuesday")).toHaveTextContent("09:00–17:00");
  });

  it("limits a range to chosen customer groups", async () => {
    const api = setup([monday], {
      groups: [
        group({ id: "g1", name: "Members" }),
        group({ id: "g2", name: "VIP", restricted: true }),
        group({ id: "g3", name: "Old", isActive: false }),
      ],
    });
    const { user } = render();
    await openDay(user, "Monday");
    const who = await screen.findByRole("button", { name: "Who can book Monday 09:00–17:00: Everyone" });
    await user.click(who);
    const dialog = await screen.findByRole("dialog", { name: "Who can book these hours" });
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(dialog).getByText("Restricted")).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
    await user.click(within(dialog).getByRole("checkbox", { name: /Members/ }));
    await user.click(within(dialog).getByRole("checkbox", { name: /VIP/ }));
    expect(who).toHaveAccessibleName("Who can book Monday 09:00–17:00: Members, VIP");
    await user.click(within(dialog).getByRole("checkbox", { name: /Members/ }));
    expect(who).toHaveAccessibleName("Who can book Monday 09:00–17:00: VIP");
    await user.keyboard("{Escape}");

    await user.click(saveButton());
    await waitFor(() => expect(savedRules(api)).toHaveLength(1));
    expect(must(savedRules(api)[0], "saved rules")[0]).toMatchObject({ audienceGroupIds: ["g2"] });
  });

  it("says why saving failed", async () => {
    const api = setup();
    api.fail("PUT", /\/rules$/, () => apiError(400, "INVALID_REQUEST", "Rules overlap."));
    const { user } = render();
    await user.click(await openDay(user, "Tuesday"));
    await user.click(saveButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Rules overlap."));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("is read-only when not editable", async () => {
    setup();
    render(false);
    expect(await screen.findByText("09:00–17:00", { selector: "span.sr-only" })).toBeInTheDocument();
    expect(screen.getAllByText("Closed", { selector: "[aria-hidden]" })).toHaveLength(6);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit Monday/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save hours" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /seasonal hours/i })).not.toBeInTheDocument();
  });

  it("refuses to save more time ranges than the backend keeps", async () => {
    const many = Array.from({ length: MAX_RULES_PER_RESOURCE + 1 }, (_, i) =>
      rule({
        id: `r${i}`,
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "09:30",
        validFrom: `2027-01-${String((i % 28) + 1).padStart(2, "0")}`,
      }),
    );
    setup(many);
    const { user } = render();
    await user.click(await openDay(user, "Tuesday"));
    expect(
      screen.getByText(`At most ${MAX_RULES_PER_RESOURCE} time ranges in all (there are 102)`),
    ).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });
});

describe("seasonal hours", () => {
  const pickDate = async (user: ReturnType<typeof userEvent.setup>, field: string | RegExp, day: RegExp) => {
    await user.click(screen.getByRole("button", { name: field }));
    await user.click(await screen.findByRole("button", { name: day }));
  };

  it("adds a dated period from the dialog and saves its hours with the dates", async () => {
    const api = setup();
    const { user } = render();
    await user.click(await screen.findByRole("button", { name: /seasonal hours/i }));
    const dialog = await screen.findByRole("dialog", { name: "Seasonal hours" });
    expect(dialog).toHaveAccessibleDescription(/Extra hours for a date range/);
    const add = within(dialog).getByRole("button", { name: "Add period" });
    expect(add).toBeDisabled();
    await expectNoAxeViolations(document.body);

    await pickDate(user, /^Until ?\(optional\)$/, /10 October 2026/);
    await pickDate(user, "From", /20 October 2026/);
    const until = within(dialog).getByRole("button", { name: /^Until ?\(optional\)$/ });
    expect(until).toHaveAccessibleDescription("The end is before the start");
    expect(until).toHaveAttribute("aria-invalid", "true");
    expect(add).toBeDisabled();

    await pickDate(user, /^Until ?\(optional\)$/, /31 October 2026/);
    expect(add).toBeEnabled();
    await user.click(add);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(screen.getByRole("combobox", { name: "Which hours" })).toHaveTextContent("20 Oct – 31 Oct 2026");
    expect(screen.getByText(/in addition to your regular hours/)).toBeInTheDocument();
    expect(await dayButton("Monday")).toHaveTextContent("Closed");
    await user.click(await openDay(user, "Saturday"));
    await user.click(saveButton());

    await waitFor(() => expect(savedRules(api)).toHaveLength(1));
    expect(savedRules(api)[0]).toEqual([
      expect.objectContaining({ dayOfWeek: 1, validFrom: null, validUntil: null }),
      expect.objectContaining({ dayOfWeek: 6, validFrom: "2026-10-20", validUntil: "2026-10-31" }),
    ]);
  });

  it("switches between regular and dated hours, and removes a period", async () => {
    setup([monday, rule({ id: "sum", dayOfWeek: 5, validFrom: "2027-06-01", validUntil: null })]);
    const { user } = render();
    const which = await screen.findByRole("combobox", { name: "Which hours" });
    expect(which).toHaveTextContent("Regular hours");
    expect(await dayButton("Friday")).toHaveTextContent("Closed");

    which.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "1 Jun onwards" }));
    expect(await dayButton("Friday")).not.toHaveTextContent("Closed");
    expect(await dayButton("Monday")).toHaveTextContent("Closed");

    await user.click(screen.getByRole("button", { name: "Remove these hours" }));
    expect(screen.queryByRole("combobox", { name: "Which hours" })).not.toBeInTheDocument();
    expect(await dayButton("Monday")).toHaveTextContent("09:00–17:00");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("flags a period whose end comes before its start", async () => {
    setup([monday, rule({ id: "p", dayOfWeek: 2, validFrom: "2027-06-10", validUntil: "2027-06-20" })]);
    const { user } = render();
    const which = await screen.findByRole("combobox", { name: "Which hours" });
    await user.click(which);
    await user.click(await screen.findByRole("option", { name: "10 Jun – 20 Jun 2027" }));

    await user.click(screen.getByRole("button", { name: "From" }));
    await user.click(await screen.findByRole("button", { name: /next month/i }));
    await user.click(await screen.findByRole("button", { name: /\b1 July 2027/ }));
    const until = screen.getByRole("button", { name: "Until" });
    expect(until).toHaveAccessibleDescription("The end date is before the start date");
    expect(saveButton()).toBeDisabled();
  });

  it("cancels adding a period", async () => {
    setup();
    const { user } = render();
    await user.click(await screen.findByRole("button", { name: /seasonal hours/i }));
    const dialog = await screen.findByRole("dialog", { name: "Seasonal hours" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("combobox", { name: "Which hours" })).not.toBeInTheDocument();
  });
});
