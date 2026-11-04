import { act, fireEvent, screen } from "@testing-library/react-native";
import type { AvailabilityWindows } from "@shared/api/hooks/use-public";
import type { NextSlot } from "@shared/api/hooks/use-next-slot";
import { addDaysToPlainDate } from "@shared/format";
import { slotAt, tomorrow, TZ } from "~/test/customer";
import { renderWithProviders } from "~/test/render";
import { monthGrid } from "./MonthCalendar";
import { NextSlotPicker } from "./NextSlotPicker";
import { formatOpensIn, nextOpening } from "./refetch";
import { slotColumns } from "./SlotGrid";
import { SlotPicker } from "./SlotPicker";

function windows(patch: Partial<AvailabilityWindows> = {}): AvailabilityWindows {
  return {
    days: new Map(),
    locks: new Map(),
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    loaded: () => true,
    nextAvailableOnly: false,
    refetch: jest.fn(),
    ...patch,
  };
}

const day = tomorrow();

function picker(availability: AvailabilityWindows, extra: { date?: string | null } = {}) {
  const onDateChange = jest.fn();
  const onSelectSlot = jest.fn();
  renderWithProviders(
    <SlotPicker
      timeZone={TZ}
      min={day}
      max={addDaysToPlainDate(day, 60)}
      month={day.slice(0, 7)}
      onMonthChange={jest.fn()}
      date={extra.date === undefined ? day : extra.date}
      onDateChange={onDateChange}
      selectedTime={null}
      onSelectSlot={onSelectSlot}
      availability={availability}
      currency="EUR"
    />,
  );
  // Lay the picker out at a phone's width.
  act(() => {
    fireEvent(screen.getByTestId("slot-picker"), "layout", {
      nativeEvent: { layout: { width: 358, height: 600 } },
    });
  });
  return { onDateChange, onSelectSlot };
}

describe("SlotPicker", () => {
  it("shows a day's times with deals and seats, and picks one", () => {
    const deal = { id: "o", name: "Quiet", label: "20% off", originalPriceCents: 5000, priceCents: 4000 };
    const { onSelectSlot } = picker(
      windows({
        days: new Map([
          [day, [slotAt(day, "09:00", 60, { offer: deal }), slotAt(day, "10:00", 60, { seatsLeft: 2 })]],
        ]),
      }),
    );
    expect(screen.getByTestId("week-strip")).toBeOnTheScreen();
    expect(screen.getByText("Highlighted times have a deal")).toBeOnTheScreen();
    expect(screen.getByTestId("slot-09:00")).toHaveAccessibleName("09:00, 20% off, was €50, now €40");
    expect(screen.getByTestId("slot-10:00")).toHaveAccessibleName("10:00, 2 places left");
    fireEvent.press(screen.getByTestId("slot-10:00"));
    expect(onSelectSlot).toHaveBeenCalledWith(expect.anything(), day, "10:00");
  });

  it("says when a day isn't open yet, and offers the next day with times", () => {
    const next = addDaysToPlainDate(day, 2);
    const { onDateChange } = picker(
      windows({
        days: new Map([
          [day, []],
          [next, [slotAt(next, "09:00")]],
        ]),
        locks: new Map([[day, { opensAt: null }]]),
      }),
    );
    expect(screen.getByTestId("locked-day")).toHaveTextContent(/Not open for online booking yet/);
    fireEvent.press(screen.getByRole("button", { name: /^Next available:/ }));
    expect(onDateChange).toHaveBeenCalledWith(next, "user");
  });

  it("says when a day has no times", () => {
    picker(windows({ days: new Map([[day, []]]) }));
    expect(screen.getByTestId("no-times-on-day")).toHaveTextContent(/No free times on this day/);
  });

  it("shows the error with a retry", () => {
    picker(windows({ isError: true, error: { message: "Down", status: 500 } as never }));
    expect(screen.getByText("We couldn't load available times")).toBeOnTheScreen();
  });

  it("switches the week strip to the month and back", () => {
    picker(windows({ days: new Map([[day, [slotAt(day, "09:00")]]]) }));
    fireEvent.press(screen.getByRole("button", { name: "Month" }));
    expect(screen.getByTestId("month-calendar")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Week" }));
    expect(screen.queryByTestId("month-calendar")).toBeNull();
  });

  it("picks the first day with times when none is chosen", () => {
    const { onDateChange } = picker(windows({ days: new Map([[day, [slotAt(day, "09:00")]]]) }), {
      date: null,
    });
    expect(onDateChange).toHaveBeenCalledWith(day, "auto");
  });
});

describe("NextSlotPicker", () => {
  const base: NextSlot = {
    slot: null,
    opensAt: null,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    none: false,
    refetch: jest.fn(),
  };
  const render = (next: NextSlot, stepped = false) => {
    const handlers = { onChoose: jest.fn(), onLater: jest.fn(), onEarliest: jest.fn() };
    renderWithProviders(
      <NextSlotPicker
        timeZone={TZ}
        next={next}
        stepped={stepped}
        selected={false}
        chooseLabel="Book this time"
        {...handlers}
      />,
    );
    return handlers;
  };

  it("offers the next time, a later one, and back to the earliest", () => {
    const slot = slotAt(day, "09:00");
    const h = render({ ...base, slot }, true);
    expect(screen.getByText("NEXT AVAILABLE AFTER THAT")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("next-slot-later"));
    expect(h.onLater).toHaveBeenCalledWith(slot);
    fireEvent.press(screen.getByRole("button", { name: "Back to the earliest time" }));
    expect(h.onEarliest).toHaveBeenCalled();
  });

  it("says when more times open, and when there are none", () => {
    render({ ...base, none: true, opensAt: `${day}T17:00:00+01:00` });
    expect(screen.getByText(/^More times open /)).toBeOnTheScreen();
  });

  it("says when there are no later times", () => {
    render({ ...base, none: true }, true);
    expect(screen.getByText("No later times available")).toBeOnTheScreen();
  });

  it("loads", () => {
    render(base);
    expect(screen.getByLabelText("Finding the next available time")).toBeOnTheScreen();
  });
});

describe("time helpers", () => {
  it("lays out a month Monday first", () => {
    const weeks = monthGrid("2026-10");
    expect(weeks[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it("counts columns and countdowns, and finds the next opening", () => {
    expect([slotColumns(300), slotColumns(420), slotColumns(700)]).toEqual([3, 4, 5]);
    expect(formatOpensIn(30_000)).toBe("under a minute");
    expect(formatOpensIn(9 * 60_000)).toBe("9 min");
    expect(formatOpensIn(2 * 3_600_000)).toBe("2 h");
    expect(formatOpensIn(74 * 60_000)).toBe("1 h 14 min");
    expect(
      nextOpening(
        new Map([
          ["a", { opensAt: "2026-10-06T17:00:00Z" }],
          ["b", { opensAt: "2026-10-05T17:00:00Z" }],
          ["c", { opensAt: null }],
        ]),
      ),
    ).toBe("2026-10-05T17:00:00Z");
  });
});
