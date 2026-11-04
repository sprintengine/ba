import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { useState } from "react";
import { resource, service } from "@shared/api/__tests__/fixtures/catalog";
import { ids } from "@shared/api/__tests__/fixtures/ids";
import type { Resource, Service } from "@shared/api/types";
import type { BookingFilters } from "@shared/dashboard/booking-filters";
import { mockApi } from "~/test/api-mock";
import { renderOpsScreen } from "~/test/render-ops-screen";
import { BookingFilterBar, DEFAULT_FILTERS } from "./BookingFilters";

const TODAY = "2026-10-15";
const resources: Resource[] = [resource, { ...resource, id: ids.resource2, name: "Jordan Casey" }];
const services: Service[] = [service, { ...service, id: "s2", name: "Follow-up" }];

/** The bar with its filters in state, like the bookings list; every change and reset is recorded. */
function renderBar(
  initial: Partial<BookingFilters> = {},
  lists: { resources?: Resource[]; services?: Service[] } = {},
) {
  const changes: Partial<BookingFilters>[] = [];
  const onReset = jest.fn();
  let latest: BookingFilters = { ...DEFAULT_FILTERS, ...initial };
  function Harness() {
    const [filters, setFilters] = useState<BookingFilters>(latest);
    latest = filters;
    return (
      <BookingFilterBar
        filters={filters}
        onChange={(patch) => {
          changes.push(patch);
          setFilters((f) => ({ ...f, ...patch }));
        }}
        resources={lists.resources ?? resources}
        services={lists.services ?? services}
        filtered={JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)}
        onReset={onReset}
        today={TODAY}
      />
    );
  }
  renderOpsScreen(<Harness />);
  return { changes, onReset, filters: () => latest };
}

