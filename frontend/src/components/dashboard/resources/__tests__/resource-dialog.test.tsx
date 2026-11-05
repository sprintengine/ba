import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Resource } from "@/lib/api/types";
import { SERVICE_COLORS } from "@/lib/services/service-form";
import { RESOURCE_LIMITS } from "@/lib/validation/limits";
import { expectNoAxeViolations } from "@/test/axe";
import { renderDashboard } from "@/components/dashboard/test/render";
import { ResourceDialog } from "../resource-dialog";
import { apiError, fakeResourcesApi, member, resource } from "./fake-resources-api";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

afterEach(() => {
  vi.unstubAllGlobals();
  toast.success.mockReset();
  toast.error.mockReset();
});

const team = [
  member(),
  member({ id: "m2", userId: "u2", name: "Casey Lane", email: "casey@example.test", role: "staff" }),
  member({ id: "m3", userId: null, name: null, email: "new@example.test", role: "staff", status: "invited" }),
];
const sam = resource({ id: "r1", name: "Sam Rivers", memberId: "m2", sortOrder: 3 });

function open(existing: Resource | null = null) {
  const onOpenChange = vi.fn();
  const onSaved = vi.fn();
  const view = renderDashboard(
    <ResourceDialog
      resource={existing}
      open
      onOpenChange={onOpenChange}
      team={team}
      nextSortOrder={2}
      onSaved={onSaved}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: existing ? `Edit ${existing.name}` : "Add a therapist" });
  return { ...view, dialog, onOpenChange, onSaved, user: userEvent.setup() };
}

const nameBox = (dialog: HTMLElement) => within(dialog).getByRole("textbox", { name: /^name/i });

