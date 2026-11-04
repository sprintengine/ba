import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { business } from "@shared/api/__tests__/fixtures/business";
import { reportSummary } from "@shared/api/__tests__/fixtures/dashboard";
import type { ReportSummary } from "@shared/api/types";
import { addDaysToPlainDate, todayInTz } from "@shared/format";
import { json, mockApi, pending } from "~/test/api-mock";
import { renderBusinessScreen } from "~/test/render-business";
import * as layout from "~/ui/layout";
import { ReportsScreen } from "./ReportsScreen";

const SUMMARY = `/v1/businesses/${business.id}/reports/summary`;

const summary: ReportSummary = {
  ...reportSummary,
  byDay: [
    { date: "2026-09-01", bookings: 2, revenueCents: 9_000 },
    { date: "2026-09-02", bookings: 0, revenueCents: 0 },
    { date: "2026-09-03", bookings: 5, revenueCents: 250_000 },
  ],
  byService: [
    { serviceId: "s1", name: "Follow-up", bookings: 4, revenueCents: 20_000 },
    { serviceId: "s2", name: "Initial assessment", bookings: 20, revenueCents: 140_000 },
  ],
  byResource: [
    ...reportSummary.byResource,
    { resourceId: "r2", name: "Room 1", bookedMinutes: 90, availableMinutes: 600, utilisation: 0.15 },
  ],
};

const empty: ReportSummary = {
  ...summary,
  totals: {
    bookings: 0,
    confirmed: 0,
    cancelled: 0,
    noShows: 0,
    revenueCents: 0,
    refundedCents: 0,
    newCustomers: 0,
  },
  byDay: [],
  byService: [],
  byResource: [],
};

/** Answers every summary request with `body` (or what `body` returns for the range); records the ranges asked. */
function api(body: ReportSummary | ((range: { from: string; to: string }) => unknown) = summary) {
  const ranges: { from: string; to: string }[] = [];
  const fetch = mockApi((method, path) => {
    if (path !== SUMMARY) return undefined;
    const url = new URL(String(fetch.mock.calls.at(-1)![0]));
    const range = { from: url.searchParams.get("from")!, to: url.searchParams.get("to")! };
    ranges.push(range);
    return typeof body === "function" ? body(range) : body;
  });
  return ranges;
}

function wide(isWide: boolean) {
  jest.spyOn(layout, "useLayout").mockReturnValue({ isWide, width: isWide ? 1024 : 390, height: 800 });
}

/** The text drawn in the charts' SVG (tick and date labels). */
function svgTexts(): string[] {
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const { props, children } = node as { props?: { content?: unknown }; children?: unknown };
    if (typeof props?.content === "string") found.push(props.content);
    walk(children);
  };
  walk(screen.toJSON());
  return found;
}

const today = () => todayInTz(business.timezone);

async function pickRange(label: string) {
  fireEvent.press(await screen.findByTestId("reports-range"));
  fireEvent.press((await screen.findAllByRole("button", { name: label })).at(-1)!);
}

