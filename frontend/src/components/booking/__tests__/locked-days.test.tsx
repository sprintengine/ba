/**
 * Release schedules on the booking page (§21): days that aren't open for online booking yet say when they open, stay
 * selectable, count down and refetch when they open; "next available only" says when more times open.
 */
import { useState } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UseQueryResult } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { combineWindows, type AvailabilityWindows, type NextSlot } from "@/lib/api/hooks";
import type { Availability, Slot } from "@/lib/api/types";
import type { PlainDate } from "@/lib/format";
import { expectNoAxeViolations } from "@/test/axe";
import { formatCountdown, useRefetchAt } from "../locked-day";
import { NextSlotPicker } from "../next-slot-picker";
import { SlotPicker } from "../slot-picker";
import { pinNow, slotAt, TZ } from "./booking-test-utils";

// "Today" is Thursday 1 October 2026, 10:00 in Dublin.
beforeEach(() => pinNow());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function windows(
  days: Record<PlainDate, Slot[]>,
  locks: Record<PlainDate, string | null>,
  refetch: () => void = vi.fn(),
): AvailabilityWindows {
  return {
    days: new Map(Object.entries(days)),
    locks: new Map(Object.entries(locks).map(([d, opensAt]) => [d, { opensAt }])),
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    loaded: () => true,
    nextAvailableOnly: false,
    refetch,
  };
}

function Harness({
  availability,
  initialDate = null,
}: {
  availability: AvailabilityWindows;
  initialDate?: PlainDate | null;
}) {
  const [month, setMonth] = useState("2026-10");
  const [date, setDate] = useState<PlainDate | null>(initialDate);
  return (
    <SlotPicker
      timeZone={TZ}
      locale="en-IE"
      min="2026-10-01"
      max="2026-11-30"
      month={month}
      onMonthChange={setMonth}
      date={date}
      onDateChange={setDate}
      selectedTime={null}
      onSelectSlot={vi.fn()}
      availability={availability}
    />
  );
}

const week = () => screen.getByRole("group", { name: "Choose a date" });

