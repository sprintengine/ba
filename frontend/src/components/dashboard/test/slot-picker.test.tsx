import { useState } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Slot } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { SlotPicker } from "../booking/slot-picker";
import { availability, requestUrl, slot } from "./booking-builders";
import { json, mockApi, renderDashboard } from "./render";

afterEach(() => vi.unstubAllGlobals());

const DAY = "2099-10-06";
const at = (time: string, patch: Partial<Slot> = {}) => slot(`${DAY}T${time}:00+01:00`, patch);

/** A picker that keeps its own date and choice, as the sheet and the reschedule dialog do. */
function Picker({
  onChange = () => {},
  excludeStart,
  excludeBookingId,
}: {
  onChange?: (slot: Slot) => void;
  excludeStart?: string;
  excludeBookingId?: string;
}) {
  const [date, setDate] = useState(DAY);
  const [value, setValue] = useState<string | null>(null);
  return (
    <SlotPicker
      serviceId="s1"
      optionId="o1"
      addonIds={["a1", "a2"]}
      resourceId="r1"
      date={date}
      onDateChange={setDate}
      value={value}
      onChange={(s) => {
        setValue(s.start);
        onChange(s);
      }}
      excludeStart={excludeStart}
      excludeBookingId={excludeBookingId}
    />
  );
}

describe("dashboard SlotPicker", () => {
  it("asks for staff availability for the service, option, add-ons and calendar over a week", async () => {
    const api = mockApi(() => availability({ [DAY]: [at("10:00")] }));
    renderDashboard(<Picker excludeBookingId="bk1" />);
    await screen.findByRole("radio", { name: "10:00" });
    const url = requestUrl(api, "/availability");
    expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
      serviceId: "s1",
      optionId: "o1",
      addonIds: "a1,a2",
      resourceId: "r1",
      excludeBookingId: "bk1",
      from: DAY,
      to: "2099-10-12",
      includePrivate: "true",
    });
  });

  it("shows a busy placeholder while loading", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { container } = renderDashboard(<Picker />);
    expect(container.querySelector("[aria-busy]")).not.toBeNull();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("groups times by period, hides the excluded start and shows seats left", async () => {
    mockApi(() =>
      availability({
        [DAY]: [at("09:00"), at("10:00", { seatsLeft: 3 }), at("14:00"), at("18:30")],
      }),
    );
    renderDashboard(<Picker excludeStart={`${DAY}T09:00:00+01:00`} />);
    const morning = await screen.findByRole("radiogroup", { name: "Morning times" });
    expect(
      within(morning)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual(["10:003 left"]);
    expect(screen.queryByRole("radio", { name: /09:00/ })).not.toBeInTheDocument();
    await expectNoAxeViolations(document.body);
    // One part of the day at a time, each with how many times it has.
    expect(screen.getByRole("button", { name: /^Morning/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /^Afternoon/ }));
    expect(screen.getByRole("radiogroup", { name: "Afternoon times" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Evening/ }));
    expect(screen.getByRole("radiogroup", { name: "Evening times" })).toBeInTheDocument();
  });

  it("is one tab stop per period; arrows, Home and End move and choose", async () => {
    mockApi(() => availability({ [DAY]: [at("09:00"), at("10:00"), at("11:00")] }));
    const onChange = vi.fn<(slot: Slot) => void>();
    const user = userEvent.setup();
    renderDashboard(<Picker onChange={onChange} />);
    const first = await screen.findByRole("radio", { name: "09:00" });
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([0, -1, -1]);

    await user.tab();
    expect(first).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "10:00" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "10:00" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    await user.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "11:00" })).toHaveFocus();
    await user.keyboard("{ArrowDown}"); // wraps
    expect(first).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("radio", { name: "11:00" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(first).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "11:00" })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("a");
    expect(onChange.mock.calls.map(([s]) => s.start.slice(11, 16))).toEqual([
      "10:00",
      "11:00",
      "09:00",
      "11:00",
      "09:00",
      "11:00",
    ]);
  });

  it("keeps the previous service's times dimmed and unchoosable while the new one's load", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = mockApi(() => availability({ [DAY]: [at("10:00")] }));
    const route = api.getMockImplementation()!;
    api.mockImplementation(async (input, init) => {
      if (String(input).includes("serviceId=s2")) {
        await gate;
        return json(availability({ [DAY]: [at("11:00")] }));
      }
      return route(input, init);
    });
    function Switcher() {
      const [serviceId, setServiceId] = useState("s1");
      return (
        <>
          <button type="button" onClick={() => setServiceId("s2")}>
            Other service
          </button>
          <SlotPicker
            serviceId={serviceId}
            optionId={null}
            addonIds={[]}
            date={DAY}
            onDateChange={() => {}}
            value={null}
            onChange={onChange}
          />
        </>
      );
    }
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderDashboard(<Switcher />);
    expect(await screen.findByRole("radio", { name: "10:00" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Other service" }));
    expect(screen.getByRole("radio", { name: "10:00" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "10:00" }));
    expect(onChange).not.toHaveBeenCalled();
    release();
    expect(await screen.findByRole("radio", { name: "11:00" })).toBeEnabled();
  });

  it("chooses a time with a click", async () => {
    mockApi(() => availability({ [DAY]: [at("09:00"), at("10:00")] }));
    const onChange = vi.fn<(slot: Slot) => void>();
    renderDashboard(<Picker onChange={onChange} />);
    await userEvent.click(await screen.findByRole("radio", { name: "10:00" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ start: `${DAY}T10:00:00+01:00` }));
    expect(screen.getByRole("radio", { name: "10:00" })).toHaveAttribute("aria-checked", "true");
  });

  it("offers the next day with free times when the day is full", async () => {
    const api = mockApi(() =>
      availability({ [DAY]: [], "2099-10-07": [], "2099-10-08": [slot("2099-10-08T10:00:00+01:00")] }),
    );
    renderDashboard(<Picker />);
    expect(await screen.findByText(/No free times on/)).toHaveTextContent("No free times on Tue, 6 Oct");
    await userEvent.click(screen.getByRole("button", { name: "Next available: Thu, 8 Oct" }));
    await waitFor(() =>
      expect(
        api.mock.calls.some(
          ([u]) => new URL(String(u), "http://x").searchParams.get("from") === "2099-10-08",
        ),
      ).toBe(true),
    );
  });

  it("suggests another date or an exact time when the week is full", async () => {
    mockApi(() => availability({ [DAY]: [] }));
    renderDashboard(<Picker />);
    expect(await screen.findByText(/Nothing in the following week either/)).toBeInTheDocument();
  });

  it("alerts with the server's message and retries", async () => {
    let fail = true;
    const api = mockApi(() =>
      fail
        ? json({ error: { code: "INTERNAL", message: "Availability is down" } }, 500)
        : availability({ [DAY]: [at("10:00")] }),
    );
    renderDashboard(<Picker />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Availability is down");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByRole("radio", { name: "10:00" })).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
  });
});
