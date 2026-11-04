import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { AvailabilityWindows } from "@/lib/api/hooks";
import { ApiError } from "@/lib/api/client";
import type { Slot } from "@/lib/api/types";
import type { PlainDate } from "@/lib/format";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { SlotPicker, type SlotPickerProps } from "../slot-picker";
import { pinNow, slotAt, TZ } from "./booking-test-utils";

// "Today" is Thursday 1 October 2026; the picker allows booking until 30 November.
const MIN = "2026-10-01";
const MAX = "2026-11-30";

/** Availability with `days` loaded for every date in `loadedRange` (inclusive). */
function windows(
  days: Record<PlainDate, Slot[]>,
  {
    loadedRange = ["2026-10-01", "2026-11-30"],
    ...patch
  }: Partial<AvailabilityWindows> & { loadedRange?: [PlainDate, PlainDate] | null } = {},
): AvailabilityWindows {
  return {
    days: new Map(Object.entries(days)),
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    loaded: (d) => !!loadedRange && d >= loadedRange[0] && d <= loadedRange[1],
    nextAvailableOnly: false,
    refetch: vi.fn(),
    ...patch,
    locks: patch.locks ?? new Map(),
  };
}

type Callbacks = {
  onDateChange: Mock<SlotPickerProps["onDateChange"]>;
  onMonthChange: Mock<SlotPickerProps["onMonthChange"]>;
  onSelectSlot: Mock<SlotPickerProps["onSelectSlot"]>;
};