describe("Reports", () => {
  // The test window is 750pt wide (an iPad layout); phones unless a test says otherwise.
  beforeEach(() => wide(false));

  it("shows the last 30 days: totals, per day, by service and utilisation", async () => {
    const ranges = api();
    renderBusinessScreen(<ReportsScreen />, { role: "admin", path: "reports" });
    expect(await screen.findByLabelText("Appointments: 41. 36 confirmed")).toBeOnTheScreen();
    expect(ranges[0]).toEqual({ from: addDaysToPlainDate(today(), -29), to: today() });
    expect(screen.getByTestId("reports-period")).toHaveTextContent(/· 30 days$/);
    expect(screen.getByLabelText("Revenue: €1,840. €61.33 a day")).toBeOnTheScreen();
    expect(screen.getByLabelText("Cancelled: 3. 7% of appointments")).toBeOnTheScreen();
    expect(screen.getByLabelText("No-shows: 2. 5% of appointments")).toBeOnTheScreen();
    expect(screen.getByLabelText("New patients: 9")).toBeOnTheScreen();
    expect(screen.getByLabelText("Refunded: €45")).toBeOnTheScreen();

    expect(screen.getByText("Appointments per day")).toBeOnTheScreen();
    expect(screen.getByTestId("reports-chart")).toHaveProp(
      "accessibilityLabel",
      "Appointments per day, 3 days. Switch to the table for exact values.",
    );

    // Busiest service first, each read as a sentence.
    const services = within(screen.getByTestId("reports-by-service")).getAllByLabelText(/appointments?, €/);
    expect(services.map((s) => s.props.accessibilityLabel)).toEqual([
      "Initial assessment: 20 appointments, €1,400",
      "Follow-up: 4 appointments, €200",
    ]);
    expect(screen.getByTestId(`reports-utilisation-${reportSummary.byResource[0]!.resourceId}`)).toHaveProp(
      "accessibilityValue",
      { min: 0, max: 100, now: 50, text: "50%, 20 h of 40 h" },
    );
    expect(screen.getByTestId("reports-utilisation-r2")).toHaveProp(
      "accessibilityLabel",
      "Room 1 utilisation",
    );
  });

  it("switches to another period and keeps the last one on screen while it loads", async () => {
    let slow = false;
    const ranges = api(() => (slow ? pending() : summary));
    renderBusinessScreen(<ReportsScreen />, { role: "owner", path: "reports" });
    expect(await screen.findByLabelText("Appointments: 41. 36 confirmed")).toBeOnTheScreen();

    slow = true;
    await pickRange("Last 7 days");
    await waitFor(() =>
      expect(ranges.at(-1)).toEqual({ from: addDaysToPlainDate(today(), -6), to: today() }),
    );
    expect(screen.getByTestId("reports-period")).toHaveTextContent(/· 7 days$/);
    // The previous numbers stay (dimmed) instead of skeletons.
    expect(screen.getByLabelText("Appointments: 41. 36 confirmed")).toBeOnTheScreen();

    slow = false;
    await pickRange("This year");
    await waitFor(() => expect(ranges.at(-1)).toEqual({ from: `${today().slice(0, 4)}-01-01`, to: today() }));
  });

  it("picks a custom range with From and To", async () => {
    const ranges = api();
    renderBusinessScreen(<ReportsScreen />, { role: "owner", path: "reports" });
    await pickRange("Custom");
    // Custom starts from the period on screen.
    const from = await screen.findByTestId("reports-from-picker");
    expect(screen.getByTestId("reports-to-picker")).toBeOnTheScreen();

    fireEvent(from, "change", { nativeEvent: { timestamp: new Date(2026, 0, 5, 12).getTime() } });
    await waitFor(() => expect(ranges.at(-1)).toEqual({ from: "2026-01-05", to: today() }));
    fireEvent(screen.getByTestId("reports-to-picker"), "change", {
      nativeEvent: { timestamp: new Date(2026, 0, 31, 12).getTime() },
    });
    await waitFor(() => expect(ranges.at(-1)).toEqual({ from: "2026-01-05", to: "2026-01-31" }));
    expect(screen.getByTestId("reports-period")).toHaveTextContent("5 Jan 2026 – 31 Jan 2026 · 27 days");

    // From after To moves To along; To before From moves From back.
    fireEvent(screen.getByTestId("reports-from-picker"), "change", {
      nativeEvent: { timestamp: new Date(2026, 1, 10, 12).getTime() },
    });
    await waitFor(() => expect(ranges.at(-1)).toEqual({ from: "2026-02-10", to: "2026-02-10" }));
    fireEvent(screen.getByTestId("reports-to-picker"), "change", {
      nativeEvent: { timestamp: new Date(2026, 1, 1, 12).getTime() },
    });
    await waitFor(() => expect(ranges.at(-1)).toEqual({ from: "2026-02-01", to: "2026-02-01" }));

    await pickRange("Last 90 days");
    await waitFor(() =>
      expect(ranges.at(-1)).toEqual({ from: addDaysToPlainDate(today(), -89), to: today() }),
    );
    expect(screen.queryByTestId("reports-from-picker")).toBeNull();
  });

  it("switches between bookings and revenue, and between the chart and the table", async () => {
    api();
    renderBusinessScreen(<ReportsScreen />, { role: "owner", path: "reports" });
    const chart = await screen.findByTestId("reports-chart");

    fireEvent.press(screen.getByRole("tab", { name: "Revenue" }));
    expect(screen.getByText("Revenue per day")).toBeOnTheScreen();
    expect(chart).toHaveProp(
      "accessibilityLabel",
      "Revenue per day, 3 days. Switch to the table for exact values.",
    );
    // Big amounts get compact ticks.
    expect(svgTexts()).toEqual(["€0", "€1K", "€2K", "€3K", "1 Sept", "2 Sept", "3 Sept"]);

    fireEvent.press(screen.getByRole("tab", { name: "Table" }));
    expect(screen.queryByTestId("reports-chart")).toBeNull();
    const table = screen.getByTestId("reports-table");
    expect(within(table).getByTestId("row-2026-09-01")).toHaveProp(
      "accessibilityLabel",
      "Tue 1 Sept 2026: 2 appointments, €90",
    );
    expect(within(table).getByTestId("row-2026-09-02")).toHaveTextContent(/0.*€0/);
    expect(within(table).getByTestId("row-2026-09-03")).toHaveTextContent(/5.*€2,500/);

    fireEvent.press(screen.getByRole("tab", { name: "Chart" }));
    expect(screen.getByTestId("reports-chart")).toBeOnTheScreen();
  });

  it("shows a day's value when its bar is pressed or VoiceOver adjusts the chart", async () => {
    api();
    renderBusinessScreen(<ReportsScreen />, { role: "owner", path: "reports" });
    const chart = await screen.findByTestId("reports-chart");
    // Lay the chart out: 3 days across 332pt with a 32pt axis (100pt each).
    fireEvent(chart, "layout", { nativeEvent: { layout: { width: 332, height: 256, x: 0, y: 0 } } });

    fireEvent.press(screen.getByTestId("reports-chart-plot"), { nativeEvent: { locationX: 250 } });
    const tooltip = screen.getByTestId("reports-chart-tooltip");
    expect(tooltip).toHaveTextContent("5 appointmentsThu 3 Sept 2026");
    expect(chart).toHaveProp("accessibilityValue", { text: "Thu 3 Sept 2026: 5 appointments" });
    // Pressing it again (or outside the plot) hides it.
    fireEvent.press(screen.getByTestId("reports-chart-plot"), { nativeEvent: { locationX: 250 } });
    expect(screen.queryByTestId("reports-chart-tooltip")).toBeNull();
    fireEvent.press(screen.getByTestId("reports-chart-plot"), { nativeEvent: { locationX: 5 } });
    expect(screen.queryByTestId("reports-chart-tooltip")).toBeNull();

    fireEvent(chart, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(chart).toHaveProp("accessibilityValue", { text: "Tue 1 Sept 2026: 2 appointments" });
    fireEvent(chart, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(chart).toHaveProp("accessibilityValue", { text: "Wed 2 Sept 2026: 0 appointments" });
    fireEvent(chart, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    fireEvent(chart, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(chart).toHaveProp("accessibilityValue", { text: "Tue 1 Sept 2026: 2 appointments" });

    // Switching the measure clears the selection.
    fireEvent.press(screen.getByRole("tab", { name: "Revenue" }));
    expect(chart.props.accessibilityValue).toBeUndefined();
    fireEvent(chart, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(chart).toHaveProp("accessibilityValue", { text: "Thu 3 Sept 2026: €2,500" });
  });

  it("says when there's nothing in the period", async () => {
    api(empty);
    renderBusinessScreen(<ReportsScreen />, { role: "owner", path: "reports" });
    expect(await screen.findByTestId("reports-empty")).toHaveTextContent(/Nothing in this period/);
    expect(screen.getByText("No appointments in this period.")).toBeOnTheScreen();
    expect(screen.getByText("Nothing to show yet.")).toBeOnTheScreen();
    // No percentages of nothing.
    expect(screen.getByLabelText("Cancelled: 0")).toBeOnTheScreen();
  });

  it("shows skeletons while the first report loads", async () => {
    api(() => pending());
    renderBusinessScreen(<ReportsScreen />, { role: "owner", path: "reports" });
    expect(await screen.findByLabelText("Appointments: loading")).toBeOnTheScreen();
    expect(screen.queryByTestId("reports-chart")).toBeNull();
  });

  it("shows an error with a retry", async () => {
    let failing = true;
    api(() =>
      failing
        ? json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Boom", fields: {} } }, 500)
        : summary,
    );
    renderBusinessScreen(<ReportsScreen />, { role: "owner", path: "reports" });
    expect(await screen.findByTestId("error-state")).toBeOnTheScreen();
    failing = false;
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Try again" })));
    expect(await screen.findByLabelText("Appointments: 41. 36 confirmed")).toBeOnTheScreen();
  });

  it("puts the breakdowns side by side on iPad", async () => {
    wide(true);
    api();
    renderBusinessScreen(<ReportsScreen />, { role: "owner", path: "reports" });
    expect(await screen.findByLabelText("Appointments: 41. 36 confirmed")).toBeOnTheScreen();
    expect(screen.getByTestId("reports-by-service")).toBeOnTheScreen();
    expect(screen.getByTestId("reports-utilisation")).toBeOnTheScreen();
  });

  it("tells staff the reports are for admins, without asking for them", async () => {
    const ranges = api();
    renderBusinessScreen(<ReportsScreen />, { role: "staff", path: "reports" });
    expect(await screen.findByText("Reports are for admins")).toBeOnTheScreen();
    expect(ranges).toEqual([]);
  });
});
