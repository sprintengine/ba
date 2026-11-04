/** The review step's services: the service editor, options, add-ons, requirements and who can book. */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SERVICE_LIMITS } from "@/lib/validation/limits";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { fixture, mockOnboardingApi, renderReview, rowToggle, paste } from "./render";

beforeEach(() => {
  window.scrollTo = vi.fn();
  mockOnboardingApi();
});
afterEach(() => vi.unstubAllGlobals());

const section = () => must(document.getElementById("section-services"), "services section");

/** Expands the service row for [name] and returns its editor. */
async function openService(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const toggle = rowToggle(name);
  await user.click(toggle);
  return must(
    document.getElementById(must(toggle.getAttribute("aria-controls"), "editor id")),
    "service editor",
  );
}

describe("Service editor", () => {
  it("is axe-clean with a service open", async () => {
    const user = userEvent.setup();
    const { container } = renderReview();
    await openService(user, /^Full valet/);
    await expectNoAxeViolations(container);
  });

  it("edits the price, deposit and who can book, with limits mirrored from the backend", async () => {
    const user = userEvent.setup();
    renderReview();
    const editor = await openService(user, /^Full valet/);

    const name = within(editor).getByRole("textbox", { name: /^Name/ });
    expect(name).toHaveAttribute("maxLength", String(SERVICE_LIMITS.name));
    expect(within(editor).getByRole("textbox", { name: /category/i })).toHaveAttribute(
      "maxLength",
      String(SERVICE_LIMITS.category),
    );

    const deposit = within(editor).getByRole("textbox", { name: /deposit/i });
    expect(deposit).toHaveAccessibleDescription("Paid online. The rest (€40) is paid at the venue.");
    await user.clear(deposit);
    await user.type(deposit, "70");
    expect(deposit).toHaveAttribute("aria-invalid", "true");
    expect(deposit).toHaveAccessibleDescription(/The deposit can't be more than the price/);
    await user.clear(deposit);
    expect(deposit).toHaveAccessibleDescription(/Enter the deposit amount/);
    await user.type(deposit, "15");
    expect(deposit).not.toHaveAttribute("aria-invalid");

    const members = within(editor).getByRole("checkbox", { name: "Members" });
    expect(members).toBeChecked();
    await user.click(members);
    expect(members).not.toBeChecked();

    await user.clear(name);
    await paste(user, name, "Exterior wash");
    expect(name).toHaveAccessibleDescription("Another service has this name");
  });

  it("switches how customers pay with the keyboard", async () => {
    const user = userEvent.setup();
    renderReview();
    const editor = await openService(user, /^Exterior wash/);
    expect(within(editor).getByRole("textbox", { name: /^Price/ })).toHaveValue("15.00");

    const mode = within(editor).getByRole("combobox", { name: /how customers pay/i });
    expect(mode).toHaveTextContent("Paid online when booking");
    mode.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "Free" }));
    expect(mode).toHaveTextContent("Free");
    expect(mode).toHaveAccessibleDescription("No charge.");
    expect(within(editor).queryByRole("textbox", { name: /^Price/ })).not.toBeInTheDocument();
  });

  it("asks for approval and shows it in the row summary", async () => {
    const user = userEvent.setup();
    renderReview();
    const editor = await openService(user, /^Exterior wash/);
    await user.click(within(editor).getByRole("switch", { name: /approve each booking/i }));
    expect(
      screen.getByRole("button", { name: /^Exterior wash.*Needs approval/, expanded: true }),
    ).toBeInTheDocument();
  });

  it("adds, names and removes options and add-ons; row errors describe their inputs", async () => {
    const user = userEvent.setup();
    renderReview();
    const editor = await openService(user, /^Full valet/);
    expect(within(editor).getByRole("textbox", { name: /^Duration/ })).toHaveAccessibleDescription(
      "Options set their own",
    );

    const [addOption, addAddon] = within(editor).getAllByRole("button", { name: "Add" });
    await user.click(must(addOption, "Add option"));
    const option = within(editor).getByRole("textbox", { name: "Option 3 name" });
    expect(option).toHaveAttribute("aria-invalid", "true");
    expect(option).toHaveAccessibleDescription("Name this option");
    expect(within(editor).getByRole("textbox", { name: "Option 3 price" })).toHaveAccessibleDescription(
      "Name this option",
    );
    await paste(user, option, "Estate");
    expect(option).not.toHaveAttribute("aria-invalid");
    expect(option).not.toHaveAccessibleDescription();

    const duration = within(editor).getByRole("textbox", { name: "Option 3 duration in minutes" });
    await user.clear(duration);
    await user.type(duration, "2");
    expect(duration).toHaveAttribute("aria-invalid", "true");
    expect(duration).toHaveAccessibleDescription("Between 5 and 1440 minutes");
    await user.click(within(editor).getByRole("button", { name: "Remove option Estate" }));
    expect(within(editor).queryByRole("textbox", { name: "Option 3 name" })).not.toBeInTheDocument();

    await user.click(must(addAddon, "Add add-on"));
    const addon = within(editor).getByRole("textbox", { name: "Add-on 2 name" });
    expect(addon).toHaveAccessibleDescription("Name this add-on");
    const extra = within(editor).getByRole("textbox", { name: "Add-on 2 extra minutes" });
    await user.clear(extra);
    await user.type(extra, "500");
    await paste(user, addon, "Interior");
    expect(extra).toHaveAccessibleDescription("Between 0 and 480 minutes");
    await user.click(within(editor).getByRole("button", { name: "Remove add-on Wax" }));
    expect(within(editor).getByRole("textbox", { name: "Add-on 1 name" })).toHaveValue("Interior");
  });

  it("chooses the resources a booking reserves", async () => {
    const user = userEvent.setup();
    renderReview();
    const editor = await openService(user, /^Exterior wash/);
    const pool = within(editor).getByRole("group", { name: "Bay: choose from" });
    const bay1 = within(pool).getByRole("button", { name: "Bay 1" });
    const bay2 = within(pool).getByRole("button", { name: "Bay 2" });
    expect(bay1).toHaveAttribute("aria-pressed", "true");
    expect(within(pool).getByRole("button", { name: "Alex Morgan" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // Two in the pool: how many a booking needs at once.
    const needs = within(editor).getByRole("textbox", { name: /needs/i });
    await user.clear(needs);
    await user.type(needs, "3");
    expect(needs).toHaveAccessibleDescription("Needs at least 3 in the pool");
    await user.clear(needs);
    await user.type(needs, "1");

    await user.click(bay1);
    await user.click(bay2);
    expect(bay2).toHaveAttribute("aria-pressed", "false");
    expect(pool).toHaveAccessibleDescription("Choose at least one bay");
    expect(within(editor).getByRole("textbox", { name: "Requirement 1 label" })).toHaveAccessibleDescription(
      "Choose at least one bay",
    );

    await user.click(within(editor).getByRole("switch", { name: "Customer chooses" }));
    expect(within(editor).getByText("Shown as a choice when booking")).toBeInTheDocument();

    await user.click(within(editor).getByRole("button", { name: "Remove requirement Bay" }));
    expect(within(editor).getByText("Not linked to any bays yet.")).toBeInTheDocument();
    await user.click(must(within(editor).getAllByRole("button", { name: "Add" })[2], "Add requirement"));
    expect(within(editor).getByRole("textbox", { name: "Requirement 1 label" })).toHaveValue("Bay");
  });

  it("lets customers choose from one requirement at most", async () => {
    const user = userEvent.setup();
    renderReview();
    const editor = await openService(user, /^Full valet/);
    const [bay, valeter] = within(editor).getAllByRole("switch", { name: "Customer chooses" });
    expect(valeter).toBeChecked();
    await user.click(must(bay, "Bay's Customer chooses"));
    expect(bay).toBeChecked();
    expect(valeter).not.toBeChecked();
    expect(within(editor).getAllByText("Shown as a choice when booking")).toHaveLength(1);
  });

  it("opens More settings by itself when one of them has a problem", async () => {
    const user = userEvent.setup();
    const setup = fixture();
    renderReview({
      ...setup,
      services: setup.services.map((s, i) => (i === 0 ? { ...s, bufferAfterMinutes: 600 } : s)),
    });
    const editor = await openService(user, /^Exterior wash/);
    const more = within(editor).getByRole("button", { name: /more settings/i });
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(within(editor).getByRole("textbox", { name: "Buffer after" })).toHaveAccessibleDescription(
      "Must be between 0 and 480",
    );

    const size = within(editor).getByRole("textbox", { name: /group size/i });
    await user.clear(size);
    await user.type(size, "0");
    expect(size).toHaveAccessibleDescription(/Capacity must be between 1 and 1000/);
    await paste(user, within(editor).getByRole("textbox", { name: /description/i }), "Outside only");

    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(within(editor).queryByRole("textbox", { name: /group size/i })).not.toBeInTheDocument();
  });

  it("checks duration, price, buffers and the start interval against the backend's ranges", async () => {
    const user = userEvent.setup();
    renderReview();
    const editor = await openService(user, /^Exterior wash/);
    const field = (name: RegExp) => within(editor).getByRole("textbox", { name });

    await user.clear(field(/^Duration/));
    await user.type(field(/^Duration/), "2");
    expect(field(/^Duration/)).toHaveAccessibleDescription("Duration must be between 5 minutes and 24 hours");
    await user.type(field(/^Duration/), "5");
    expect(field(/^Duration/)).not.toHaveAttribute("aria-invalid");

    await user.clear(field(/^Price/));
    await user.type(field(/^Price/), "20");
    expect(screen.getByRole("button", { name: /^Exterior wash.*€20/, expanded: true })).toBeInTheDocument();

    await user.click(within(editor).getByRole("button", { name: /more settings/i }));
    await user.clear(field(/^Buffer before/));
    await user.type(field(/^Buffer before/), "500");
    expect(field(/^Buffer before/)).toHaveAccessibleDescription("Must be between 0 and 480");
    await user.clear(field(/^Buffer before/));
    await user.type(field(/^Buffer before/), "5");
    await user.clear(field(/^Buffer after/));
    await user.type(field(/^Buffer after/), "10");
    await user.type(field(/^Start every/), "3");
    expect(field(/^Start every/)).toHaveAccessibleDescription(/Must be between 5 and 1440/);
    await user.clear(field(/^Start every/));
    expect(field(/^Start every/)).toHaveAccessibleDescription("Blank = auto");
  });

  it("adds a service opened for editing and removes it", async () => {
    const user = userEvent.setup();
    renderReview();
    expect(within(section()).getByText("2 services customers can book.")).toBeInTheDocument();
    await user.click(within(section()).getByRole("button", { name: "Add service" }));
    const row = screen.getByRole("button", { name: /^New service/, expanded: true });
    expect(within(section()).getByText("3 services customers can book.")).toBeInTheDocument();

    const editor = must(document.getElementById(must(row.getAttribute("aria-controls"), "id")), "editor");
    await user.click(within(editor).getByRole("button", { name: "Remove service" }));
    expect(screen.queryByRole("button", { name: /^New service/ })).not.toBeInTheDocument();
  });

  it("explains empty services and services without resources", async () => {
    const user = userEvent.setup();
    const setup = fixture();
    const first = must(setup.services[0], "first service");
    const { unmount } = renderReview({ ...setup, services: [] });
    expect(within(section()).getByText(/add at least one service/i)).toBeInTheDocument();
    unmount();

    renderReview({ ...setup, resources: [], services: [{ ...first, requirements: [] }] });
    const editor = await openService(user, /^Exterior wash/);
    expect(
      within(editor).getByText("Add bays first, then choose which ones this service uses."),
    ).toBeInTheDocument();
  });
});
