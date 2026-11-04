/** The review step's resources section and its weekly hours editor (keyboard first). */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESOURCE_LIMITS } from "@/lib/validation/limits";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { fixture, mockOnboardingApi, renderReview, rowToggle, paste } from "./render";

beforeEach(() => {
  window.scrollTo = vi.fn();
  mockOnboardingApi();
});
afterEach(() => vi.unstubAllGlobals());

const section = () => must(document.getElementById("section-resources"), "resources section");

/** Expands the row for [name] and returns its editor. */
async function openRow(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const toggle = rowToggle(name);
  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  return must(document.getElementById(must(toggle.getAttribute("aria-controls"), "editor id")), "row editor");
}

describe("Review step: resources", () => {
  it("is axe-clean with a resource open", async () => {
    const user = userEvent.setup();
    const { container } = renderReview();
    await openRow(user, /^Bay 2/);
    await expectNoAxeViolations(container);
  });

  it("summarises each resource and edits its name, capacity and kind", async () => {
    const user = userEvent.setup();
    renderReview();
    // The fixture's valeter is a person, so they aren't counted as a bay.
    expect(
      within(section()).getByText("2 bays and 1 person with their own weekly hours."),
    ).toBeInTheDocument();

    const editor = await openRow(user, /^Bay 2/);
    const name = within(editor).getByRole("textbox", { name: /^Name/ });
    expect(name).toHaveAttribute("maxLength", String(RESOURCE_LIMITS.name));

    await user.clear(name);
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Give this bay a name");
    expect(within(section()).getByText("1 to fix")).toBeInTheDocument();
    await paste(user, name, "Wash bay");

    const capacity = within(editor).getByRole("textbox", { name: /capacity/i });
    await user.clear(capacity);
    await user.type(capacity, "0");
    expect(capacity).toHaveAccessibleDescription(/Capacity must be between 1 and 1000/);
    await user.clear(capacity);
    await user.type(capacity, "2");
    expect(capacity).not.toHaveAttribute("aria-invalid");

    const person = within(within(editor).getByRole("radiogroup", { name: "Kind" })).getByRole("radio", {
      name: /person/i,
    });
    await user.click(person);
    expect(person).toHaveAttribute("aria-checked", "true");
    expect(
      within(section()).getByText("1 bay and 2 people with their own weekly hours."),
    ).toBeInTheDocument();

    // Collapsing shows the edits in the row summary.
    await user.click(screen.getByRole("button", { name: /^Wash bay/, expanded: true }));
    expect(screen.getByRole("button", { name: /^Wash bay.*×2/, expanded: false })).toBeInTheDocument();
  });

  it("adds a resource opened for editing and removes it", async () => {
    const user = userEvent.setup();
    renderReview();
    await user.click(within(section()).getByRole("button", { name: "Add bay" }));

    expect(screen.getByRole("button", { name: /^Bay 4/, expanded: true })).toBeInTheDocument();
    expect(
      within(section()).getByText("2 bays and 2 people with their own weekly hours."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Bay 4" }));
    expect(screen.queryByRole("button", { name: /^Bay 4/ })).not.toBeInTheDocument();
    expect(
      within(section()).getByText("2 bays and 1 person with their own weekly hours."),
    ).toBeInTheDocument();
  });

  it("explains what to add when there are none", () => {
    renderReview({ ...fixture(), resources: [], services: [] });
    expect(within(section()).getByText(/add the people, rooms or equipment/i)).toBeInTheDocument();
    expect(
      within(section()).getByText("Who or what customers book: people, rooms or equipment."),
    ).toBeInTheDocument();
  });
});

describe("Weekly hours editor", () => {
  it("opens a closed day from the keyboard and flags a closing time before the opening time", async () => {
    const user = userEvent.setup();
    renderReview();
    const editor = await openRow(user, /^Bay 2/);

    const sunday = within(editor).getByRole("switch", { name: "Sunday" });
    expect(sunday).not.toBeChecked();
    expect(within(editor).queryByRole("textbox", { name: "Sunday opens" })).not.toBeInTheDocument();
    sunday.focus();
    await user.keyboard(" ");
    expect(sunday).toBeChecked();

    const opens = within(editor).getByRole("textbox", { name: "Sunday opens" });
    const closes = within(editor).getByRole("textbox", { name: "Sunday closes" });
    await user.clear(closes);
    await user.type(closes, "7am{Enter}");
    expect(closes).toHaveValue("07:00");
    expect(closes).toHaveAttribute("aria-invalid", "true");
    expect(closes).toHaveAccessibleDescription("Closing time must be after opening time");
    expect(opens).toHaveAccessibleDescription("Closing time must be after opening time");

    // ↑ steps the time by 15 minutes until it's valid again.
    await user.clear(closes);
    await user.type(closes, "2pm");
    await user.tab();
    expect(closes).toHaveValue("14:00");
    closes.focus();
    await user.keyboard("{ArrowUp}");
    expect(closes).toHaveValue("14:15");
    expect(closes).not.toHaveAttribute("aria-invalid");

    // Space closes it again.
    sunday.focus();
    await user.keyboard(" ");
    expect(sunday).not.toBeChecked();
    expect(within(editor).queryByRole("textbox", { name: "Sunday opens" })).not.toBeInTheDocument();
  });

  it("adds and removes a second time on a day", async () => {
    const user = userEvent.setup();
    renderReview();
    const editor = await openRow(user, /^Alex Morgan/);

    await user.click(within(editor).getByRole("button", { name: "Add another time on Monday" }));
    expect(within(editor).getAllByRole("textbox", { name: "Monday opens" })).toHaveLength(2);
    const removes = within(editor).getAllByRole("button", { name: /^Remove .* on Monday$/ });
    expect(removes).toHaveLength(2);
    await user.click(must(removes[1], "second window's remove"));
    expect(within(editor).getAllByRole("textbox", { name: "Monday opens" })).toHaveLength(1);
    expect(within(editor).queryByRole("button", { name: /^Remove .* on Monday$/ })).not.toBeInTheDocument();
  });

  it("copies Monday to the weekdays and one resource's hours to all", async () => {
    const user = userEvent.setup();
    renderReview();
    const editor = await openRow(user, /^Alex Morgan/);
    expect(within(editor).getByRole("switch", { name: "Friday" })).not.toBeChecked();

    await user.click(within(editor).getByRole("button", { name: "Copy Monday to weekdays" }));
    expect(within(editor).getByRole("switch", { name: "Friday" })).toBeChecked();
    expect(within(editor).getByRole("textbox", { name: "Friday opens" })).toHaveValue("09:00");

    await user.click(within(editor).getByRole("button", { name: "Use for all bays" }));
    expect(screen.getByRole("button", { name: /^Bay 1.*Mon–Fri 09:00–17:00/ })).toBeInTheDocument();

    // Without Monday hours there is nothing to copy.
    await user.click(within(editor).getByRole("switch", { name: "Monday" }));
    expect(within(editor).getByRole("button", { name: "Copy Monday to weekdays" })).toBeDisabled();
  });

  it("labels times reserved for a customer group", async () => {
    const user = userEvent.setup();
    renderReview();
    const editor = await openRow(user, /^Bay 1/);
    expect(within(editor).getByText("Members only")).toBeInTheDocument();
  });
});
