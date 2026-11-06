import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Service } from "@/lib/api/types";
import { SERVICE_COLORS } from "@/lib/services/service-form";
import { SERVICE_LIMITS } from "@/lib/validation/limits";
import { expectNoAxeViolations } from "@/test/axe";
import { renderDashboard } from "@/components/dashboard/test/render";
import { apiError, resource } from "@/components/dashboard/resources/__tests__/fake-resources-api";
import { ServiceEditor } from "../service-editor/service-editor";
import { fakeServicesApi, service } from "./fake-services-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

afterEach(() => {
  vi.unstubAllGlobals();
  toast.success.mockReset();
  toast.error.mockReset();
});

const sam = resource({ id: "r1", name: "Sam Rivers" });
const jo = resource({ id: "r2", name: "Jo Park" });

function open(existing: Service | null = null) {
  const onOpenChange = vi.fn();
  renderDashboard(
    <ServiceEditor
      service={existing}
      open
      onOpenChange={onOpenChange}
      categories={["Physio", "Classes"]}
      nextSortOrder={3}
    />,
  );
  const sheet = screen.getByRole("dialog", { name: existing ? `Edit ${existing.name}` : "New service" });
  return { sheet, onOpenChange, user: userEvent.setup() };
}

const box = (sheet: HTMLElement, name: string | RegExp) => within(sheet).getByRole("textbox", { name });
const submit = (sheet: HTMLElement, name = "Create service") =>
  userEvent.click(within(sheet).getByRole("button", { name }));

