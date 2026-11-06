import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerGroup, CustomerInput } from "@/lib/api/types";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { booking, json, mockApi, renderDashboard } from "../../test/render";
import { CustomerDetailView } from "../customer-detail";
import { customerDetail } from "./customer-fixtures";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/dashboard/lumen-physio/customers/c1",
  useSearchParams: () => new URLSearchParams(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));
const actions = vi.hoisted(() => ({ openBooking: vi.fn(), openNewBooking: vi.fn() }));
vi.mock("@/components/dashboard/booking/booking-actions-provider", () => ({
  useBookingActions: () => actions,
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  replace.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
  actions.openBooking.mockClear();
  actions.openNewBooking.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const members: CustomerGroup = {
  id: "g1",
  name: "Members",
  description: null,
  restricted: false,
  sortOrder: 0,
  isActive: true,
};

const alex = customerDetail({
  id: "c1",
  name: "Alex Morgan",
  phone: "+353871234567",
  groupId: "g1",
  hasAccount: true,
  bookingCount: 3,
  notes: "Prefers mornings",
  bookings: [
    booking({ id: "b-next", start: "2026-10-08T09:00:00+01:00", end: "2026-10-08T09:45:00+01:00" }),
    booking({
      id: "b-cancelled",
      status: "cancelled",
      start: "2026-10-09T09:00:00+01:00",
      end: "2026-10-09T09:45:00+01:00",
    }),
    booking({
      id: "b-past",
      start: "2026-09-01T09:00:00+01:00",
      end: "2026-09-01T09:45:00+01:00",
      option: { id: "o1", name: "Extended" },
      priceCents: 6000,
    }),
  ],
});

type Routes = {
  detail?: () => unknown;
  update?: (input: CustomerInput) => unknown;
  erase?: () => unknown;
  exportData?: () => unknown;
};

function api(routes: Routes = {}) {
  const sent: { method: string; path: string; body: unknown }[] = [];
  mockApi((method, path, body) => {
    if (path.endsWith("/customer-groups")) return [members];
    if (!path.includes("/customers/c1")) return {};
    if (method !== "GET" || path.endsWith("/export")) sent.push({ method, path, body });
    if (path.endsWith("/export"))
      return routes.exportData ? routes.exportData() : { customer: { name: "Alex" } };
    if (method === "PATCH")
      return routes.update ? routes.update(body as CustomerInput) : { ...alex, ...(body as object) };
    if (method === "DELETE") return routes.erase ? routes.erase() : new Response(null, { status: 204 });
    return routes.detail ? routes.detail() : alex;
  });
  return sent;
}

const errorBody = (status: number, code: string, message: string, fields: Record<string, string> = {}) =>
  json({ error: { code, message, fields } }, status);

describe("CustomerDetailView", () => {
  it("says when the customer doesn't exist or isn't visible", async () => {
    api({ detail: () => errorBody(404, "NOT_FOUND", "Customer not found") });
    renderDashboard(<CustomerDetailView customerId="c1" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Patient not found" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "This patient isn't available" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/they only have appointments on calendars you can't see/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /patients/i })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/customers",
    );
  });

  it("shows other errors under the page title, with a way back and a retry", async () => {
    let fail = true;
    api({
      detail: () =>
        fail ? errorBody(500, "INTERNAL_SERVER_ERROR", "The patient couldn't be loaded.") : alex,
    });
    const user = userEvent.setup();
    const { container } = renderDashboard(<CustomerDetailView customerId="c1" />);
    expect(await screen.findByText("The patient couldn't be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Patient" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /patients/i })).toBeInTheDocument();
    await expectNoAxeViolations(container);
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: /Alex Morgan/ })).toBeInTheDocument();
  });

  it("keeps the way back while loading", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderDashboard(<CustomerDetailView customerId="c1" />);
    expect(screen.getByRole("link", { name: /patients/i })).toBeInTheDocument();
    expect(screen.queryByText("Alex Morgan")).not.toBeInTheDocument();
  });

  it("shows contact details, stats and history; axe-clean", async () => {
    api();
    const { container } = renderDashboard(<CustomerDetailView customerId="c1" />);
    expect(await screen.findByRole("heading", { level: 1, name: /Alex Morgan/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /alex@example.test/ })).toHaveAttribute(
      "href",
      "mailto:alex@example.test",
    );
    expect(screen.getByRole("link", { name: /\+353871234567/ })).toHaveAttribute("href", "tel:+353871234567");
    // The group: a badge by the name, and a row of the details.
    expect(screen.getByText("Account").parentElement).toHaveTextContent("Members");
    // One sentence: upcoming counts only the future booking that isn't cancelled.
    expect(screen.getByText(/3 appointments, 1 upcoming\./)).toHaveTextContent(
      /Patient since January 2026\./,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Appointments" })).toBeInTheDocument();

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(must(rows[2], "past row")).toHaveTextContent("Follow-up · Extended");
    expect(must(rows[1], "cancelled row")).toHaveTextContent("Cancelled");
    // Read first: the details are values, not an open form.
    expect(screen.getByText("Prefers mornings")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /notes/i })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("opens a booking from the history by mouse or keyboard", async () => {
    api();
    const user = userEvent.setup();
    renderDashboard(<CustomerDetailView customerId="c1" />);
    await screen.findByRole("table");
    const [, next, , past] = within(screen.getByRole("table")).getAllByRole("row");
    await user.click(must(past, "past row"));
    expect(actions.openBooking).toHaveBeenCalledWith("b-past");

    must(next, "next row").focus();
    await user.keyboard("{Enter}");
    expect(actions.openBooking).toHaveBeenLastCalledWith("b-next");
    await user.keyboard(" ");
    expect(actions.openBooking).toHaveBeenCalledTimes(3);
  });

  it("starts a new booking for the customer", async () => {
    api();
    const user = userEvent.setup();
    renderDashboard(<CustomerDetailView customerId="c1" />);
    await user.click(await screen.findByRole("button", { name: "New appointment" }));
    expect(actions.openNewBooking).toHaveBeenCalledWith({
      customer: { id: "c1", name: "Alex Morgan", email: "alex@example.test", phone: "+353871234567" },
    });
  });

  it("invites a first booking when there's no history", async () => {
    api({ detail: () => ({ ...alex, bookings: [], bookingCount: 0 }) });
    const { container } = renderDashboard(<CustomerDetailView customerId="c1" />);
    expect(await screen.findByText("No appointments yet")).toBeInTheDocument();
    expect(screen.getByText("Book something for Alex.")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  describe("editing", () => {
    it("saves the details", async () => {
      const sent = api();
      const user = userEvent.setup();
      renderDashboard(<CustomerDetailView customerId="c1" />);
      await user.click(await screen.findByRole("button", { name: "Edit details" }));
      const notes = await screen.findByRole("textbox", { name: /notes/i });
      await user.clear(notes);
      await user.type(notes, "Prefers afternoons");
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Saved"));
      // Saved, it goes back to reading.
      expect(await screen.findByRole("button", { name: "Edit details" })).toBeInTheDocument();
      expect(sent).toEqual([
        {
          method: "PATCH",
          path: "/v1/businesses/b1/customers/c1",
          body: {
            name: "Alex Morgan",
            email: "alex@example.test",
            phone: "+353871234567",
            groupId: "g1",
            notes: "Prefers afternoons",
          },
        },
      ]);
    });

    it("puts the server's field errors under the field", async () => {
      api({
        update: () =>
          errorBody(400, "INVALID_REQUEST", "Check the highlighted fields.", {
            phone: "Not a number we can text",
          }),
      });
      const user = userEvent.setup();
      renderDashboard(<CustomerDetailView customerId="c1" />);
      await user.click(await screen.findByRole("button", { name: "Edit details" }));
      await screen.findByRole("textbox", { name: /notes/i });
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      const phone = await screen.findByRole("textbox", { name: /phone/i, description: /can text/ });
      expect(phone).toHaveAttribute("aria-invalid", "true");
      expect(phone).toHaveFocus();
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("validates on the client", async () => {
      const sent = api();
      const user = userEvent.setup();
      renderDashboard(<CustomerDetailView customerId="c1" />);
      await user.click(await screen.findByRole("button", { name: "Edit details" }));
      const name = await screen.findByRole("textbox", { name: "Name" });
      await user.clear(name);
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      expect(name).toHaveAccessibleDescription("Enter a name");
      expect(sent).toEqual([]);
    });
  });

  describe("privacy", () => {
    it("is hidden from staff", async () => {
      api();
      renderDashboard(<CustomerDetailView customerId="c1" />, "staff");
      await screen.findByRole("heading", { level: 1, name: /Alex Morgan/ });
      expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    });

    it("downloads the customer's data as a JSON file from the actions menu", async () => {
      const sent = api();
      const createObjectURL = vi.fn(() => "blob:export");
      vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const user = userEvent.setup();
      renderDashboard(<CustomerDetailView customerId="c1" />);

      await user.click(await screen.findByRole("button", { name: "More actions" }));
      await user.click(await screen.findByRole("menuitem", { name: /Export data/ }));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Export downloaded"));
      expect(sent).toEqual([
        { method: "GET", path: "/v1/businesses/b1/customers/c1/export", body: undefined },
      ]);
      expect(must(click.mock.contexts[0], "clicked link") as HTMLAnchorElement).toHaveAttribute(
        "download",
        "alex-morgan-data-export.json",
      );
    });

    it("reports a failed export", async () => {
      api({ exportData: () => errorBody(403, "FORBIDDEN", "Only admins can export data.") });
      const user = userEvent.setup();
      renderDashboard(<CustomerDetailView customerId="c1" />);
      await user.click(await screen.findByRole("button", { name: "More actions" }));
      await user.click(await screen.findByRole("menuitem", { name: /Export data/ }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Only admins can export data."));
    });

    it("erases only after the name is typed, then goes back to the list", async () => {
      const sent = api();
      const user = userEvent.setup();
      renderDashboard(<CustomerDetailView customerId="c1" />);
      await user.click(await screen.findByRole("button", { name: "More actions" }));
      await user.click(await screen.findByRole("menuitem", { name: /Erase patient/ }));
      const dialog = await screen.findByRole("dialog", { name: "Erase Alex Morgan?" });
      await expectNoAxeViolations(document.body);
      const erase = within(dialog).getByRole("button", { name: "Erase permanently" });
      expect(erase).toBeDisabled();
      const confirm = within(dialog).getByRole("textbox", { name: "Type Alex Morgan to confirm" });
      await user.type(confirm, "alex");
      expect(erase).toBeDisabled();
      await user.type(confirm, " MORGAN ");
      expect(erase).toBeEnabled();
      await user.click(erase);

      await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard/lumen-physio/customers"));
      expect(sent).toEqual([{ method: "DELETE", path: "/v1/businesses/b1/customers/c1", body: undefined }]);
      expect(toast.success).toHaveBeenCalledWith("Personal data erased");
    });

    it("forgets the typed name when closed, and returns focus to the button", async () => {
      api();
      const user = userEvent.setup();
      renderDashboard(<CustomerDetailView customerId="c1" />);
      const more = await screen.findByRole("button", { name: "More actions" });
      await user.click(more);
      await user.click(await screen.findByRole("menuitem", { name: /Erase patient/ }));
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByRole("textbox"), "Alex Morgan");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(more).toHaveFocus());

      await user.click(screen.getByRole("button", { name: "More actions" }));
      await user.click(await screen.findByRole("menuitem", { name: /Erase patient/ }));
      const reopened = await screen.findByRole("dialog");
      expect(within(reopened).getByRole("textbox")).toHaveValue("");
      await user.click(within(reopened).getByRole("button", { name: "Keep" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("reports a failed erase and stays open", async () => {
      api({ erase: () => errorBody(409, "CONFLICT", "They have a booking in progress.") });
      const user = userEvent.setup();
      renderDashboard(<CustomerDetailView customerId="c1" />);
      await user.click(await screen.findByRole("button", { name: "More actions" }));
      await user.click(await screen.findByRole("menuitem", { name: /Erase patient/ }));
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByRole("textbox"), "Alex Morgan");
      await user.click(within(dialog).getByRole("button", { name: "Erase permanently" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("They have a booking in progress."));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });
  });
});