describe("ResourceDialog: adding", () => {
  it("adds a person linked to a team member, with the next palette colour", async () => {
    const api = fakeResourcesApi({ team });
    const { dialog, user, onOpenChange, onSaved } = open();
    expect(dialog).toHaveAccessibleDescription("A person, room or piece of equipment that services need.");
    expect(within(dialog).queryByRole("switch", { name: /active/i })).not.toBeInTheDocument();
    await expectNoAxeViolations(document.body);

    await user.type(nameBox(dialog), "  Jo Park ");
    await user.type(within(dialog).getByRole("textbox", { name: /description/i }), "Sports injuries");
    const memberSelect = within(dialog).getByRole("combobox", { name: /team member/i });
    expect(memberSelect).toHaveTextContent("Not linked");
    await user.click(memberSelect);
    expect(await screen.findByRole("option", { name: "new@example.test (invited)" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Casey Lane" }));
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.bodies("POST", "/resources")).toEqual([
      {
        name: "Jo Park",
        kind: "person",
        description: "Sports injuries",
        color: SERVICE_COLORS[2],
        capacity: 1,
        memberId: "m2",
        isActive: true,
        sortOrder: 2,
      },
    ]);
    expect(toast.success).toHaveBeenCalledWith("Jo Park added");
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "r-new-1", name: "Jo Park" }));
  });

  it("picks the type with the arrow keys; rooms ask for a capacity instead of a team member", async () => {
    const api = fakeResourcesApi({ team });
    const { dialog, user } = open();
    const type = within(dialog).getByRole("radiogroup", { name: "Type" });
    const person = within(type).getByRole("radio", { name: "Person" });
    expect(person).toBeChecked();

    person.focus();
    // Held, as a real key press is: Radix checks the radio that an arrow key moves focus to while the key is down.
    await user.keyboard("{ArrowRight>}");
    const room = within(type).getByRole("radio", { name: "Room / space" });
    expect(room).toHaveFocus();
    expect(room).toBeChecked();
    await user.keyboard("{/ArrowRight}");
    expect(nameBox(dialog)).toHaveAttribute("placeholder", "e.g. Room 1");
    expect(within(dialog).queryByRole("combobox", { name: /team member/i })).not.toBeInTheDocument();

    await user.type(nameBox(dialog), "Room 1");
    const capacity = within(dialog).getByRole("textbox", { name: /capacity/i });
    await user.clear(capacity);
    await user.type(capacity, "6");
    await user.click(within(dialog).getByRole("radio", { name: "#c2417a" }));
    expect(within(dialog).getByRole("radio", { name: "#c2417a" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(api.bodies("POST", "/resources")).toHaveLength(1));
    expect(api.bodies("POST", "/resources")[0]).toMatchObject({
      kind: "space",
      capacity: 6,
      color: "#c2417a",
      memberId: null,
      description: null,
    });
  });

  it("checks the name before sending: required, then the backend's length limit", async () => {
    const api = fakeResourcesApi({ team });
    const { dialog, user } = open();
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    const name = nameBox(dialog);
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Enter a name");
    expect(name).toHaveFocus();
    await expectNoAxeViolations(document.body);

    await user.type(name, "x".repeat(RESOURCE_LIMITS.name + 1));
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(
      await within(dialog).findByText(`Keep it under ${RESOURCE_LIMITS.name} characters`),
    ).toBeInTheDocument();
    expect(api.bodies("POST", "/resources")).toEqual([]);
  });

  it("checks the capacity of a room against the backend's limits", async () => {
    const api = fakeResourcesApi({ team });
    const { dialog, user } = open();
    await user.click(within(dialog).getByRole("radio", { name: "Equipment" }));
    await user.type(nameBox(dialog), "Ultrasound");
    const capacity = within(dialog).getByRole("textbox", { name: /capacity/i });

    await user.clear(capacity);
    await user.type(capacity, "1.5");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(capacity).toHaveAccessibleDescription(/Whole numbers only/);

    await user.clear(capacity);
    await user.type(capacity, String(RESOURCE_LIMITS.capacity.max + 1));
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(capacity).toHaveAccessibleDescription(new RegExp(`At most ${RESOURCE_LIMITS.capacity.max}$`));
    expect(capacity).toHaveAttribute("aria-invalid", "true");
    expect(api.bodies("POST", "/resources")).toEqual([]);
  });

  it("shows the server's field error under the field and keeps the dialog open", async () => {
    const api = fakeResourcesApi({ team });
    api.fail("POST", /\/resources$/, () =>
      apiError(400, "INVALID_REQUEST", "Check the highlighted fields.", {
        name: "A therapist with this name already exists",
      }),
    );
    const { dialog, user, onOpenChange } = open();
    await user.type(nameBox(dialog), "Sam Rivers");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    const name = await within(dialog).findByRole("textbox", {
      name: /^name/i,
      description: "A therapist with this name already exists",
    });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveFocus();
    expect(within(dialog).getAllByRole("alert")).toHaveLength(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows other API errors at the top of the form", async () => {
    const api = fakeResourcesApi({ team });
    api.fail("POST", /\/resources$/, () =>
      apiError(402, "PLAN_LIMIT_REACHED", "Your plan includes 3 therapists."),
    );
    const { dialog, user } = open();
    await user.type(nameBox(dialog), "Jo Park");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Your plan includes 3 therapists.");
  });

  it("closes on Escape and on Cancel, keeping focus inside while open", async () => {
    fakeResourcesApi({ team });
    const { dialog, user, onOpenChange } = open();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    for (let i = 0; i < 20; i++) await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    onOpenChange.mockClear();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks before throwing away changes, on Escape or Cancel", async () => {
    fakeResourcesApi({ team });
    const { dialog, user, onOpenChange } = open(sam);
    await user.type(nameBox(dialog), " Jr");

    await user.keyboard("{Escape}");
    const ask = await screen.findByRole("alertdialog", { name: "Discard changes?" });
    expect(onOpenChange).not.toHaveBeenCalled();
    await expectNoAxeViolations(document.body);
    await user.click(within(ask).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(nameBox(dialog)).toHaveValue("Sam Rivers Jr");
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.click(
      within(await screen.findByRole("alertdialog", { name: "Discard changes?" })).getByRole("button", {
        name: "Discard",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("ResourceDialog: editing", () => {
  it("saves changes to an existing resource, including deactivating it", async () => {
    const api = fakeResourcesApi({ team, resources: [sam] });
    const { dialog, user, onOpenChange } = open(sam);
    expect(nameBox(dialog)).toHaveValue("Sam Rivers");
    expect(within(dialog).getByRole("combobox", { name: /team member/i })).toHaveTextContent("Casey Lane");
    const active = within(dialog).getByRole("switch", { name: /active/i });
    expect(active).toBeChecked();
    await expectNoAxeViolations(document.body);

    active.focus();
    await user.keyboard(" ");
    expect(active).not.toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.bodies("PATCH", "/resources/r1")).toEqual([
      expect.objectContaining({ name: "Sam Rivers", memberId: "m2", isActive: false, sortOrder: 3 }),
    ]);
    expect(toast.success).toHaveBeenCalledWith("Saved");
  });

  it("offers a resource's own colour first when it isn't in the palette", async () => {
    fakeResourcesApi({ team });
    const { dialog } = open(resource({ ...sam, color: "#123456" }));
    const swatches = within(within(dialog).getByRole("radiogroup", { name: "Colour" })).getAllByRole("radio");
    expect(swatches[0]).toHaveAccessibleName("#123456");
    expect(swatches[0]).toHaveAttribute("aria-checked", "true");
    expect(swatches).toHaveLength(SERVICE_COLORS.length + 1);
  });

  it("deletes after confirming", async () => {
    const api = fakeResourcesApi({ team, resources: [sam] });
    const { dialog, user, onOpenChange } = open(sam);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Delete Sam Rivers?" });
    expect(confirm).toHaveAccessibleDescription(/any appointments it.s deactivated instead/);
    await expectNoAxeViolations(document.body);
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.requests.some((r) => r.method === "DELETE" && r.path.endsWith("/resources/r1"))).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Sam Rivers removed");
  });

  it("keeps the dialog open and says why when the delete fails", async () => {
    const api = fakeResourcesApi({ team, resources: [sam] });
    api.fail("DELETE", /\/resources\/r1$/, () => apiError(409, "CONFLICT", "It has upcoming bookings."));
    const { dialog, user, onOpenChange } = open(sam);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("It has upcoming bookings."));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("cancels the delete with Escape, leaving the edit dialog open", async () => {
    fakeResourcesApi({ team, resources: [sam] });
    const { dialog, user, onOpenChange } = open(sam);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toHaveFocus();
  });
});