/** The picker with its month, date and time kept in state, like the booking flow keeps them. */
function Harness({
  availability,
  initialDate = null,
  initialMonth = "2026-10",
  max = MAX,
  spies,
}: {
  availability: AvailabilityWindows;
  initialDate?: PlainDate | null;
  initialMonth?: string;
  max?: PlainDate;
  spies: Callbacks;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [date, setDate] = useState<PlainDate | null>(initialDate);
  const [time, setTime] = useState<string | null>(null);
  return (
    <SlotPicker
      timeZone={TZ}
      locale="en-IE"
      currency="EUR"
      min={MIN}
      max={max}
      month={month}
      onMonthChange={(m) => {
        spies.onMonthChange(m);
        setMonth(m);
      }}
      date={date}
      onDateChange={(d, reason) => {
        spies.onDateChange(d, reason);
        setDate(d);
      }}
      selectedTime={time}
      onSelectSlot={(slot, d, t) => {
        spies.onSelectSlot(slot, d, t);
        setTime(t);
      }}
      availability={availability}
    />
  );
}

function renderPicker(props: Omit<Parameters<typeof Harness>[0], "spies">) {
  const spies: Callbacks = { onDateChange: vi.fn(), onMonthChange: vi.fn(), onSelectSlot: vi.fn() };
  const view = render(<Harness {...props} spies={spies} />);
  return { ...spies, ...view };
}

const times = () => screen.getByRole("group", { name: "Available times" });
/** The mobile week strip (the desktop calendar is a grid with the same name). */
const week = () => screen.getByRole("group", { name: "Choose a date" });

beforeEach(() => pinNow());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SlotPicker states", () => {
  it("shows a loading skeleton until the chosen day's times have loaded", async () => {
    const { container } = renderPicker({
      availability: windows({}, { loadedRange: null, isPending: true }),
      initialDate: "2026-10-05",
    });
    expect(screen.getByRole("status", { name: "Loading available times" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Available times" })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("shows the error with a retry when availability fails to load", async () => {
    const availability = windows(
      {},
      {
        loadedRange: null,
        isError: true,
        error: new ApiError(500, "INTERNAL", "The booking system had a problem."),
      },
    );
    const user = userEvent.setup();
    renderPicker({ availability, initialDate: "2026-10-05" });
    expect(screen.getByText("We couldn't load available times")).toBeInTheDocument();
    expect(screen.getByText("The booking system had a problem.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(availability.refetch).toHaveBeenCalled();
  });

  it("says when nothing is bookable at all", () => {
    // The whole bookable range is in October and loaded, with no times.
    renderPicker({
      availability: windows({}, { loadedRange: ["2026-10-01", "2026-10-31"] }),
      max: "2026-10-31",
    });
    expect(screen.getByText("No times available right now")).toBeInTheDocument();
  });

  it("picks the month's first day with times once it has loaded", () => {
    const { onDateChange } = renderPicker({
      availability: windows({ "2026-10-06": [slotAt("2026-10-06", "09:00")] }),
    });
    expect(onDateChange).toHaveBeenCalledWith("2026-10-06", "auto");
    expect(screen.getByRole("heading", { name: /^Tuesday,? 6 October$/ })).toBeInTheDocument();
  });

  it("looks ahead to the next month when this one has no times", () => {
    const { onMonthChange, onDateChange } = renderPicker({
      availability: windows({ "2026-11-03": [slotAt("2026-11-03", "09:00")] }),
    });
    expect(onMonthChange).toHaveBeenCalledWith("2026-11");
    expect(onDateChange).toHaveBeenCalledWith("2026-11-03", "auto");
  });

  it("offers the next day with times when the chosen day has none", async () => {
    const user = userEvent.setup();
    const { onDateChange } = renderPicker({
      availability: windows({ "2026-10-09": [slotAt("2026-10-09", "09:00")] }),
      initialDate: "2026-10-05",
    });
    expect(screen.getByRole("heading", { name: /^Monday,? 5 October$/ })).toBeInTheDocument();
    expect(screen.getByText("No free times on this day")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Next available/ }));
    expect(onDateChange).toHaveBeenLastCalledWith("2026-10-09", "user");
    expect(within(times()).getByRole("button", { name: "09:00" })).toBeInTheDocument();
  });

  it("offers the next month when nothing later this month is loaded", async () => {
    const user = userEvent.setup();
    const { onMonthChange } = renderPicker({
      availability: windows({}, { loadedRange: ["2026-10-01", "2026-10-31"] }),
      initialDate: "2026-10-30",
    });
    expect(screen.getByText("Try another date.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Check November 2026/ }));
    expect(onMonthChange).toHaveBeenCalledWith("2026-11");
  });

  it("says it is updating while times refresh", () => {
    renderPicker({
      availability: windows({ "2026-10-05": [slotAt("2026-10-05", "09:00")] }, { isFetching: true }),
      initialDate: "2026-10-05",
    });
    expect(screen.getByText("Updating…")).toBeInTheDocument();
  });
});

describe("SlotPicker times", () => {
  const day = "2026-10-05";

  it("selects a time with the keyboard (Tab, Enter and Space) and marks it pressed", async () => {
    const user = userEvent.setup();
    const { onSelectSlot } = renderPicker({
      availability: windows({ [day]: [slotAt(day, "09:00"), slotAt(day, "11:30")] }),
      initialDate: day,
    });
    const nine = within(times()).getByRole("button", { name: "09:00" });
    const half11 = within(times()).getByRole("button", { name: "11:30" });

    nine.focus();
    await user.keyboard("{Enter}");
    expect(onSelectSlot).toHaveBeenLastCalledWith(
      expect.objectContaining({ start: slotAt(day, "09:00").start }),
      day,
      "09:00",
    );
    expect(nine).toHaveAttribute("aria-pressed", "true");

    await user.tab();
    expect(half11).toHaveFocus();
    await user.keyboard(" ");
    expect(onSelectSlot).toHaveBeenLastCalledWith(expect.anything(), day, "11:30");
    expect(half11).toHaveAttribute("aria-pressed", "true");
    expect(nine).toHaveAttribute("aria-pressed", "false");
  });

  it("groups a long day into morning, afternoon and evening", () => {
    const hours = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "17:00", "18:00"];
    renderPicker({ availability: windows({ [day]: hours.map((h) => slotAt(day, h)) }), initialDate: day });
    for (const period of ["Morning", "Afternoon", "Evening"]) {
      expect(within(times()).getByText(period)).toBeInTheDocument();
    }
    expect(within(times()).getAllByRole("button")).toHaveLength(9);
  });

  it("keeps a short day as one list", () => {
    renderPicker({
      availability: windows({ [day]: [slotAt(day, "08:00"), slotAt(day, "18:00")] }),
      initialDate: day,
    });
    expect(within(times()).queryByText("Morning")).not.toBeInTheDocument();
  });

  it("shows how few places are left in a group slot", () => {
    renderPicker({
      availability: windows({
        [day]: [
          slotAt(day, "09:00", { seatsLeft: 1 }),
          slotAt(day, "10:00", { seatsLeft: 3 }),
          slotAt(day, "11:00", { seatsLeft: 12 }),
        ],
      }),
      initialDate: day,
    });
    expect(within(times()).getByRole("button", { name: /09:00/ })).toHaveTextContent("1 place left");
    expect(within(times()).getByRole("button", { name: /10:00/ })).toHaveTextContent("3 places left");
    expect(within(times()).getByRole("button", { name: "11:00" })).not.toHaveTextContent("left");
  });

  it("notes the business timezone, and when it differs from the device's", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...new Intl.DateTimeFormat().resolvedOptions(),
      timeZone: "America/New_York",
    });
    renderPicker({ availability: windows({ [day]: [slotAt(day, "09:00")] }), initialDate: day });
    expect(screen.getAllByText(/Times in Dublin time/)[0]).toHaveTextContent("different from your device");
  });

  it("has no accessibility violations with times and deals shown", async () => {
    const offer = {
      id: "of1",
      name: "Quiet mornings",
      label: "20% off",
      originalPriceCents: 5000,
      priceCents: 4000,
    };
    const { container } = renderPicker({
      availability: windows({ [day]: [slotAt(day, "09:00", { offer }), slotAt(day, "10:00")] }),
      initialDate: day,
    });
    await expectNoAxeViolations(container);
  });
});

