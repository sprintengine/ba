import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AvailabilityWindows } from "@/lib/api/hooks";
import type { Slot } from "@/lib/api/types";
import { quote, withSlotOffer } from "@/lib/booking/quote";
import { SlotPicker } from "../slot-picker";
import { assessment } from "@/lib/booking/__tests__/fixtures";

const DATE = "2099-10-06";
const deal = {
  id: "of1",
  name: "Quiet Tuesdays",
  label: "20% off",
  originalPriceCents: 5000,
  priceCents: 4000,
};
const slots: Slot[] = [
  {
    start: "2099-10-06T09:00:00+01:00",
    end: "2099-10-06T10:00:00+01:00",
    resourceIds: ["r1"],
    seatsLeft: null,
    offer: null,
  },
  {
    start: "2099-10-06T14:00:00+01:00",
    end: "2099-10-06T15:00:00+01:00",
    resourceIds: ["r1"],
    seatsLeft: null,
    offer: deal,
  },
];

const availability: AvailabilityWindows = {
  days: new Map([[DATE, slots]]),
  locks: new Map(),
  isPending: false,
  isFetching: false,
  isError: false,
  error: null,
  loaded: () => true,
  nextAvailableOnly: false,
  refetch: () => {},
};

function renderPicker(selectedTime: string | null = null) {
  render(
    <SlotPicker
      timeZone="Europe/Dublin"
      locale="en-IE"
      currency="EUR"
      min="2099-10-01"
      max="2099-11-30"
      month="2099-10"
      onMonthChange={vi.fn()}
      date={DATE}
      onDateChange={vi.fn()}
      selectedTime={selectedTime}
      onSelectSlot={vi.fn()}
      availability={availability}
    />,
  );
  return within(screen.getByRole("group", { name: "Available times" }));
}

describe("slot picker deals", () => {
  it("highlights discounted times with the label and a struck-through price", () => {
    const times = renderPicker();
    const discounted = times.getByRole("button", { name: /14:00/ });
    expect(discounted).toHaveTextContent("20% off");
    expect(discounted.querySelector("s")).toHaveTextContent("€50");
    expect(discounted).toHaveTextContent("€40");
    expect(within(discounted).getByText("was €50, now €40")).toHaveClass("sr-only");
    expect(times.getByText("Highlighted times have a deal")).toBeInTheDocument();
  });

  it("keeps plain times unchanged", () => {
    const plain = renderPicker().getByRole("button", { name: "09:00" });
    expect(plain.querySelector("s")).toBeNull();
    expect(plain).toHaveTextContent(/^09:00$/);
  });

  it("keeps the deal visible on the selected time", () => {
    const selected = renderPicker("14:00").getByRole("button", { name: /14:00/ });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected).toHaveTextContent("20% off");
  });
});

describe("withSlotOffer", () => {
  const service = { ...assessment, priceCents: 5000, paymentMode: "full" as const, options: [], addons: [] };
  it("applies the slot's price and records the deal", () => {
    const q = withSlotOffer(quote(service, null, []), service, deal);
    expect(q.totalCents).toBe(4000);
    expect(q.dueNowCents).toBe(4000);
    expect(q.deal).toEqual({
      name: "Quiet Tuesdays",
      label: "20% off",
      originalTotalCents: 5000,
      discountCents: 1000,
    });
  });

  it("leaves the quote alone without a deal (or one that isn't cheaper)", () => {
    const base = quote(service, null, []);
    expect(withSlotOffer(base, service, null)).toBe(base);
    expect(withSlotOffer(base, service, { ...deal, priceCents: 5000 })).toBe(base);
  });

  it("makes a fully discounted booking free", () => {
    const q = withSlotOffer(quote(service, null, []), service, { ...deal, label: "Free", priceCents: 0 });
    expect(q.mode).toBe("free");
    expect(q.dueNowCents).toBe(0);
  });
});
