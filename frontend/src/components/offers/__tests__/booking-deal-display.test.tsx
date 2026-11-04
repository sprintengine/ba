import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BookingDetail } from "@/lib/api/types";
import { BookingSummaryCard } from "@/components/booking/booking-summary";
import { quote, withSlotOffer } from "@/lib/booking/quote";
import { assessment, business as publicBusiness } from "@/lib/booking/__tests__/fixtures";
import { BookingDrawer } from "@/components/dashboard/booking/booking-drawer";
import { booking, mockApi, renderDashboard } from "@/components/dashboard/test/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => vi.unstubAllGlobals());

const slotDeal = {
  id: "of1",
  name: "Quiet Tuesdays",
  label: "20% off",
  originalPriceCents: 7000,
  priceCents: 5600,
};

describe("applied deal in price breakdowns", () => {
  it("booking summary: deal line and the struck-through total", () => {
    const service = { ...assessment, paymentMode: "full" as const };
    const q = withSlotOffer(quote(service, null, []), service, slotDeal);
    render(
      <BookingSummaryCard
        business={publicBusiness}
        service={service}
        selection={{
          groupId: null,
          serviceId: service.id,
          optionId: null,
          addonIds: [],
          resource: null,
          date: "2099-10-06",
          time: "14:00",
        }}
        quote={q}
        steps={["service", "time", "details", "review"]}
      />,
    );
    const summary = screen.getByRole("complementary");
    expect(within(summary).getByText("Quiet Tuesdays")).toBeInTheDocument();
    expect(within(summary).getByText("20% off")).toBeInTheDocument();
    expect(summary).toHaveTextContent("-€14");
    expect(within(summary).getByText("was €70, now €56")).toBeInTheDocument();
  });

  it("staff booking detail: shows the deal and the original price", async () => {
    const detail: BookingDetail = {
      ...booking({
        priceCents: 3600,
        amountPaidCents: 3600,
        originalPriceCents: 4500,
        offer: {
          id: "of1",
          name: "Quiet Tuesdays",
          label: "20% off",
          originalPriceCents: 4500,
          discountCents: 900,
        },
      }),
      payments: [],
      history: [],
      checkoutUrl: null,
    };
    mockApi((_m, path) => (path.endsWith("/customer-groups") ? [] : detail));
    renderDashboard(<BookingDrawer bookingId="bk1" open onOpenChange={() => {}} />);
    expect(await screen.findByText("Quiet Tuesdays")).toBeInTheDocument();
    expect(screen.getByText("20% off")).toBeInTheDocument();
    expect(screen.getByText("was €45, now €36")).toBeInTheDocument();
  });
});
