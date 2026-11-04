import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer, CustomerGroup, CustomerInput, Page } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { json, renderDashboard } from "../../test/render";
import { CustomersList } from "../customers-list";
import { customer } from "./customer-fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/dashboard/lumen-physio/customers",
  useSearchParams: () => new URLSearchParams(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

/** The infinite-scroll sentinel's observer: tests call `reveal()` to scroll it into view. */
let observed: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
const reveal = () => act(() => observed?.([{ isIntersecting: true }]));

beforeEach(() => {
  push.mockClear();
  toast.success.mockClear();
  observed = null;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observed = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

type ListQuery = { q: string | null; cursor: string | null };
type Fake = {
  list?: (query: ListQuery) => Page<Customer> | Response | Promise<Response>;
  groups?: CustomerGroup[];
  create?: (input: CustomerInput) => Customer | Response;
};

/** The customers list and create endpoints; records each list query and create body. */
function fakeCustomers(fake: Fake = {}) {
  const queries: ListQuery[] = [];
  const created: CustomerInput[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = init?.method ?? "GET";
      if (url.pathname.endsWith("/customer-groups")) return json(fake.groups ?? []);
      if (url.pathname.endsWith("/customers") && method === "POST") {
        const body = JSON.parse(String(init?.body)) as CustomerInput;
        created.push(body);
        const result = fake.create ? fake.create(body) : customer({ ...body, id: "c9" });
        return result instanceof Response ? result : json(result);
      }
      if (url.pathname.endsWith("/customers")) {
        const query = { q: url.searchParams.get("q"), cursor: url.searchParams.get("cursor") };
        queries.push(query);
        const result = fake.list ? await fake.list(query) : { items: [], nextCursor: null };
        return result instanceof Response ? result : json(result);
      }
      return json({});
    }),
  );
  return { queries, created };
}

const alex = customer({
  id: "c1",
  name: "Alex Morgan",
  phone: "+353871234567",
  hasAccount: true,
  groupId: "g1",
  bookingCount: 3,
  lastBookingAt: "2026-09-12T09:00:00Z",
});
const sam = customer({ id: "c2", name: "Sam Rivers", email: null, bookingCount: 0 });
const members: CustomerGroup = {
  id: "g1",
  name: "Members",
  description: null,
  restricted: false,
  sortOrder: 0,
  isActive: true,
};

const bodyRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

describe("CustomersList", () => {
  it("shows placeholder rows while loading", async () => {
    let release: (r: Response) => void = () => {};
    fakeCustomers({ list: () => new Promise<Response>((resolve) => (release = resolve)) });
    renderDashboard(<CustomersList />);
    expect(screen.getByRole("heading", { name: "Patients" })).toBeInTheDocument();
    await waitFor(() => expect(bodyRows()).toHaveLength(8));
    expect(screen.queryByText("Alex Morgan")).not.toBeInTheDocument();
    release(json({ items: [alex], nextCursor: null }));
    expect(await screen.findByText("Alex Morgan")).toBeInTheDocument();
  });

  it("invites adding the first one when there are none; axe-clean", async () => {
    fakeCustomers();
    const { container } = renderDashboard(<CustomersList />);
    expect(await screen.findByText("No patients yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add patient" })).toHaveLength(2);
    await expectNoAxeViolations(container);
  });

  it("shows the error and retries", async () => {
    let fail = true;
    fakeCustomers({
      list: () =>
        fail
          ? json(
              { error: { code: "INTERNAL_SERVER_ERROR", message: "Patients are unavailable.", fields: {} } },
              500,
            )
          : { items: [alex], nextCursor: null },
    });
    const user = userEvent.setup();
    renderDashboard(<CustomersList />);
    expect(await screen.findByText("Patients are unavailable.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Alex Morgan")).toBeInTheDocument();
  });

  it("lists customers with contact, group, bookings and last visit, each linking to their page; axe-clean", async () => {
    fakeCustomers({ list: () => ({ items: [alex, sam], nextCursor: null }), groups: [members] });
    const { container } = renderDashboard(<CustomersList />);
    await screen.findByText("Alex Morgan");
    await screen.findByText("Members");
    const [first, second] = bodyRows();
    expect(
      within(must(first, "first row"))
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual([
      expect.stringMatching(/Alex MorganAccount/),
      "alex@example.test+353871234567",
      "Members",
      "3",
      "12 Sept 2026",
    ]);
    expect(
      within(must(second, "second row"))
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual([expect.stringMatching(/Sam Rivers/), "No email", "—", "0", "—"]);
    expect(screen.getByRole("link", { name: /Alex Morgan/ })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/customers/c1",
    );
    expect(screen.getByText("2 patients")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("opens a customer from anywhere on the row", async () => {
    fakeCustomers({ list: () => ({ items: [alex], nextCursor: null }) });
    const user = userEvent.setup();
    renderDashboard(<CustomersList />);
    await user.click(await screen.findByText("3"));
    expect(push).toHaveBeenCalledWith("/dashboard/lumen-physio/customers/c1");
  });

  it("loads the next page when the end of the list scrolls into view", async () => {
    const { queries } = fakeCustomers({
      list: ({ cursor }) =>
        cursor === "p2" ? { items: [sam], nextCursor: null } : { items: [alex], nextCursor: "p2" },
    });
    renderDashboard(<CustomersList />);
    await screen.findByText("Alex Morgan");
    expect(screen.queryByText(/1 patient/)).not.toBeInTheDocument();
    reveal();
    expect(await screen.findByText("Sam Rivers")).toBeInTheDocument();
    expect(queries.map((q) => q.cursor)).toEqual([null, "p2"]);
    expect(screen.getByText("2 patients")).toBeInTheDocument();
  });

  it("searches as you type, says when nothing matches and clears the search", async () => {
    const { queries } = fakeCustomers({
      list: ({ q }) => (q ? { items: [], nextCursor: null } : { items: [alex], nextCursor: null }),
    });
    const user = userEvent.setup();
    renderDashboard(<CustomersList />);
    await screen.findByText("Alex Morgan");
    const search = screen.getByRole("textbox", { name: "Search patients" });
    await user.type(search, "  zed ");
    expect(await screen.findByText("No patients match “zed”")).toBeInTheDocument();
    expect(queries.at(-1)).toEqual({ q: "zed", cursor: null });
    // Typing on doesn't lose the focus to the clear button appearing.
    expect(search).toHaveFocus();

    // One in the field, one in the empty state.
    const clear = screen.getAllByRole("button", { name: "Clear search" });
    expect(clear).toHaveLength(2);
    await user.click(must(clear[1], "the empty state's clear button"));
    expect(search).toHaveValue("");
    expect(await screen.findByText("Alex Morgan")).toBeInTheDocument();

    await user.type(search, "a");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
  });

  describe("adding a customer", () => {
    it("validates, creates and opens the new customer", async () => {
      const { created } = fakeCustomers({ groups: [members] });
      const user = userEvent.setup();
      renderDashboard(<CustomersList />);
      await screen.findByText("No patients yet");
      const [headerButton] = screen.getAllByRole("button", { name: "Add patient" });
      await user.click(must(headerButton, "add button"));

      const dialog = await screen.findByRole("dialog", { name: "Add a patient" });
      await expectNoAxeViolations(document.body);
      await user.click(within(dialog).getByRole("button", { name: "Add patient" }));
      const name = within(dialog).getByRole("textbox", { name: "Name" });
      expect(name).toHaveAccessibleDescription("Enter a name");
      expect(name).toHaveAttribute("aria-invalid", "true");
      expect(name).toHaveFocus();

      await user.type(name, "Jamie Doyle");
      await user.type(within(dialog).getByRole("textbox", { name: /email/i }), "jamie@");
      await user.type(within(dialog).getByRole("textbox", { name: /phone/i }), "abc");
      await user.click(within(dialog).getByRole("button", { name: "Add patient" }));
      expect(within(dialog).getByRole("textbox", { name: /email/i })).toHaveAccessibleDescription(
        "Enter a valid email",
      );
      expect(within(dialog).getByRole("textbox", { name: /phone/i })).toHaveAccessibleDescription(
        "Enter a valid phone number",
      );

      await user.clear(within(dialog).getByRole("textbox", { name: /email/i }));
      await user.type(within(dialog).getByRole("textbox", { name: /email/i }), "jamie@example.test");
      await user.clear(within(dialog).getByRole("textbox", { name: /phone/i }));
      await user.click(within(dialog).getByRole("combobox", { name: "Group" }));
      await user.click(await screen.findByRole("option", { name: "Members" }));
      await user.click(within(dialog).getByRole("button", { name: "Add patient" }));

      await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/lumen-physio/customers/c9"));
      expect(created).toEqual([
        { name: "Jamie Doyle", email: "jamie@example.test", phone: null, groupId: "g1", notes: null },
      ]);
      expect(toast.success).toHaveBeenCalledWith("Jamie Doyle added");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("puts the server's field errors under the field", async () => {
      fakeCustomers({
        create: () =>
          json(
            {
              error: {
                code: "INVALID_REQUEST",
                message: "Check the highlighted fields.",
                fields: { email: "A patient with this email already exists" },
              },
            },
            400,
          ),
      });
      const user = userEvent.setup();
      renderDashboard(<CustomersList />);
      await screen.findByText("No patients yet");
      await user.click(must(screen.getAllByRole("button", { name: "Add patient" })[0], "add button"));
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Alex");
      await user.type(within(dialog).getByRole("textbox", { name: /email/i }), "alex@example.test");
      await user.click(within(dialog).getByRole("button", { name: "Add patient" }));

      const email = await within(dialog).findByRole("textbox", {
        name: /email/i,
        description: /already exists/,
      });
      expect(email).toHaveAttribute("aria-invalid", "true");
      expect(email).toHaveFocus();
      expect(push).not.toHaveBeenCalled();
    });

    it("closes on Escape, giving focus back to the button", async () => {
      fakeCustomers();
      const user = userEvent.setup();
      renderDashboard(<CustomersList />);
      await screen.findByText("No patients yet");
      const open = must(screen.getAllByRole("button", { name: "Add patient" })[0], "add button");
      await user.click(open);
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(open).toHaveFocus());
    });
  });
});