describe("SlotPicker dates", () => {
  it("moves between weeks, following the month, and never before today", async () => {
    const user = userEvent.setup();
    const { onMonthChange } = renderPicker({
      availability: windows({ "2026-10-01": [slotAt("2026-10-01", "15:00")] }),
      initialDate: "2026-10-01",
    });
    expect(screen.getByRole("button", { name: "Previous week" })).toBeDisabled();
    // The week of Monday 28 September: the days before today can't be picked.
    expect(within(week()).getByRole("button", { name: "Wednesday 30 September 2026" })).toBeDisabled();
    expect(within(week()).getByRole("button", { name: "Thursday 1 October 2026" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    for (let i = 0; i < 5; i++) await user.click(screen.getByRole("button", { name: "Next week" }));
    // Monday 2 November: the strip asks for November.
    expect(onMonthChange).toHaveBeenLastCalledWith("2026-11");
    expect(within(week()).getByRole("button", { name: "Monday 2 November 2026" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous week" }));
    expect(onMonthChange).toHaveBeenLastCalledWith("2026-10");
  });

  it("swipes between weeks on a touch screen, but not before today", () => {
    renderPicker({
      availability: windows({ "2026-10-01": [slotAt("2026-10-01", "15:00")] }),
      initialDate: "2026-10-01",
    });
    const swipe = (fromX: number, toX: number, dy = 0) => {
      fireEvent.touchStart(week(), { touches: [{ clientX: fromX, clientY: 100 }] });
      fireEvent.touchEnd(week(), { changedTouches: [{ clientX: toX, clientY: 100 + dy }] });
    };
    // A swipe to the right on the first week goes nowhere: those days are past.
    swipe(100, 300);
    expect(within(week()).getByRole("button", { name: "Thursday 1 October 2026" })).toBeInTheDocument();
    // Mostly vertical movement is a scroll, not a swipe.
    swipe(300, 240, 200);
    expect(within(week()).getByRole("button", { name: "Thursday 1 October 2026" })).toBeInTheDocument();
    swipe(300, 100);
    expect(within(week()).getByRole("button", { name: "Monday 5 October 2026" })).toBeInTheDocument();
    swipe(100, 300);
    expect(within(week()).getByRole("button", { name: "Thursday 1 October 2026" })).toBeInTheDocument();
  });

  it("disables days without times and picks a day from the strip", async () => {
    const user = userEvent.setup();
    const { onDateChange } = renderPicker({
      availability: windows({
        "2026-10-05": [slotAt("2026-10-05", "09:00")],
        "2026-10-07": [slotAt("2026-10-07", "14:00")],
      }),
      initialDate: "2026-10-05",
    });
    expect(within(week()).getByRole("button", { name: "Tuesday 6 October 2026" })).toBeDisabled();
    await user.click(within(week()).getByRole("button", { name: "Wednesday 7 October 2026" }));
    expect(onDateChange).toHaveBeenLastCalledWith("2026-10-07", "user");
    expect(screen.getByRole("heading", { name: /^Wednesday,? 7 October$/ })).toBeInTheDocument();
  });

  it("opens a month view on demand and closes it after picking a day", async () => {
    const user = userEvent.setup();
    const { onDateChange } = renderPicker({
      availability: windows({
        "2026-10-05": [slotAt("2026-10-05", "09:00")],
        "2026-10-20": [slotAt("2026-10-20", "09:00")],
      }),
      initialDate: "2026-10-05",
    });
    const toggle = screen.getByRole("button", { name: "Month" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("button", { name: "Next week" })).not.toBeInTheDocument();
    // Both the desktop calendar and the mobile month view are grids in jsdom (CSS hides one).
    const grids = screen.getAllByRole("grid", { name: "Choose a date" });
    expect(grids).toHaveLength(2);
    await user.click(
      within(must(grids[1], "month view")).getByRole("button", { name: "Tuesday 20 October 2026" }),
    );
    expect(onDateChange).toHaveBeenLastCalledWith("2026-10-20", "user");
    expect(screen.getByRole("button", { name: "Month" })).toBeInTheDocument();
  });

  it("picks a day on the desktop calendar with the keyboard", async () => {
    const user = userEvent.setup();
    const { onDateChange } = renderPicker({
      availability: windows({
        "2026-10-05": [slotAt("2026-10-05", "09:00")],
        "2026-10-06": [slotAt("2026-10-06", "09:00")],
      }),
      initialDate: "2026-10-05",
    });
    const grid = must(screen.getAllByRole("grid", { name: "Choose a date" })[0], "calendar");
    within(grid).getByRole("button", { name: "Monday 5 October 2026" }).focus();
    await user.keyboard("{ArrowRight}{Enter}");
    expect(onDateChange).toHaveBeenLastCalledWith("2026-10-06", "user");
  });
});
