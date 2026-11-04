import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Availability } from "@/lib/api/types";
import { SlotPicker } from "../booking/slot-picker";
import { mockApi, renderDashboard } from "./render";

afterEach(() => vi.unstubAllGlobals());

const availability: Availability = {
  timezone: "Europe/Dublin",
  from: "2099-10-06",
  to: "2099-10-12",
  durationMinutes: 60,
  nextAvailableOnly: false,
  days: [
    {
      date: "2099-10-06",
      slots: [
        {
          start: "2099-10-06T10:00:00+01:00",
          end: "2099-10-06T11:00:00+01:00",
          resourceIds: ["r1"],
          seatsLeft: null,
          offer: null,
        },
        {
          start: "2099-10-06T14:00:00+01:00",
          end: "2099-10-06T15:00:00+01:00",
          resourceIds: ["r1"],
          seatsLeft: null,
          offer: {
            id: "o1",
            name: "Tuesday afternoons",
            label: "20% off",
            originalPriceCents: 5000,
            priceCents: 4000,
          },
        },
      ],
      opensAt: null,
      held: false,
    },
  ],
};

describe("dashboard SlotPicker deals", () => {
  it("labels the free times a deal discounts, since staff bookings get it too", async () => {
    mockApi(() => availability);
    renderDashboard(
      <SlotPicker
        serviceId="s1"
        optionId={null}
        addonIds={[]}
        date="2099-10-06"
        onDateChange={() => {}}
        value={null}
        onChange={() => {}}
      />,
    );
    const afternoon = await screen.findByRole("radio", { name: /14:00/ });
    expect(afternoon).toHaveTextContent("20% off");
    expect(screen.getByRole("radio", { name: /10:00/ })).not.toHaveTextContent("off");
  });
});
