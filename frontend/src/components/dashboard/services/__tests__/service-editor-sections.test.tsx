/** The service editor's sections and live preview: what each control changes in the saved service. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Business, Service } from "@/lib/api/types";
import { BusinessContextProvider } from "@/lib/business/business-context";
import { VocabularyProvider } from "@/lib/vocabulary";
import { SERVICE_LIMITS } from "@/lib/validation/limits";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { TooltipProvider } from "@/components/ui/tooltip";
import { business, me } from "@/components/dashboard/test/render";
import { group, resource } from "@/components/dashboard/resources/__tests__/fake-resources-api";
import { ServiceEditor } from "../service-editor/service-editor";
import { fakeServicesApi, question, service } from "./fake-services-api";

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

/** Like `renderDashboard`, with a patched business (e.g. payments not connected). */
function open(existing: Service | null = null, patch: Partial<Business> = {}) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <BusinessContextProvider value={{ business: { ...business, ...patch }, role: "owner", me }}>
        <VocabularyProvider vocabulary={business.vocabulary}>
          <TooltipProvider>
            <ServiceEditor
              service={existing}
              open
              onOpenChange={onOpenChange}
              categories={[]}
              nextSortOrder={0}
            />
          </TooltipProvider>
        </VocabularyProvider>
      </BusinessContextProvider>
    </QueryClientProvider>,
  );
  const sheet = screen.getByRole("dialog");
  const preview = within(sheet).getByRole("complementary", { name: "Customer preview" });
  return { sheet, preview, onOpenChange, user: userEvent.setup() };
}

const save = (sheet: HTMLElement) =>
  userEvent.click(within(sheet).getByRole("button", { name: /create service|save changes/i }));
const box = (sheet: HTMLElement, name: string | RegExp) => within(sheet).getByRole("textbox", { name });
const posted = (api: ReturnType<typeof fakeServicesApi>) => api.bodies("POST", "/services")[0] as Service;

describe("Timing", () => {
  it("sets buffers, the start interval, notice and booking window", async () => {
    const api = fakeServicesApi();
    const { sheet, user } = open();
    await user.type(box(sheet, /^Name/), "Wash");
    for (const [name, value] of [
      [/^Buffer before/, "5"],
      [/^Buffer after/, "10"],
      [/^Book up to/, "30"],
    ] as const) {
      const input = box(sheet, name);
      await user.clear(input);
      await user.type(input, value);
    }
    await user.click(within(sheet).getByRole("combobox", { name: /^Start times every/ }));
    await user.click(await screen.findByRole("option", { name: "15 min" }));
    const notice = within(sheet).getByRole("combobox", { name: /^Minimum notice/ });
    expect(notice).toHaveTextContent("Business default");
    notice.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("option", { name: "1 day" }));
    await save(sheet);

    await waitFor(() => expect(api.bodies("POST", "/services")).toHaveLength(1));
    expect(posted(api)).toMatchObject({
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
      slotIntervalMinutes: 15,
      minNoticeMinutes: 1440,
      maxAdvanceDays: 30,
    });
  });

  it("turns a service into a group session with seats, shown in the preview", async () => {
    const api = fakeServicesApi();
    const { sheet, preview, user } = open();
    await user.type(box(sheet, /^Name/), "Spin class");
    expect(within(sheet).queryByRole("textbox", { name: /seats per session/i })).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole("switch", { name: "Group session" }));
    const seats = box(sheet, /seats per session/i);
    expect(seats).toHaveValue("8");
    expect(within(preview).getByText("8 seats")).toBeInTheDocument();
    // Emptying the field, then typing a number starting with 1, keeps the group session (and this field) on.
    await user.clear(seats);
    expect(seats).toBeInTheDocument();
    expect(within(sheet).getByRole("switch", { name: "Group session" })).toBeChecked();
    await user.type(seats, String(SERVICE_LIMITS.capacity.max + 1));
    await save(sheet);
    expect(seats).toHaveAccessibleDescription(`At most ${SERVICE_LIMITS.capacity.max}`);

    await user.clear(seats);
    await user.type(seats, "12");
    await save(sheet);
    await waitFor(() => expect(api.bodies("POST", "/services")).toHaveLength(1));
    expect(posted(api)).toMatchObject({ capacity: 12 });
  });

  it("uses the business default again when the start interval is set back", async () => {
    fakeServicesApi();
    const { sheet, user } = open(service({ slotIntervalMinutes: 30, minNoticeMinutes: 60 }));
    const interval = within(sheet).getByRole("combobox", { name: /^Start times every/ });
    expect(interval).toHaveTextContent("30 min");
    await user.click(interval);
    await user.click(await screen.findByRole("option", { name: "Same as duration" }));
    expect(interval).toHaveTextContent("Same as duration");
    await user.click(within(sheet).getByRole("combobox", { name: /^Minimum notice/ }));
    await user.click(await screen.findByRole("option", { name: "Business default" }));
    expect(within(sheet).getByRole("combobox", { name: /^Minimum notice/ })).toHaveTextContent(
      "Business default",
    );
  });
});

