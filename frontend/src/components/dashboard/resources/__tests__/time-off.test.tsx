import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import { renderDashboard } from "@/components/dashboard/test/render";
import { Closures, TimeOff } from "../time-off";
import { apiError, fakeResourcesApi, override, resource } from "./fake-resources-api";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  toast.success.mockReset();
  toast.error.mockReset();
});

const overrides = [
  override({ id: "past", date: "2026-09-20", reason: "Old" }),
  override({ id: "extra", date: "2026-10-20", isAvailable: true, startTime: "18:00", endTime: "20:00" }),
  override({ id: "dentist", date: "2026-10-12", startTime: "10:00", endTime: "12:00", reason: "Dentist" }),
  override({ id: "off", date: "2026-10-12", reason: null }),
];

function renderTimeOff(editable = true) {
  const view = renderDashboard(<TimeOff resourceId="r1" editable={editable} />);
  return { ...view, user: userEvent.setup() };
}

async function openAddDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Add" }));
  return screen.findByRole("dialog", { name: "Add time off or extra hours" });
}

/** Chooses a type in the dialog with the keyboard (arrow keys move and check, as Radix radios do). */
async function chooseType(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, presses: number) {
  const type = within(dialog).getByRole("radiogroup", { name: "Type" });
  within(type).getByRole("radio", { checked: true }).focus();
  for (let i = 0; i < presses; i++) await user.keyboard("{ArrowRight>}{/ArrowRight}");
  return type;
}

