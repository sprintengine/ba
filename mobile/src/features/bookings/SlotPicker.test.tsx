import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";
import { service } from "@shared/api/__tests__/fixtures/catalog";
import { ids } from "@shared/api/__tests__/fixtures/ids";
import { slotOffer } from "@shared/api/__tests__/fixtures/offers";
import type { Availability, Slot } from "@shared/api/types";
import { apiError, mockApi, pending } from "~/test/api-mock";
import { B, renderOpsScreen } from "~/test/render-ops-screen";
import { SlotPicker } from "./SlotPicker";

const at = (date: string, time: string) => `${date}T${time}:00+01:00`;
const slot = (date: string, time: string, patch: Partial<Slot> = {}): Slot => ({
  start: at(date, time),
  end: at(date, time),
  resourceIds: [ids.resource],
  seatsLeft: null,
  offer: null,
  ...patch,
});
const week = (days: Record<string, Slot[]>): Availability => ({
  timezone: "Europe/Dublin",
  from: "2026-10-15",
  to: "2026-10-21",
  durationMinutes: 60,
  nextAvailableOnly: false,
  days: Object.entries(days).map(([date, slots]) => ({ date, slots, opensAt: null, held: false })),
});

function Picker({ excludeStart }: { excludeStart?: string }) {
  const [date, setDate] = useState("2026-10-15");
  const [value, setValue] = useState<string | null>(null);
  return (
    <>
      <SlotPicker
        serviceId={service.id}
        optionId={ids.option}
        addonIds={[ids.addon]}
        resourceId={ids.resource}
        date={date}
        onDateChange={setDate}
        value={value}
        onChange={(s) => setValue(s.start)}
        excludeStart={excludeStart}
      />
      <Text testID="date">{date}</Text>
    </>
  );
}

/** Availability answers in turn (the last one repeats). */
function availabilityApi(...answers: (() => unknown)[]) {
  let n = 0;
  return mockApi((method, path) => {
    if (method === "GET" && path === `${B}/availability`) {
      const answer = answers[Math.min(n, answers.length - 1)]!;
      n += 1;
      return answer();
    }
    return undefined;
  });
}

const availabilityUrls = (fetch: jest.Mock) =>
  fetch.mock.calls.map(([url]) => new URL(String(url))).filter((u) => u.pathname === `${B}/availability`);

describe("SlotPicker", () => {
  it("shows a placeholder while the times load", () => {
    availabilityApi(pending);
    renderOpsScreen(<Picker />);
    expect(screen.getByRole("progressbar", { name: "Loading free times" })).toBeOnTheScreen();
  });

  it("lists the day's free times by part of the day, with deals and seats left, and picks one", async () => {
    const fetch = availabilityApi(() =>
      week({
        "2026-10-15": [
          slot("2026-10-15", "09:00"),
          slot("2026-10-15", "14:30", { offer: slotOffer, seatsLeft: 3 }),
          slot("2026-10-15", "18:00", { seatsLeft: 1 }),
        ],
      }),
    );
    renderOpsScreen(<Picker />);
    const morning = await screen.findByTestId("slot-09:00");
    expect(screen.getByText("Morning")).toBeOnTheScreen();
    expect(screen.getByText("Afternoon")).toBeOnTheScreen();
    expect(screen.getByText("Evening")).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "14:30, 20% off · 3 left" })).toHaveTextContent(
      "14:30 · 20% off · 3 left",
    );
    expect(screen.getByRole("radio", { name: "18:00, 1 left" })).toBeOnTheScreen();

    fireEvent.press(morning);
    expect(screen.getByTestId("slot-09:00")).toBeChecked();
    expect(screen.getByTestId("slot-18:00")).not.toBeChecked();

    const [url] = availabilityUrls(fetch);
    expect(Object.fromEntries(url!.searchParams)).toMatchObject({
      serviceId: service.id,
      optionId: ids.option,
      addonIds: ids.addon,
      resourceId: ids.resource,
      from: "2026-10-15",
      to: "2026-10-21",
      includePrivate: "true",
    });
  });

  it("hides the time being moved from", async () => {
    availabilityApi(() => week({ "2026-10-15": [slot("2026-10-15", "09:00"), slot("2026-10-15", "10:00")] }));
    renderOpsScreen(<Picker excludeStart={at("2026-10-15", "09:00")} />);
    expect(await screen.findByTestId("slot-10:00")).toBeOnTheScreen();
    expect(screen.queryByTestId("slot-09:00")).toBeNull();
  });

  it("offers the next day with free times, keeping the old ones dimmed while it loads", async () => {
    const fetch = availabilityApi(
      () => week({ "2026-10-15": [], "2026-10-16": [], "2026-10-17": [slot("2026-10-17", "11:00")] }),
      pending,
    );
    renderOpsScreen(<Picker />);
    expect(await screen.findByTestId("no-free-times")).toHaveTextContent(/No free times on Thu, 15 Oct/);
    fireEvent.press(screen.getByRole("button", { name: "Next available: Sat, 17 Oct" }));
    expect(screen.getByTestId("date")).toHaveTextContent("2026-10-17");
    // The week already loaded has the 17th's times: shown, but not choosable until that day's own answer.
    const stale = await screen.findByTestId("slot-11:00");
    expect(stale).toBeDisabled();
    await waitFor(() => expect(availabilityUrls(fetch)).toHaveLength(2));
    expect(availabilityUrls(fetch)[1]!.searchParams.get("from")).toBe("2026-10-17");
  });

  it("says when nothing is free in the following week either", async () => {
    availabilityApi(() => week({ "2026-10-15": [], "2026-10-16": [] }));
    renderOpsScreen(<Picker />);
    expect(
      await screen.findByText("Nothing in the following week either. Try another date or set an exact time."),
    ).toBeOnTheScreen();
  });

  it("shows why the times didn't load, and tries again", async () => {
    availabilityApi(
      () => apiError(503, "SERVICE_UNAVAILABLE", "Availability is down"),
      () => week({ "2026-10-15": [slot("2026-10-15", "09:00")] }),
    );
    renderOpsScreen(<Picker />);
    expect(await screen.findByText("Availability is down")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("slot-09:00")).toBeOnTheScreen();
  });
});