describe("locked days on the booking page", () => {
  it("keeps a closed day selectable and says when it opens", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Harness
        availability={windows(
          { "2026-10-02": [slotAt("2026-10-02", "10:00")], "2026-10-05": [], "2026-10-06": [] },
          { "2026-10-05": "2026-10-02T17:00:00+01:00", "2026-10-06": null },
        )}
        initialDate="2026-10-02"
      />,
    );
    // Monday 5 is closed but selectable, with a lock in place of the dot.
    const monday = screen.getAllByRole("button", { name: "Monday 5 October 2026, not open for booking yet" });
    expect(monday.every((b) => !b.hasAttribute("disabled"))).toBe(true);
    await user.click(screen.getByRole("button", { name: /Next week/ }));
    await user.click(
      screen.getAllByRole("button", {
        name: "Monday 5 October 2026, not open for booking yet",
      })[0] as HTMLElement,
    );
    expect(screen.getByText("Opens tomorrow at 17:00")).toBeInTheDocument();
    expect(screen.getByText(/aren't open for online booking yet/)).toBeInTheDocument();
    // A held day says the business hasn't opened it.
    await user.click(
      screen.getAllByRole("button", {
        name: "Tuesday 6 October 2026, not open for booking yet",
      })[0] as HTMLElement,
    );
    expect(screen.getByText("Not open for online booking yet")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("lands on the first closed day when nothing in the month is open yet", async () => {
    render(
      <Harness
        availability={windows(
          { "2026-10-02": [], "2026-10-05": [] },
          { "2026-10-05": "2026-10-02T17:00:00+01:00" },
        )}
      />,
    );
    expect(await screen.findByText("Opens tomorrow at 17:00")).toBeInTheDocument();
    expect(screen.queryByText("No times available right now")).not.toBeInTheDocument();
  });

  it("counts down in the last hours and offers the next open day", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        availability={windows(
          { "2026-10-02": [], "2026-10-03": [slotAt("2026-10-03", "11:00")] },
          { "2026-10-02": "2026-10-01T12:15:00+01:00" },
        )}
        initialDate="2026-10-02"
      />,
    );
    expect(screen.getByText("Opens today at 12:15")).toBeInTheDocument();
    expect(screen.getByText("Opens in 2 h 15 min")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Next available: Sat, 3 Oct/ }));
    expect(within(week()).getByRole("button", { name: "Saturday 3 October 2026" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("useRefetchAt", () => {
  function Probe({ opensAt, refetch }: { opensAt: string | null; refetch: () => void }) {
    useRefetchAt(opensAt, refetch);
    return null;
  }

  it("refetches once the day opens, a few seconds later at most", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
    const refetch = vi.fn();
    render(<Probe opensAt="2026-10-01T10:30:00+01:00" refetch={refetch} />);
    await act(async () => {
      vi.advanceTimersByTime(30 * 60_000 - 1);
    });
    expect(refetch).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(5_001);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("doesn't wait on releases more than six hours away, or on held days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
    const refetch = vi.fn();
    render(<Probe opensAt="2026-10-02T17:00:00+01:00" refetch={refetch} />);
    render(<Probe opensAt={null} refetch={refetch} />);
    await act(async () => {
      vi.advanceTimersByTime(7 * 3_600_000);
    });
    expect(refetch).not.toHaveBeenCalled();
  });
});

describe("useRefetchAt, further cases", () => {
  function Probe({ opensAt, refetch }: { opensAt: string | null; refetch: () => void }) {
    useRefetchAt(opensAt, refetch);
    return null;
  }

  it("looks again at a release that was more than six hours away, and refetches when it opens", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
    const refetch = vi.fn();
    render(<Probe opensAt="2026-10-01T18:00:00+01:00" refetch={refetch} />); // 8 hours away
    await act(async () => {
      vi.advanceTimersByTime(8 * 3_600_000 - 1);
    });
    expect(refetch).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(5_001);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("asks again a couple of times while the server still has the same opening, then stops", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
    const refetch = vi.fn();
    // A new function every render, as the windows' refetch is: it must not restart the wait.
    const { rerender } = render(<Probe opensAt="2026-10-01T10:00:01+01:00" refetch={() => refetch()} />);
    rerender(<Probe opensAt="2026-10-01T10:00:01+01:00" refetch={() => refetch()} />);
    await act(async () => {
      vi.advanceTimersByTime(6_000);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    // Each retry is armed after the previous one ran.
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });
    }
    expect(refetch).toHaveBeenCalledTimes(3);
  });
});

it("formats a countdown", () => {
  expect(formatCountdown(30_000)).toBe("under a minute");
  expect(formatCountdown(9 * 60_000)).toBe("9 min");
  expect(formatCountdown(2 * 3_600_000)).toBe("2 h");
  expect(formatCountdown(74 * 60_000)).toBe("1 h 14 min");
});

it("merges each window's closed days", () => {
  const result = (days: Availability["days"]) =>
    ({
      data: { timezone: TZ, from: "", to: "", durationMinutes: 60, days, nextAvailableOnly: false },
    }) as UseQueryResult<Availability>;
  const merged = combineWindows([
    { from: "2026-10-01", to: "2026-10-02" },
    { from: "2026-10-03", to: "2026-10-03" },
  ])([
    result([
      { date: "2026-10-01", slots: [], opensAt: null, held: false },
      { date: "2026-10-02", slots: [], opensAt: "2026-10-01T17:00:00+01:00", held: false },
    ]),
    result([{ date: "2026-10-03", slots: [], opensAt: null, held: true }]),
  ]);
  expect([...merged.locks]).toEqual([
    ["2026-10-02", { opensAt: "2026-10-01T17:00:00+01:00" }],
    ["2026-10-03", { opensAt: null }],
  ]);
});

describe("next available only", () => {
  const next = (patch: Partial<NextSlot>): NextSlot => ({
    slot: null,
    opensAt: null,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    none: false,
    refetch: vi.fn(),
    ...patch,
  });
  const picker = (n: NextSlot, stepped = false) => (
    <NextSlotPicker
      timeZone={TZ}
      locale="en-IE"
      next={n}
      stepped={stepped}
      selected={false}
      chooseLabel="Book this time"
      onChoose={vi.fn()}
      onLater={vi.fn()}
      onEarliest={vi.fn()}
    />
  );

  it("says when more times open, with or without a time to offer", () => {
    const { rerender } = render(picker(next({ none: true, opensAt: "2026-10-02T17:00:00+01:00" })));
    expect(screen.getByText("More times open tomorrow at 17:00")).toBeInTheDocument();
    expect(screen.queryByText("No times available right now")).not.toBeInTheDocument();
    rerender(picker(next({ slot: slotAt("2026-10-01", "15:00"), opensAt: "2026-10-02T17:00:00+01:00" })));
    expect(screen.getByText("More times open tomorrow at 17:00.")).toBeInTheDocument();
    rerender(picker(next({ none: true })));
    expect(screen.getByText("No times available right now")).toBeInTheDocument();
  });
});