describe("TimeOff", () => {
  it("shows a loading state, then upcoming entries in date order", async () => {
    fakeResourcesApi({ resources: [resource()], overrides });
    const { container } = renderTimeOff();
    expect(screen.getByRole("status", { name: "Loading time off" })).toBeInTheDocument();

    const list = await screen.findByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/12 Oct 2026Day offAll day$/),
      expect.stringMatching(/12 Oct 2026Unavailable10:00–12:00 · Dentist$/),
      expect.stringMatching(/20 Oct 2026Extra hours18:00–20:00$/),
    ]);
    expect(screen.queryByText(/Old/)).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("shows the API's error with a retry", async () => {
    const api = fakeResourcesApi({ resources: [resource()], overrides });
    api.fail("GET", /\/availability$/, () => apiError(503, "UNAVAILABLE", "Try later."));
    const { user } = renderTimeOff();
    expect(await screen.findByText(/Try later\.|server didn't respond/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("list")).toBeInTheDocument();
  });

  it("says when nothing is planned", async () => {
    fakeResourcesApi({ resources: [resource()] });
    renderTimeOff();
    expect(await screen.findByRole("heading", { name: "Nothing planned" })).toBeInTheDocument();
  });

  it("removes an entry, naming it by date", async () => {
    const api = fakeResourcesApi({ resources: [resource()], overrides: [override({ id: "o1" })] });
    const { user } = renderTimeOff();
    await user.click(await screen.findByRole("button", { name: "Remove 12 Oct 2026" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Removed"));
    expect(api.requests.some((r) => r.method === "DELETE" && r.path.endsWith("/overrides/o1"))).toBe(true);
    expect(await screen.findByRole("heading", { name: "Nothing planned" })).toBeInTheDocument();
  });

  it("says why a removal failed", async () => {
    const api = fakeResourcesApi({ resources: [resource()], overrides: [override({ id: "o1" })] });
    api.fail("DELETE", /\/overrides\/o1$/, () => apiError(404, "NOT_FOUND", "Already gone."));
    const { user } = renderTimeOff();
    await user.click(await screen.findByRole("button", { name: "Remove 12 Oct 2026" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Already gone."));
  });

  it("is view-only when not editable", async () => {
    fakeResourcesApi({ resources: [resource()], overrides });
    renderTimeOff(false);
    await screen.findByRole("list");
    expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("adds part of a day off, checking the times as they change", async () => {
    const api = fakeResourcesApi({ resources: [resource()] });
    const { user } = renderTimeOff();
    const dialog = await openAddDialog(user);
    expect(
      within(dialog)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual(["Day off", "Part of the day", "Extra hours"]);
    await expectNoAxeViolations(document.body);

    await chooseType(user, dialog, 1);
    expect(within(dialog).getByRole("radio", { name: "Part of the day" })).toBeChecked();
    const from = within(dialog).getByRole("textbox", { name: "Unavailable from" });
    const until = within(dialog).getByRole("textbox", { name: "Unavailable until" });
    expect(from).toHaveValue("09:00");
    expect(until).toHaveValue("13:00");

    await user.clear(until);
    await user.type(until, "8:00");
    await user.tab();
    expect(until).toHaveAccessibleDescription("Ends before it starts");
    expect(from).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await expectNoAxeViolations(document.body);

    await user.clear(until);
    await user.type(until, "12:30");
    await user.tab();
    await user.click(within(dialog).getByRole("button", { name: /^Date/ }));
    await user.click(await screen.findByRole("button", { name: /\b14 October 2026/ }));
    await user.type(within(dialog).getByRole("textbox", { name: /note/i }), "Dentist");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.bodies("POST", "/resources/r1/overrides")).toEqual([
      { date: "2026-10-14", isAvailable: false, startTime: "09:00", endTime: "12:30", reason: "Dentist" },
    ]);
    expect(toast.success).toHaveBeenCalledWith("Added");
    expect(await screen.findByText("09:00–12:30 · Dentist")).toBeInTheDocument();
  });

  it("adds extra hours, labelled as available time", async () => {
    const api = fakeResourcesApi({ resources: [resource()] });
    const { user } = renderTimeOff();
    const dialog = await openAddDialog(user);
    await chooseType(user, dialog, 2);
    expect(within(dialog).getByRole("textbox", { name: "Available from" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.bodies("POST", "/resources/r1/overrides")).toHaveLength(1));
    expect(api.bodies("POST", "/resources/r1/overrides")[0]).toMatchObject({
      date: "2026-10-01",
      isAvailable: true,
      startTime: "09:00",
      endTime: "13:00",
      reason: null,
    });
  });

  it("shows the server's error on the times under the times", async () => {
    const api = fakeResourcesApi({ resources: [resource()] });
    api.fail("POST", /\/overrides$/, () =>
      apiError(400, "INVALID_REQUEST", "Check the highlighted fields.", { endTime: "Outside opening hours" }),
    );
    const { user } = renderTimeOff();
    const dialog = await openAddDialog(user);
    await chooseType(user, dialog, 1);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    const until = await within(dialog).findByRole("textbox", {
      name: "Unavailable until",
      description: "Outside opening hours",
    });
    expect(until).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Outside opening hours");
  });

  it("shows other API errors at the top and clears them when cancelled", async () => {
    const api = fakeResourcesApi({ resources: [resource()] });
    api.fail("POST", /\/overrides$/, () => apiError(403, "FORBIDDEN", "Not your calendar."));
    const { user } = renderTimeOff();
    let dialog = await openAddDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Not your calendar.");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    dialog = await openAddDialog(user);
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("closes the dialog on Escape", async () => {
    fakeResourcesApi({ resources: [resource()] });
    const { user } = renderTimeOff();
    await openAddDialog(user);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Add" })).toHaveFocus();
  });
});

describe("Closures", () => {
  it("lists upcoming closures, axe-clean", async () => {
    fakeResourcesApi({
      closures: [
        override({ id: "c2", resourceId: null, date: "2026-12-26", reason: "St Stephen's Day" }),
        override({ id: "c1", resourceId: null, date: "2026-12-25", reason: "Christmas" }),
        override({ id: "c0", resourceId: null, date: "2026-01-01" }),
      ],
    });
    const { container } = renderDashboard(<Closures editable />);
    expect(screen.getByRole("status", { name: "Loading closed days" })).toBeInTheDocument();
    const items = within(await screen.findByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Christmas"),
      expect.stringContaining("St Stephen's Day"),
    ]);
    await expectNoAxeViolations(container);
  });

  it("shows an empty state, an error with retry, and no controls when read-only", async () => {
    const api = fakeResourcesApi({});
    api.fail("GET", /\/closures$/, () => apiError(500, "INTERNAL", "Closures failed."));
    const user = userEvent.setup();
    renderDashboard(<Closures editable={false} />);
    expect(await screen.findByText("Closures failed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add closure/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "No closures planned" })).toBeInTheDocument();
  });

  it("offers a whole day or part of it (no extra hours) for a closure", async () => {
    const api = fakeResourcesApi({});
    const user = userEvent.setup();
    renderDashboard(<Closures editable />);
    await user.click(await screen.findByRole("button", { name: /add closure/i }));
    const dialog = await screen.findByRole("dialog", { name: "Close the business" });
    expect(
      within(dialog)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual(["All day", "Part of the day"]);
    await chooseType(user, dialog, 1);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Closure added"));
    expect(api.bodies("POST", "/closures")).toEqual([
      { date: "2026-10-01", isAvailable: false, startTime: "09:00", endTime: "13:00", reason: null },
    ]);
  });
});