describe("Price and payment", () => {
  it("asks for a price before taking payment online", async () => {
    const api = fakeServicesApi();
    const { sheet, user } = open();
    await user.type(box(sheet, /^Name/), "Consult");
    await user.click(within(sheet).getByRole("radio", { name: /^Pay in full online/ }));
    await save(sheet);
    expect(box(sheet, /^Price/)).toHaveAccessibleDescription(
      /Set a price to take payment online, or choose “Free” or “Pay at venue”/,
    );
    expect(api.bodies("POST", "/services")).toEqual([]);
  });

  it("takes a deposit no larger than the price, and previews it", async () => {
    const api = fakeServicesApi();
    const { sheet, preview, user } = open();
    await user.type(box(sheet, /^Name/), "Colour");
    const modes = within(sheet).getByRole("radiogroup", { name: "How people pay" });
    within(modes).getByRole("radio", { checked: true }).focus();
    // Pay at venue → (left) Deposit online; held, as Radix checks the radio focused while an arrow key is down.
    await user.keyboard("{ArrowLeft>}{/ArrowLeft}");
    expect(within(modes).getByRole("radio", { name: /^Deposit online/ })).toBeChecked();

    await user.clear(box(sheet, /^Price/));
    await user.type(box(sheet, /^Price/), "80");
    await save(sheet);
    const deposit = box(sheet, /^Deposit/);
    expect(deposit).toHaveAccessibleDescription("Enter the deposit amount");

    await user.type(deposit, "100");
    await save(sheet);
    expect(deposit).toHaveAccessibleDescription("The deposit can't be more than the price");

    await user.clear(deposit);
    await user.type(deposit, "20");
    expect(within(preview).getByText("€20 deposit")).toBeInTheDocument();
    expect(within(preview).getByText("€80")).toBeInTheDocument();
    await save(sheet);
    await waitFor(() => expect(api.bodies("POST", "/services")).toHaveLength(1));
    expect(posted(api)).toMatchObject({ paymentMode: "deposit", priceCents: 8000, depositCents: 2000 });
  });

  it("says options have their own prices only once there are options", async () => {
    fakeServicesApi();
    const { sheet, user } = open(service());
    expect(within(sheet).queryByText("Each option has its own price.")).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Add option" }));
    expect(within(sheet).getByText("Each option has its own price.")).toBeInTheDocument();
  });

  it("hides the price for free services and sends zero", async () => {
    const api = fakeServicesApi();
    const { sheet, preview, user } = open(service({ paymentMode: "at_venue", priceCents: 3000 }));
    expect(within(preview).getByText("Pay at venue")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("radio", { name: /^Free/ }));
    expect(within(sheet).queryByRole("textbox", { name: /^Price/ })).not.toBeInTheDocument();
    expect(within(preview).getByText("Free")).toBeInTheDocument();
    await save(sheet);
    await waitFor(() => expect(api.bodies("PUT", "/services/s1")).toHaveLength(1));
    expect(api.bodies("PUT", "/services/s1")[0]).toMatchObject({ paymentMode: "free", priceCents: 0 });
  });

  it("warns, with a link, when online payment isn't connected", async () => {
    fakeServicesApi();
    const { sheet } = open(service({ paymentMode: "full" }), { paymentsEnabled: false });
    expect(within(sheet).getByText(/Online payments aren.t connected yet/)).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "Connect payments" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/settings/payments",
    );
  });
});