describe("ServiceEditor: creating", () => {
  it("creates a service with what was entered, axe-clean", async () => {
    const api = fakeServicesApi({ resources: [sam, jo] });
    const { sheet, user, onOpenChange } = open();
    expect(within(sheet).getByRole("complementary", { name: "Customer preview" })).toBeInTheDocument();
    await expectNoAxeViolations(document.body);

    await user.type(box(sheet, /^Name/), " Sports massage ");
    await user.type(within(sheet).getByRole("combobox", { name: /^Category/ }), "Physio");
    await user.type(box(sheet, /^Description/), "Deep tissue.");
    await user.click(within(sheet).getByRole("radio", { name: "#6d5bd0" }));
    const duration = box(sheet, /^Duration/);
    await user.clear(duration);
    await user.type(duration, "45");
    await user.click(within(sheet).getByRole("button", { name: "Add requirement" }));
    const requirement = within(sheet).getByRole("group", { name: "Requirement 1" });
    await user.type(within(requirement).getByRole("textbox", { name: "Label" }), "Therapist");
    const doneBy = within(requirement).getByRole("group", { name: "Can be done by" });
    await user.click(within(doneBy).getByRole("button", { name: "Jo Park" }));
    expect(within(doneBy).getByRole("button", { name: "Jo Park" })).toHaveAttribute("aria-pressed", "true");
    await expectNoAxeViolations(document.body);
    await submit(sheet);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Sports massage created");
    expect(api.bodies("POST", "/services")).toEqual([
      {
        name: "Sports massage",
        description: "Deep tissue.",
        category: "Physio",
        color: "#6d5bd0",
        durationMinutes: 45,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        slotIntervalMinutes: null,
        minNoticeMinutes: null,
        maxAdvanceDays: null,
        capacity: 1,
        priceCents: 0,
        paymentMode: "at_venue",
        depositCents: null,
        allowPayAtVenue: false,
        requiresApproval: false,
        locationType: "business",
        allowedGroupIds: [],
        isPublic: true,
        isActive: true,
        sortOrder: 3,
        options: [],
        addons: [],
        requirements: [
          { label: "Therapist", quantity: 1, customerSelectable: false, resourceIds: ["r2"], sortOrder: 0 },
        ],
      },
    ]);
  });

  it("starts with the palette colour for its position and offers the categories in use", () => {
    fakeServicesApi();
    const { sheet } = open();
    const colour = within(sheet).getByRole("radiogroup", { name: "Calendar colour" });
    expect(within(colour).getByRole("radio", { checked: true })).toHaveAccessibleName(SERVICE_COLORS[3]);
    const options = [...document.querySelectorAll("datalist#service-categories option")].map((o) =>
      o.getAttribute("value"),
    );
    expect(options).toEqual(["Physio", "Classes"]);
  });

  it("asks for a name first, focusing it and describing the problem", async () => {
    const api = fakeServicesApi();
    const { sheet, user } = open();
    await submit(sheet);

    const name = box(sheet, /^Name/);
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Give the service a name");
    expect(name).toHaveFocus();
    await expectNoAxeViolations(document.body);

    await user.type(name, "x".repeat(SERVICE_LIMITS.name + 1));
    await submit(sheet);
    expect(name).toHaveAccessibleDescription(`Keep it under ${SERVICE_LIMITS.name} characters`);
    expect(api.bodies("POST", "/services")).toEqual([]);
  });

  it("mirrors the backend's limits on text and minutes", async () => {
    const api = fakeServicesApi();
    const { sheet, user } = open();
    await user.type(box(sheet, /^Name/), "Long one");
    await user.type(
      within(sheet).getByRole("combobox", { name: /^Category/ }),
      "c".repeat(SERVICE_LIMITS.category + 1),
    );
    const duration = box(sheet, /^Duration/);
    await user.clear(duration);
    await user.type(duration, String(SERVICE_LIMITS.durationMinutes.max + 1));
    const buffer = box(sheet, /^Buffer after/);
    await user.clear(buffer);
    await user.type(buffer, "7.5");
    await submit(sheet);

    expect(within(sheet).getByRole("combobox", { name: /^Category/ })).toHaveAccessibleDescription(
      new RegExp(`Keep it under ${SERVICE_LIMITS.category} characters`),
    );
    expect(duration).toHaveAccessibleDescription(`At most ${SERVICE_LIMITS.durationMinutes.max} minutes`);
    expect(buffer).toHaveAccessibleDescription("Whole minutes only");
    expect(api.bodies("POST", "/services")).toEqual([]);
  });

  it("checks requirements: a label, someone to do it, enough of them, one customer choice", async () => {
    const api = fakeServicesApi({ resources: [sam, jo] });
    const { sheet, user } = open();
    await user.type(box(sheet, /^Name/), "Two-person massage");
    expect(within(sheet).getByText(/Without a requirement nobody can be booked/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Add requirement" }));
    await user.click(within(sheet).getByRole("button", { name: "Add requirement" }));
    await submit(sheet);

    const first = within(sheet).getByRole("group", { name: "Requirement 1" });
    expect(within(first).getByRole("textbox", { name: "Label" })).toHaveAccessibleDescription(
      "Name this requirement, e.g. “Therapist”",
    );
    expect(within(first).getByRole("group", { name: "Can be done by" })).toHaveAccessibleDescription(
      "Pick at least one",
    );

    for (const name of ["Requirement 1", "Requirement 2"]) {
      const group = within(sheet).getByRole("group", { name });
      await user.type(within(group).getByRole("textbox", { name: "Label" }), "Therapist");
      await user.click(within(group).getByRole("button", { name: "Sam Rivers" }));
      await user.click(within(group).getByRole("switch", { name: "Let the patient choose" }));
    }
    const quantity = within(first).getByRole("textbox", { name: "How many" });
    await user.clear(quantity);
    await user.type(quantity, "2");
    await submit(sheet);

    expect(quantity).toHaveAccessibleDescription("Needs 2 but only 1 can do it");
    expect(within(first).getByRole("switch", { name: "Let the patient choose" })).toHaveAccessibleDescription(
      /Only one requirement can be chosen by the customer/,
    );
    expect(within(first).getByRole("switch", { name: "Let the patient choose" })).toHaveAccessibleDescription(
      /They pick their therapist when booking\./,
    );
    expect(api.bodies("POST", "/services")).toEqual([]);

    await user.click(within(sheet).getByRole("button", { name: "Remove requirement 2" }));
    expect(within(sheet).queryByRole("group", { name: "Requirement 2" })).not.toBeInTheDocument();
  });

  it("shows the server's field errors under their fields, including nested ones", async () => {
    const api = fakeServicesApi();
    api.fail("POST", /\/services$/, () =>
      apiError(400, "INVALID_REQUEST", "Check the highlighted fields.", {
        name: "A service with this name already exists",
        "options.0.name": "Too similar to another option",
      }),
    );
    const { sheet, user, onOpenChange } = open();
    await user.type(box(sheet, /^Name/), "Follow-up");
    await user.click(within(sheet).getByRole("button", { name: "Add option" }));
    await user.type(box(sheet, "Option 1 name"), "Short");
    await submit(sheet);

    const name = await within(sheet).findByRole("textbox", {
      name: /^Name/,
      description: "A service with this name already exists",
    });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveFocus();
    const option = box(sheet, "Option 1 name");
    expect(option).toHaveAccessibleDescription("Too similar to another option");
    expect(option).toHaveAttribute("aria-invalid", "true");
    expect(onOpenChange).not.toHaveBeenCalled();
    await expectNoAxeViolations(document.body);
  });

  it("puts an error the server names with an array index (options[0].name) under that field", async () => {
    const api = fakeServicesApi();
    api.fail("POST", /\/services$/, () =>
      apiError(400, "INVALID_REQUEST", "Please fix the highlighted fields.", {
        "options[0].name": "Contains invalid characters",
      }),
    );
    const { sheet, user, onOpenChange } = open();
    await user.type(box(sheet, /^Name/), "Follow-up");
    await user.click(within(sheet).getByRole("button", { name: "Add option" }));
    await user.type(box(sheet, "Option 1 name"), "Short");
    await submit(sheet);

    const option = await within(sheet).findByRole("textbox", {
      name: "Option 1 name",
      description: "Contains invalid characters",
    });
    expect(option).toHaveAttribute("aria-invalid", "true");
    expect(option).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("shows other API errors at the end of the form", async () => {
    const api = fakeServicesApi();
    api.fail("POST", /\/services$/, () =>
      apiError(402, "PLAN_LIMIT_REACHED", "Your plan includes 10 services."),
    );
    const { sheet, user } = open();
    await user.type(box(sheet, /^Name/), "Eleventh");
    await submit(sheet);
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Your plan includes 10 services.");
  });

  it("closes on Escape and Cancel, keeping focus inside while open", async () => {
    fakeServicesApi();
    const { sheet, user, onOpenChange } = open();
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    for (let i = 0; i < 40; i++) await user.tab();
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    onOpenChange.mockClear();
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks before closing with unsaved changes", async () => {
    fakeServicesApi();
    const { sheet, user, onOpenChange } = open();
    await user.type(box(sheet, /^Name/), "Sports massage");
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    const ask = await screen.findByRole("alertdialog", { name: "Discard changes?" });
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.click(within(ask).getByRole("button", { name: "Discard" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("ServiceEditor: editing", () => {
  const existing = service({
    id: "s1",
    name: "Follow-up",
    color: "#ABCDEF",
    options: [
      { id: "o2", name: "Long", description: null, durationMinutes: 60, priceCents: 7000, sortOrder: 1 },
      { id: "o1", name: "Short", description: "Quick", durationMinutes: 30, priceCents: 4000, sortOrder: 0 },
    ],
    requirements: [
      {
        id: "q1",
        label: "Therapist",
        quantity: 1,
        customerSelectable: true,
        resourceIds: ["r1"],
        sortOrder: 0,
      },
    ],
  });

  it("saves changes, keeping item ids so bookings stay linked", async () => {
    const api = fakeServicesApi({ services: [existing], resources: [sam] });
    const { sheet, user, onOpenChange } = open(existing);
    expect(box(sheet, /^Name/)).toHaveValue("Follow-up");
    expect(box(sheet, "Option 1 name")).toHaveValue("Short");
    const colour = within(sheet).getByRole("radiogroup", { name: "Calendar colour" });
    expect(within(colour).getAllByRole("radio")[0]).toHaveAccessibleName("#abcdef");
    expect(within(colour).getByRole("radio", { checked: true })).toHaveAccessibleName("#abcdef");

    await user.clear(box(sheet, /^Name/));
    await user.type(box(sheet, /^Name/), "Follow-up visit");
    await user.click(within(sheet).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Follow-up visit saved");
    const [body] = api.bodies("PUT", "/services/s1") as Service[];
    expect(body).toMatchObject({
      name: "Follow-up visit",
      color: "#abcdef",
      options: [
        { id: "o1", name: "Short", description: "Quick", sortOrder: 0 },
        { id: "o2", name: "Long", description: null, sortOrder: 1 },
      ],
      requirements: [{ id: "q1", label: "Therapist", customerSelectable: true, resourceIds: ["r1"] }],
    });
  });

  it("deletes after confirming", async () => {
    const api = fakeServicesApi({ services: [existing] });
    const { sheet, user, onOpenChange } = open(existing);
    await user.click(within(sheet).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Delete Follow-up?" });
    await expectNoAxeViolations(document.body);
    await user.click(within(confirm).getByRole("button", { name: "Delete service" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Follow-up removed");
    expect(api.state.services).toEqual([]);
  });

  it("says why a delete failed and stays open", async () => {
    const api = fakeServicesApi({ services: [existing] });
    api.fail("DELETE", /\/services\/s1$/, () => apiError(403, "FORBIDDEN", "Only admins can delete."));
    const { sheet, user, onOpenChange } = open(existing);
    await user.click(within(sheet).getByRole("button", { name: "Delete" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete service" }),
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Only admins can delete."));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
