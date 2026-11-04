import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportSummary } from "@/lib/api/types";
import { ReportsView } from "../reports/reports-view";
import { mockApi, renderDashboard } from "./render";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/dashboard/lumen-physio/reports",
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  replace.mockClear();
  // useUrlParams changes the URL with history.replaceState (Next's router follows it): record it as a replace.
  vi.spyOn(window.history, "replaceState").mockImplementation((_state, _unused, url) =>
    replace(String(url), { scroll: false }),
  );
  search = "range=custom&from=2026-03-01&to=2026-03-02";
});
afterEach(() => vi.unstubAllGlobals());

const summary: ReportSummary = {
  from: "2026-03-01",
  to: "2026-03-02",
  currency: "EUR",
  totals: {
    bookings: 4,
    confirmed: 3,
    cancelled: 1,
    noShows: 0,
    revenueCents: 18000,
    refundedCents: 0,
    newCustomers: 2,
  },
  byDay: [
    { date: "2026-03-01", bookings: 1, revenueCents: 4500 },
    { date: "2026-03-02", bookings: 3, revenueCents: 13500 },
  ],
  byService: [{ serviceId: "s1", name: "Follow-up", bookings: 4, revenueCents: 18000 }],
  byResource: [
    { resourceId: "r1", name: "Sam Rivers", bookedMinutes: 180, availableMinutes: 480, utilisation: 0.375 },
  ],
};

describe("ReportsView", () => {
  it("asks for the range in the URL and shows the totals, breakdowns and a lazily loaded chart", async () => {
    const api = mockApi(() => summary);
    renderDashboard(<ReportsView />);
    expect(await screen.findByText("€180")).toBeInTheDocument();
    expect(screen.getByText("€90 a day")).toBeInTheDocument();
    expect(screen.getByText("25% of appointments")).toBeInTheDocument();
    expect(screen.getByText(/2 days/)).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Sam Rivers utilisation" })).toHaveAttribute(
      "aria-valuenow",
      "38",
    );
    expect(await screen.findByRole("img", { name: /Appointments per day, 2 days/ })).toBeInTheDocument();
    const url = new URL(String(api.mock.calls[0]?.[0]), "http://x");
    expect(url.searchParams.get("from")).toBe("2026-03-01");
    expect(url.searchParams.get("to")).toBe("2026-03-02");
  });

  it("shows the table view with exact values", async () => {
    mockApi(() => summary);
    renderDashboard(<ReportsView />);
    await screen.findByText("€180");
    await userEvent.click(screen.getByRole("radio", { name: "Table" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("€135")).toBeInTheDocument();
  });

  it("says when nothing happened in the period", async () => {
    mockApi(() => ({
      ...summary,
      totals: { ...summary.totals, bookings: 0, confirmed: 0, cancelled: 0, revenueCents: 0 },
      byDay: [],
      byService: [],
    }));
    renderDashboard(<ReportsView />);
    expect(await screen.findByText("Nothing in this period")).toBeInTheDocument();
  });

  it("is for admins only", () => {
    mockApi(() => summary);
    renderDashboard(<ReportsView />, "staff");
    expect(screen.getByText("Reports are for admins")).toBeInTheDocument();
  });
});
