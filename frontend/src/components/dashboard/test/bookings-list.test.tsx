import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { BookingActionsProvider } from "../booking/booking-actions-provider";
import { BookingsList } from "../bookings/bookings-list";
import { bookingDetail, resource, service } from "./booking-builders";
import { booking, json, mockApi, renderDashboard } from "./render";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/dashboard/lumen-physio/bookings",
  useSearchParams: () => new URLSearchParams(search),
}));

/** The drawer and sheet are loaded on demand; instrumented (coverage) runs import them slowly. */
const LOAD = { timeout: 10_000 };
// Load them once up front, so a busy machine's first transform doesn't eat into a test's wait.
beforeAll(async () => {
  await Promise.all([import("../booking/booking-drawer"), import("../booking/new-booking-sheet")]);
}, 60_000);

/** The screen width `matchMedia` answers for (its `min-width`/`max-width` px conditions); a desktop by default. */
let width = 1440;
const matchesWidth = (media: string) => {
  const conditions = [...media.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)];
  return (
    conditions.length > 0 &&
    conditions.every(([, edge, px]) => (edge === "min" ? width >= Number(px) : width <= Number(px)))
  );
};

beforeEach(() => {
  replace.mockClear();
  // useUrlParams changes the URL with history.replaceState (Next's router follows it): record it as a replace.
  vi.spyOn(window.history, "replaceState").mockImplementation((_state, _unused, url) =>
    replace(String(url), { scroll: false }),
  );
  search = "";
  width = 1440;
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: matchesWidth(media),
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-09-20T09:00:00Z"));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const listCalls = (api: ReturnType<typeof mockApi>) =>
  api.mock.calls.map(([u]) => new URL(String(u), "http://x")).filter((u) => u.pathname.endsWith("/bookings"));

const PATH = "/dashboard/lumen-physio/bookings";
const replacedWith = (query: string) =>
  expect(replace).toHaveBeenCalledWith(query ? `${PATH}?${query}` : PATH, { scroll: false });

/** Serve [items] as the list (one page unless [nextCursor]), two resources and two services. */
function serve(items: Booking[] = [booking()], nextCursor: string | null = null) {
  return mockApi((method, path) => {
    if (path.endsWith("/bookings")) return { items, nextCursor };
    if (path.endsWith("/resources")) return [resource("r1", "Sam Rivers"), resource("r2", "Jo Park", 1)];
    if (path.endsWith("/services")) return [service(), service({ id: "s2", name: "Massage" })];
    if (path.endsWith("/bookings/bk1")) return bookingDetail();
    return [];
  });
}

function renderList() {
  return renderDashboard(
    <BookingActionsProvider>
      <BookingsList />
    </BookingActionsProvider>,
  );
}

describe("BookingsList", () => {
  it("lists upcoming bookings by default, without a reset button", async () => {
    const api = serve();
    renderList();
    expect((await screen.findAllByText("Alex Morgan")).length).toBeGreaterThan(0);
    expect(screen.getByText("1 appointment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    const url = listCalls(api)[0];
    expect(url?.searchParams.get("from")).toBe("2099-09-20");
    expect(url?.searchParams.get("to")).toBeNull();
    expect(url?.searchParams.get("limit")).toBe("50");
  });

  it("shows a row per booking under its day, saying only what's out of the ordinary", async () => {
    serve([
      booking({ option: { id: "o1", name: "Long" } }),
      booking({
        id: "bk2",
        reference: "BA-TEST02",
        customer: { id: "c2", name: "Riley Quinn", email: null, phone: "087 123 4567", groupId: null },
        resources: [],
        status: "pending_approval",
        paymentStatus: "pay_at_venue",
      }),
    ]);
    renderList();
    const table = await screen.findByRole("table");
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(4));
    // Only the table: the phone list isn't rendered alongside it.
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    const [, day, first, second] = within(table).getAllByRole("row");
    expect(day).toHaveTextContent(/2 appointments/);
    expect(first).toHaveTextContent(
      /Alex Morgan.*alex@example\.test.*Follow-up · Long.*Sam Rivers.*€45.*BA-TEST01/,
    );
    expect(first).not.toHaveTextContent(/Confirmed|Paid/);
    expect(second).toHaveTextContent(/Riley Quinn.*087 123 4567.*—.*Needs approval/);
    expect(screen.getByRole("columnheader", { name: "Patient" })).toBeInTheDocument();
  });

  it("shows a class as one row, and opens it to show the people in it", async () => {
    serve([
      booking(),
      booking({
        id: "bk2",
        reference: "BA-TEST02",
        customer: { id: "c2", name: "Riley Quinn", email: null, phone: null, groupId: null },
      }),
    ]);
    const user = userEvent.setup();
    renderList();
    const table = await screen.findByRole("table");
    const row = await within(table).findByRole("row", { name: /2 patients/ });
    expect(within(table).queryByRole("row", { name: /Riley Quinn/ })).not.toBeInTheDocument();
    await user.click(row);
    expect(within(table).getByRole("row", { name: /Riley Quinn/ })).toBeInTheDocument();
  });

  it("opens a booking from its row with the keyboard", async () => {
    serve();
    const user = userEvent.setup();
    renderList();
    const table = await screen.findByRole("table");
    const row = await within(table).findByRole("row", { name: /Alex Morgan/ });
    await user.click(screen.getByRole("textbox", { name: "Search appointments" }));
    // Tab past the toolbar to the row: rows are in the tab order.
    while (document.activeElement !== row) await user.tab();
    await user.keyboard(" ");
    expect(await screen.findByRole("dialog", { name: "Alex Morgan" }, LOAD)).toBeInTheDocument();
  });

  it("renders the list instead of the table below iPad landscape, and opens a booking from it", async () => {
    width = 820;
    serve();
    const user = userEvent.setup();
    renderList();
    const row = await screen.findByRole("button", { name: /Alex Morgan/ });
    // The money stays on a phone, and the normal outcomes stay quiet.
    expect(row).toHaveTextContent(/Alex Morgan.*€45.*Follow-up/);
    expect(row).not.toHaveTextContent(/Confirmed|Paid/);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(row);
    expect(await screen.findByRole("dialog", { name: "Alex Morgan" }, LOAD)).toBeInTheDocument();
  });

  it("mirrors the search into the URL after a pause, and clears it", async () => {
    serve();
    const user = userEvent.setup();
    renderList();
    const box = await screen.findByRole("textbox", { name: "Search appointments" });
    await user.type(box, "  riley ");
    await waitFor(() => replacedWith("q=riley"));
    search = "q=riley"; // what the router would now show
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(box).toHaveValue("");
    await waitFor(() => expect(replace).toHaveBeenLastCalledWith(PATH, { scroll: false }));
  });

  it("queries the filters in the URL and resets them", async () => {
    search =
      "range=custom&from=2026-01-01&to=2026-01-31&status=confirmed,toString&service=s1&resource=r2&q=alex";
    const api = serve([]);
    const user = userEvent.setup();
    renderList();
    expect(await screen.findByText("No appointments match")).toBeInTheDocument();
    const url = listCalls(api)[0];
    expect(url?.searchParams.get("from")).toBe("2026-01-01");
    expect(url?.searchParams.get("to")).toBe("2026-01-31");
    expect(url?.searchParams.getAll("status").join(",")).toContain("confirmed");
    expect(url?.toString()).not.toContain("toString");
    expect(url?.searchParams.get("serviceId")).toBe("s1");
    expect(url?.searchParams.get("resourceId")).toBe("r2");
    expect(url?.searchParams.get("q")).toBe("alex");
    expect(screen.getByRole("textbox", { name: "Search appointments" })).toHaveValue("alex");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => replacedWith(""));
    expect(screen.getByRole("textbox", { name: "Search appointments" })).toHaveValue("");
    replace.mockClear();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => replacedWith(""));
  });

  it("picks a custom range's dates", async () => {
    search = "range=custom&from=2099-09-01";
    serve([]);
    const user = userEvent.setup();
    renderList();
    await screen.findByText("No appointments match");
    expect(screen.getByRole("button", { name: /1 Sept 2099|1 Sep 2099/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^To\b(?!day)/ }));
    await user.click(await screen.findByRole("button", { name: /\b5 September 2099/ }));
    replacedWith("range=custom&from=2099-09-01&to=2099-09-05");
  });

  it("doesn't let a custom range start after it ends", async () => {
    search = "range=custom&from=2099-09-01&to=2099-09-05";
    serve([]);
    const user = userEvent.setup();
    renderList();
    await screen.findByText("No appointments match");
    await user.click(screen.getByRole("button", { name: /1 Sept 2099|1 Sep 2099/ }));
    expect(await screen.findByRole("button", { name: /\b5 September 2099/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /\b6 September 2099/ })).toBeDisabled();
  });

  it("puts a new date range, status, calendar and service filter in the URL", async () => {
    serve();
    const user = userEvent.setup();
    renderList();
    await screen.findByRole("table");

    await user.click(screen.getByRole("combobox", { name: "Date range" }));
    await user.click(await screen.findByRole("option", { name: "Past 30 days" }));
    replacedWith("range=past30");

    await user.click(screen.getByRole("button", { name: /status/i }));
    await user.click(await screen.findByRole("checkbox", { name: "Needs approval" }));
    replacedWith("status=pending_approval");
    await user.keyboard("{Escape}");

    await user.click(await screen.findByRole("combobox", { name: "Filter by therapist" }));
    await user.click(await screen.findByRole("option", { name: "Jo Park" }));
    replacedWith("resource=r2");

    await user.click(screen.getByRole("combobox", { name: "Filter by service" }));
    await user.click(await screen.findByRole("option", { name: "Massage" }));
    replacedWith("service=s2");
  });

  it("counts and clears the picked statuses", async () => {
    search = "status=confirmed,pending_approval";
    serve();
    const user = userEvent.setup();
    renderList();
    const trigger = await screen.findByRole("button", { name: /status/i });
    expect(trigger).toHaveTextContent("Status2");
    await user.click(trigger);
    await user.click(await screen.findByRole("checkbox", { name: "Confirmed" }));
    replacedWith("status=pending_approval");
    await user.click(screen.getByRole("button", { name: "Clear" }));
    replacedWith("");
  });

  it("says there is nothing upcoming and offers to add a booking", async () => {
    serve([]);
    const user = userEvent.setup();
    renderList();
    expect(
      await screen.findByRole("heading", { name: "No upcoming appointments", level: 2 }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
    const [, emptyAction] = screen.getAllByRole("button", { name: /new appointment/i });
    await user.click(emptyAction ?? document.body);
    expect(await screen.findByRole("dialog", { name: "New appointment" }, LOAD)).toBeInTheDocument();
  });

  it("opens the new-booking sheet for ⌘K's ?new=1 and drops the flag", async () => {
    search = "new=1";
    serve();
    renderList();
    expect(await screen.findByRole("dialog", { name: "New appointment" }, LOAD)).toBeInTheDocument();
    replacedWith("");
  });

  it("shows the server's message with a retry when the list fails", async () => {
    let fail = true;
    mockApi((method, path) => {
      if (!path.endsWith("/bookings")) return [];
      return fail
        ? json({ error: { code: "INTERNAL", message: "The list is unavailable" } }, 500)
        : { items: [booking()], nextCursor: null };
    });
    const user = userEvent.setup();
    renderList();
    expect(await screen.findByText("The list is unavailable")).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
    fail = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("loads more on mobile", async () => {
    width = 390;
    const api = serve([booking()], "cursor-2");
    const user = userEvent.setup();
    renderList();
    await user.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(listCalls(api).some((u) => u.searchParams.get("cursor") === "cursor-2")).toBe(true),
    );
  });

  it("has no accessibility violations", async () => {
    serve();
    const { container } = renderList();
    await screen.findByRole("table");
    await expectNoAxeViolations(container);
  });
});