describe("BookingFilterBar", () => {
  beforeEach(() => {
    mockApi(() => undefined);
  });

  it("picks a date range from its sheet, which closes once chosen", async () => {
    const bar = renderBar();
    fireEvent.press(await screen.findByLabelText("Date range: Upcoming"));
    const sheet = await screen.findByTestId("range-sheet");
    expect(within(sheet).getByTestId("range-upcoming")).toBeChecked();
    fireEvent.press(within(sheet).getByTestId("range-next7"));
    await waitFor(() => expect(screen.queryByTestId("range-sheet")).toBeNull());
    expect(screen.getByLabelText("Date range: Next 7 days")).toBeOnTheScreen();
    expect(bar.changes).toEqual([{ range: "next7", customFrom: null, customTo: null }]);
    expect(screen.getByTestId("filter-reset")).toBeOnTheScreen();
  });

  it("picks a custom range day by day, and shows it on the chip", async () => {
    const bar = renderBar();
    fireEvent.press(await screen.findByTestId("filter-range"));
    const sheet = await screen.findByTestId("range-sheet");
    fireEvent.press(within(sheet).getByTestId("range-custom"));
    // The sheet stays open with a "From" and a "To" month.
    expect(within(sheet).getByText("From")).toBeOnTheScreen();
    expect(screen.getByLabelText("Date range: Custom range")).toBeOnTheScreen();
    const [from, to] = within(sheet).getAllByTestId("day-2026-10-05");
    fireEvent.press(from!);
    expect(screen.getByLabelText(/^Date range: .*5 Oct.* – …$/)).toBeOnTheScreen();
    // Days before "From" can't end the range.
    expect(within(sheet).getAllByTestId("day-2026-10-04")[1]).toBeDisabled();
    fireEvent.press(within(sheet).getAllByTestId("day-2026-10-20")[1]!);
    expect(to).toBeOnTheScreen();
    expect(bar.filters()).toMatchObject({
      range: "custom",
      customFrom: "2026-10-05",
      customTo: "2026-10-20",
    });
    expect(screen.getByLabelText(/^Date range: .*5 Oct.* – .*20 Oct.*$/)).toBeOnTheScreen();
    fireEvent.press(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByTestId("range-sheet")).toBeNull());
  });

  it("shows a custom range with only an end", async () => {
    renderBar({ range: "custom", customTo: "2026-10-20" });
    expect(await screen.findByLabelText(/^Date range: … – .*20 Oct.*$/)).toBeOnTheScreen();
  });

  it("toggles 'Needs approval' on and off", async () => {
    const bar = renderBar();
    fireEvent.press(await screen.findByTestId("filter-pending"));
    expect(screen.getByTestId("filter-pending")).toBeChecked();
    // The one-tap filter doesn't also highlight "Status".
    expect(screen.getByTestId("filter-status")).not.toBeSelected();
    fireEvent.press(screen.getByTestId("filter-pending"));
    expect(screen.getByTestId("filter-pending")).not.toBeChecked();
    expect(bar.changes).toEqual([{ statuses: ["pending_approval"] }, { statuses: [] }]);
  });

  it("picks statuses in a sheet, counts them, and clears them", async () => {
    const bar = renderBar();
    fireEvent.press(await screen.findByTestId("filter-status"));
    const sheet = await screen.findByTestId("status-sheet");
    expect(within(sheet).queryByRole("button", { name: "Clear" })).toBeNull();
    fireEvent.press(within(sheet).getByTestId("status-confirmed"));
    fireEvent.press(within(sheet).getByTestId("status-held"));
    expect(within(sheet).getByTestId("status-confirmed")).toBeChecked();
    expect(screen.getByLabelText("Status, 2")).toBeOnTheScreen();
    fireEvent.press(within(sheet).getByTestId("status-confirmed"));
    expect(bar.filters().statuses).toEqual(["held"]);
    fireEvent.press(within(sheet).getByRole("button", { name: "Clear" }));
    expect(bar.filters().statuses).toEqual([]);
    expect(within(sheet).getByTestId("status-held")).not.toBeChecked();
    fireEvent.press(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByTestId("status-sheet")).toBeNull());
  });

  it("narrows to one therapist and back to all of them", async () => {
    const bar = renderBar();
    fireEvent.press(await screen.findByRole("button", { name: "All therapists" }));
    fireEvent.press(await screen.findByRole("radio", { name: "Jordan Casey" }));
    await waitFor(() => expect(screen.queryByRole("radio", { name: "Jordan Casey" })).toBeNull());
    expect(screen.getByTestId("filter-resource")).toHaveTextContent("Jordan Casey");
    fireEvent.press(screen.getByTestId("filter-resource"));
    expect(await screen.findByRole("radio", { name: "Jordan Casey" })).toBeChecked();
    fireEvent.press(screen.getByRole("radio", { name: "All therapists" }));
    await waitFor(() => expect(screen.queryByRole("radio", { name: "Jordan Casey" })).toBeNull());
    expect(bar.changes).toEqual([{ resourceId: ids.resource2 }, { resourceId: "all" }]);
  });

  it("narrows to one service and back to all of them", async () => {
    const bar = renderBar();
    fireEvent.press(await screen.findByRole("button", { name: "All services" }));
    fireEvent.press(await screen.findByRole("radio", { name: "Follow-up" }));
    await waitFor(() => expect(screen.queryByRole("radio", { name: "Follow-up" })).toBeNull());
    expect(screen.getByTestId("filter-service")).toHaveTextContent("Follow-up");
    fireEvent.press(screen.getByTestId("filter-service"));
    fireEvent.press(await screen.findByRole("radio", { name: "All services" }));
    await waitFor(() => expect(screen.queryByRole("radio", { name: "Follow-up" })).toBeNull());
    expect(bar.changes).toEqual([{ serviceId: "s2" }, { serviceId: "all" }]);
  });

  it("hides the therapist and service filters when there's only one, and resets", async () => {
    const bar = renderBar({ statuses: ["confirmed"] }, { resources: [resource], services: [service] });
    expect(await screen.findByTestId("filter-status")).toBeOnTheScreen();
    expect(screen.queryByTestId("filter-resource")).toBeNull();
    expect(screen.queryByTestId("filter-service")).toBeNull();
    fireEvent.press(screen.getByTestId("filter-reset"));
    expect(bar.onReset).toHaveBeenCalled();
  });
});