describe("Booking rules", () => {
  it("sets approval, visibility, location and the groups that can book", async () => {
    const api = fakeServicesApi({
      groups: [
        group({ id: "g1", name: "Members" }),
        group({ id: "g2", name: "Staff family", restricted: true }),
        group({ id: "g3", name: "Old", isActive: false }),
      ],
    });
    const { sheet, preview, user } = open();
    await user.type(box(sheet, /^Name/), "Clinic");
    await user.click(within(sheet).getByRole("switch", { name: "Approve each request" }));
    expect(within(preview).getByText("Request to book")).toBeInTheDocument();
    expect(within(preview).getByText("Request")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("switch", { name: "Show on your booking page" }));
    expect(within(preview).getByText("Private: only your team can book this.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("switch", { name: /^Active/ }));
    expect(within(preview).getByText(/Inactive: hidden/)).toBeInTheDocument();

    await user.click(within(sheet).getByRole("combobox", { name: "Where it happens" }));
    expect(await screen.findByRole("option", { name: "At the patient's address" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Online" }));
    expect(within(preview).getByText("Online")).toBeInTheDocument();

    const who = await within(sheet).findByRole("group", { name: "Who can book" });
    expect(who).toHaveAccessibleDescription(/^Everyone/);
    expect(within(who).getAllByRole("checkbox")).toHaveLength(2);
    await user.click(within(who).getByRole("checkbox", { name: /Staff family/ }));
    expect(who).toHaveAccessibleDescription("Only these groups.");
    await expectNoAxeViolations(document.body);
    await save(sheet);

    await waitFor(() => expect(api.bodies("POST", "/services")).toHaveLength(1));
    expect(posted(api)).toMatchObject({
      requiresApproval: true,
      isPublic: false,
      isActive: false,
      locationType: "online",
      allowedGroupIds: ["g2"],
    });
  });

  it("lists an inactive group the service still allows, marked, so it can be unticked", async () => {
    const api = fakeServicesApi({
      groups: [group({ id: "g1", name: "Members" }), group({ id: "g3", name: "Old", isActive: false })],
    });
    const { sheet, user } = open(service({ allowedGroupIds: ["g3"] }));
    const who = await within(sheet).findByRole("group", { name: "Who can book" });
    const old = within(who).getByRole("checkbox", { name: /^Old/ });
    expect(old).toBeChecked();
    expect(old.closest("label")).toHaveTextContent("Inactive");
    await user.click(old);
    // Still listed until saved, so it can be ticked again.
    expect(within(who).getByRole("checkbox", { name: /^Old/ })).not.toBeChecked();
    await save(sheet);
    await waitFor(() => expect(api.bodies("PUT", "/services/s1")).toHaveLength(1));
    expect(api.bodies("PUT", "/services/s1")[0]).toMatchObject({ allowedGroupIds: [] });
  });

  it("shows who can book when only inactive groups exist but one is allowed", async () => {
    fakeServicesApi({ groups: [group({ id: "g3", name: "Old", isActive: false })] });
    const { sheet } = open(service({ allowedGroupIds: ["g3"] }));
    const who = await within(sheet).findByRole("group", { name: "Who can book" });
    expect(within(who).getByRole("checkbox", { name: /^Old/ })).toBeChecked();
  });

  it("unticks a group", async () => {
    const api = fakeServicesApi({ groups: [group({ id: "g1", name: "Members" })] });
    const { sheet, user } = open(service({ allowedGroupIds: ["g1"] }));
    const who = await within(sheet).findByRole("group", { name: "Who can book" });
    await user.click(within(who).getByRole("checkbox", { name: "Members" }));
    await save(sheet);
    await waitFor(() => expect(api.bodies("PUT", "/services/s1")).toHaveLength(1));
    expect(api.bodies("PUT", "/services/s1")[0]).toMatchObject({ allowedGroupIds: [] });
  });
});

describe("Options and add-ons", () => {
  it("adds options that start from the service's duration and price, each named and checked", async () => {
    const api = fakeServicesApi();
    const { sheet, preview, user } = open(service({ durationMinutes: 45, priceCents: 5000 }));
    expect(within(sheet).getByText("No options — everyone books the same thing.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Add option" }));
    await user.click(within(sheet).getByRole("button", { name: "Add option" }));
    expect(box(sheet, "Option 1 duration")).toHaveValue("45");
    expect(box(sheet, "Option 2 price")).toHaveValue("50.00");
    expect(within(preview).getByText("Option 1")).toBeInTheDocument();

    await user.type(box(sheet, "Option 1 name"), "Short");
    await user.type(box(sheet, "Option 2 name"), "short");
    await save(sheet);
    expect(box(sheet, "Option 2 name")).toHaveAccessibleDescription("Option names must be unique");

    await user.clear(box(sheet, "Option 2 name"));
    await save(sheet);
    expect(box(sheet, "Option 2 name")).toHaveAccessibleDescription("Name this option");

    await user.type(box(sheet, "Option 2 name"), "Long");
    const duration = box(sheet, "Option 2 duration");
    await user.clear(duration);
    await user.type(duration, "90");
    const price = box(sheet, "Option 2 price");
    await user.clear(price);
    await user.type(price, "80");
    expect(within(preview).getByText("From €50")).toBeInTheDocument();
    expect(within(preview).getByText("45 min – 1 h 30 min")).toBeInTheDocument();
    await save(sheet);

    await waitFor(() => expect(api.bodies("PUT", "/services/s1")).toHaveLength(1));
    expect((api.bodies("PUT", "/services/s1")[0] as Service).options).toEqual([
      { name: "Short", description: null, durationMinutes: 45, priceCents: 5000, sortOrder: 0 },
      { name: "Long", description: null, durationMinutes: 90, priceCents: 8000, sortOrder: 1 },
    ]);
  });

  it("removes an option and stops adding at the backend's limit", async () => {
    const options = Array.from({ length: SERVICE_LIMITS.options }, (_, i) => ({
      id: `o${i}`,
      name: `Option ${i}`,
      description: null,
      durationMinutes: 30,
      priceCents: 1000,
      sortOrder: i,
    }));
    fakeServicesApi();
    const { sheet, user } = open(service({ options }));
    expect(within(sheet).getByRole("button", { name: "Add option" })).toBeDisabled();
    await user.click(within(sheet).getByRole("button", { name: `Remove option ${SERVICE_LIMITS.options}` }));
    expect(within(sheet).getByRole("button", { name: "Add option" })).toBeEnabled();
  });

  it("adds, checks and removes add-ons, showing them as extras", async () => {
    const api = fakeServicesApi();
    const { sheet, preview, user } = open();
    await user.type(box(sheet, /^Name/), "Wash");
    expect(within(sheet).getByText("No add-ons.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Add add-on" }));
    await user.click(within(sheet).getByRole("button", { name: "Add add-on" }));
    expect(within(preview).getByText("+ Add-on 1")).toBeInTheDocument();
    await save(sheet);
    expect(box(sheet, "Add-on 1 name")).toHaveAccessibleDescription("Name this add-on");

    await user.type(box(sheet, "Add-on 1 name"), "Wax");
    const extra = box(sheet, "Add-on 1 extra minutes");
    await user.clear(extra);
    await user.type(extra, String(SERVICE_LIMITS.addonExtraMinutes.max + 1));
    await user.clear(box(sheet, "Add-on 1 price"));
    await user.type(box(sheet, "Add-on 1 price"), "12");
    await save(sheet);
    expect(extra).toHaveAccessibleDescription(`At most ${SERVICE_LIMITS.addonExtraMinutes.max} minutes`);

    await user.clear(extra);
    await user.type(extra, "15");
    expect(within(preview).getByText("+€12")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Remove add-on 2" }));
    await save(sheet);
    await waitFor(() => expect(api.bodies("POST", "/services")).toHaveLength(1));
    expect(posted(api).addons).toEqual([
      { name: "Wax", description: null, extraMinutes: 15, priceCents: 1200, sortOrder: 0 },
    ]);
  });
});

describe("Requirements", () => {
  it("asks for resources first when there are none, and skips inactive ones", async () => {
    fakeServicesApi({ resources: [resource({ id: "r9", name: "Gone", isActive: false })] });
    const { sheet, user } = open();
    await user.click(within(sheet).getByRole("button", { name: "Add requirement" }));
    expect(await within(sheet).findByText("Add therapists first.")).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Gone" })).not.toBeInTheDocument();
  });

  it("lists an inactive resource a requirement still names, marked, so it can be taken off", async () => {
    const api = fakeServicesApi({
      resources: [
        resource({ id: "r1", name: "Sam Rivers" }),
        resource({ id: "r9", name: "Gone", isActive: false }),
      ],
    });
    const requirement = {
      id: "q1",
      label: "Therapist",
      quantity: 1,
      customerSelectable: false,
      resourceIds: ["r1", "r9"],
      sortOrder: 0,
    };
    const { sheet, user } = open(service({ requirements: [requirement] }));
    const gone = await within(sheet).findByRole("button", { name: /^Gone/ });
    expect(gone).toHaveAttribute("aria-pressed", "true");
    expect(gone).toHaveTextContent("Inactive");
    await user.click(gone);
    expect(within(sheet).queryByRole("button", { name: /Gone/ })).not.toBeInTheDocument();
    await save(sheet);
    await waitFor(() => expect(api.bodies("PUT", "/services/s1")).toHaveLength(1));
    expect(api.bodies("PUT", "/services/s1")[0]).toMatchObject({ requirements: [{ resourceIds: ["r1"] }] });
  });

  it("toggles a resource off again", async () => {
    fakeServicesApi({ resources: [resource({ id: "r1", name: "Sam Rivers" })] });
    const { sheet, user } = open();
    await user.click(within(sheet).getByRole("button", { name: "Add requirement" }));
    const sam = await within(sheet).findByRole("button", { name: "Sam Rivers" });
    await user.click(sam);
    expect(sam).toHaveAttribute("aria-pressed", "true");
    await user.click(sam);
    expect(sam).toHaveAttribute("aria-pressed", "false");
  });

  it("stops adding at the backend's limit", async () => {
    const requirements = Array.from({ length: SERVICE_LIMITS.requirements }, (_, i) => ({
      id: `q${i}`,
      label: `Need ${i}`,
      quantity: 1,
      customerSelectable: false,
      resourceIds: ["r1"],
      sortOrder: i,
    }));
    fakeServicesApi();
    const { sheet } = open(service({ requirements }));
    expect(within(sheet).getByRole("button", { name: "Add requirement" })).toBeDisabled();
  });
});

describe("Questions", () => {
  it("lists the active questions asked for this service, with a link to manage them", async () => {
    fakeServicesApi({
      questions: [
        question({ id: "q1", label: "Any injuries?", required: true, sensitive: true }),
        question({ id: "q2", label: "Which knee?", serviceId: "s1" }),
        question({ id: "q3", label: "Other service only", serviceId: "s2" }),
        question({ id: "q4", label: "Retired question", isActive: false }),
      ],
    });
    const { sheet } = open(service());
    const items = within(await within(sheet).findByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Any injuries\?Required.*Sensitive.*All services$/),
      "Which knee?This service",
    ]);
    expect(within(sheet).getByRole("link", { name: "Manage questions" })).toHaveAttribute(
      "href",
      "/dashboard/lumen-physio/settings/questions",
    );
    await expectNoAxeViolations(document.body);
  });

  it("says when nothing extra is asked, and isn't shown for a new service", async () => {
    fakeServicesApi({ questions: [question({ serviceId: "other" })] });
    const { sheet } = open(service());
    expect(
      await within(sheet).findByText("No questions — just name and contact details."),
    ).toBeInTheDocument();
    expect(
      must(within(sheet).getByRole("heading", { name: "Questions" }), "questions heading"),
    ).toBeInTheDocument();
  });

  it("is left out when creating", () => {
    fakeServicesApi();
    const { sheet } = open();
    expect(within(sheet).queryByRole("heading", { name: "Questions" })).not.toBeInTheDocument();
  });
});

describe("Customer preview", () => {
  it("shows a placeholder name until one is typed, then the description", async () => {
    fakeServicesApi();
    const { sheet, preview, user } = open();
    expect(within(preview).getByText("Service name")).toBeInTheDocument();
    expect(within(preview).getByText("30 min")).toBeInTheDocument();
    expect(within(preview).queryByRole("button")).not.toBeInTheDocument();
    await user.type(box(sheet, /^Name/), "Deep clean");
    await user.type(box(sheet, /^Description/), "Every corner.");
    expect(within(preview).getByText("Deep clean")).toBeInTheDocument();
    expect(within(preview).getByText("Every corner.")).toBeInTheDocument();
  });

  it("shows free options as free", () => {
    fakeServicesApi();
    const { preview } = open(
      service({
        paymentMode: "free",
        priceCents: 0,
        options: [
          { id: "o1", name: "", description: null, durationMinutes: 20, priceCents: 0, sortOrder: 0 },
        ],
        addons: [{ id: "a1", name: "Tea", description: null, extraMinutes: 0, priceCents: 0, sortOrder: 0 }],
      }),
    );
    expect(within(preview).getByText("Option 1")).toBeInTheDocument();
    expect(within(preview).getByText("20 min · Free")).toBeInTheDocument();
    expect(within(preview).getAllByText("Free").length).toBeGreaterThan(1);
  });
});
