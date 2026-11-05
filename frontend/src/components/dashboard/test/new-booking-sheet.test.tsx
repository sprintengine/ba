import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { CreatedBooking, FormQuestion, Service } from "@/lib/api/types";
import type { NewBookingPrefill } from "@/lib/dashboard/new-booking";
import { expectNoAxeViolations } from "@/test/axe";
import { must } from "@/test/must";
import { NewBookingSheet } from "../booking/new-booking-sheet";
import {
  availability,
  customer,
  question,
  requestBody,
  requestUrl,
  resource,
  service,
  slot,
} from "./booking-builders";
import { booking, json, mockApi, renderDashboard } from "./render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-09-20T09:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  toast.success.mockClear();
  toast.error.mockClear();
});

const DAY = "2099-10-01";
const followUp = service();
const massage = service({
  id: "s2",
  name: "Massage",
  category: "Massage",
  sortOrder: 1,
  durationMinutes: 30,
  priceCents: 3000,
  options: [
    { id: "o1", name: "Short", description: null, durationMinutes: 30, priceCents: 3000, sortOrder: 0 },
    { id: "o2", name: "Long", description: null, durationMinutes: 60, priceCents: 5000, sortOrder: 1 },
  ],
  addons: [
    { id: "a1", name: "Hot stones", description: null, extraMinutes: 15, priceCents: 1000, sortOrder: 0 },
  ],
  requirements: [
    {
      id: "rq1",
      label: "Therapist",
      quantity: 1,
      customerSelectable: true,
      resourceIds: ["r1", "r2"],
      sortOrder: 0,
    },
  ],
});
const freebie = service({
  id: "s3",
  name: "Intro chat",
  category: "Massage",
  priceCents: 0,
  isPublic: false,
  requirements: massage.requirements,
});

const questions: FormQuestion[] = [
  question({ id: "q1", label: "Referred by" }),
  question({
    id: "q2",
    label: "First visit?",
    kind: "select",
    options: ["Yes", "No"],
    serviceId: "s2",
    sortOrder: 1,
  }),
  question({ id: "q3", label: "Happy to be contacted", kind: "checkbox", sortOrder: 2 }),
  question({
    id: "q4",
    label: "Injuries",
    kind: "textarea",
    sensitive: true,
    sortOrder: 3,
    helpText: "Health details",
  }),
  question({ id: "q5", label: "Retired question", isActive: false }),
  question({ id: "q6", label: "Other service's question", serviceId: "s1" }),
];

const prefill: NewBookingPrefill = {
  serviceId: "s1",
  date: DAY,
  time: "10:00",
  customer: { id: "c1", name: "Alex Morgan", email: "alex@example.test" },
};

type Route = (method: string, path: string, body: unknown) => unknown;

function api(create: Route = () => ({ ...booking(), checkoutUrl: null }), services: Service[] = [followUp]) {
  return mockApi((method, path, body) => {
    if (path.endsWith("/services")) return services;
    if (path.endsWith("/questions")) return questions;
    if (path.endsWith("/resources")) return [resource("r1", "Sam Rivers"), resource("r2", "Jo Park", 1)];
    if (path.endsWith("/availability"))
      return availability({ [DAY]: [slot(`${DAY}T10:00:00+01:00`, { resourceIds: ["r2"] })] });
    if (path.endsWith("/customers"))
      return {
        items: [customer({ id: "c2", name: "Riley Quinn", email: "riley@example.test" })],
        nextCursor: null,
      };
    if (method === "POST" && path.endsWith("/bookings")) return create(method, path, body);
    return [];
  });
}

function renderSheet(
  p: NewBookingPrefill = prefill,
  {
    onOpenChange = vi.fn(),
    onCreated,
  }: { onOpenChange?: Mock<(open: boolean) => void>; onCreated?: (id: string) => void } = {},
) {
  renderDashboard(<NewBookingSheet open onOpenChange={onOpenChange} prefill={p} onCreated={onCreated} />);
  return { onOpenChange };
}

const createBody = (calls: ReturnType<typeof mockApi>) =>
  requestBody(calls, "/bookings") as Record<string, unknown> | undefined;
const submit = () => userEvent.click(screen.getByRole("button", { name: "Create appointment" }));

/** The field (label + control + messages) around the control named [name]. */
const fieldOf = (control: HTMLElement) =>
  control.closest("[data-slot=field]") ?? control.parentElement ?? control;

describe("NewBookingSheet", () => {
  it("creates a prefilled booking at an exact time and closes", async () => {
    const calls = api();
    const { onOpenChange } = renderSheet();
    expect((await screen.findAllByText(/1 Oct, 10:00/)).length).toBeGreaterThan(0);
    await submit();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Appointment created", expect.anything());
    expect(createBody(calls)).toMatchObject({
      serviceId: "s1",
      start: `${DAY}T10:00:00+01:00`,
      customerId: "c1",
      customer: null,
      resourceIds: null,
      paymentMode: "at_venue",
      notifyCustomer: true,
    });
    expect(requestUrl(calls, "/bookings", "POST")).toBeDefined();
  });

  it("shows a busy placeholder while services load, and asks for a service first when there are none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { unmount } = renderDashboard(<NewBookingSheet open onOpenChange={() => {}} prefill={{}} />);
    expect(
      screen.getByRole("dialog", { name: "New appointment" }).querySelector("[aria-busy]"),
    ).not.toBeNull();
    unmount();

    api(undefined, [service({ isActive: false })]);
    renderSheet({});
    expect(await screen.findByText(/Add a service first/)).toHaveTextContent(
      "Add a service first. Every appointment is for a service.",
    );
    expect(screen.getByRole("button", { name: "Create appointment" })).toBeDisabled();
    expect(screen.getByText("Nothing selected yet")).toBeInTheDocument();
  });

  it.each(["/services", "/questions", "/resources"])(
    "says what failed with a retry, rather than an empty form, when %s can't be loaded",
    async (failing) => {
      let fail = true;
      const route = api();
      const answer = route.getMockImplementation();
      route.mockImplementation(async (input, init) =>
        fail && new URL(String(input), "http://x").pathname.endsWith(failing)
          ? json({ error: { code: "INTERNAL", message: "Settings are down" } }, 500)
          : must(answer, "the API stub")(input, init),
      );
      const user = userEvent.setup();
      renderSheet();
      expect(await screen.findByText("Settings are down")).toBeInTheDocument();
      expect(screen.queryByText(/Add a service first/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create appointment" })).toBeDisabled();
      fail = false;
      await user.click(screen.getByRole("button", { name: /try again/i }));
      expect((await screen.findAllByText(/1 Oct, 10:00/)).length).toBeGreaterThan(0);
      expect(screen.queryByText("Settings are down")).not.toBeInTheDocument();
    },
  );

  it("builds a booking step by step: service, option, add-on, free time, customer search, questions, payment", async () => {
    const calls = api(() => ({ ...booking({ id: "bk9" }), checkoutUrl: null }), [followUp, massage, freebie]);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    renderSheet({ date: DAY }, { onCreated });

    // 1. Service, grouped by category; private services say so.
    await user.click(await screen.findByRole("combobox", { name: "Service" }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: /Intro chat.*private/ })).toBeInTheDocument();
    expect(
      within(listbox).getByText("Massage", { selector: "[data-slot=select-label], div" }),
    ).toBeInTheDocument();
    await user.click(within(listbox).getByRole("option", { name: /^Massage/ }));

    // 2. An option is needed before free times show.
    expect(screen.getByText("Choose an option to see free times.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Long/ }));
    await user.click(await screen.findByRole("radio", { name: "10:00" }));
    // Changing the add-ons clears the time.
    await user.click(screen.getByRole("checkbox", { name: /Hot stones/ }));
    await waitFor(() => expect(requestUrl(calls, "/availability")).toBeDefined());
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "10:00" })).toHaveAttribute("aria-checked", "false"),
    );
    await user.click(screen.getByRole("radio", { name: "10:00" }));
    // The footer sums the option and add-ons.
    expect(screen.getAllByText(/1 Oct, 10:00/).at(-1)?.parentElement).toHaveTextContent(
      /10:00 · 1 h 15 min · €60$/,
    );

    // 3. Find a customer.
    await user.click(screen.getByRole("combobox", { name: /find a patient/i }));
    await user.type(await screen.findByPlaceholderText("Name, email or phone…"), "Riley");
    // The search is debounced: wait for its results before choosing one.
    await waitFor(() =>
      expect(
        calls.mock.calls.some(([u]) => new URL(String(u), "http://x").searchParams.get("q") === "Riley"),
      ).toBe(true),
    );
    await user.click(await screen.findByRole("option", { name: /Riley Quinn/ }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /find a patient/i })).toHaveTextContent("Riley Quinn"),
    );

    // 4. Questions: the service's and general ones, active only, in order.
    await user.click(screen.getByRole("button", { name: /^Questions/ }));
    const step4 = within(
      screen.getByRole("button", { name: /^Questions/ }).closest("section") as HTMLElement,
    );
    expect(screen.queryByText("Retired question")).not.toBeInTheDocument();
    expect(screen.queryByText("Other service's question")).not.toBeInTheDocument();
    await user.type(step4.getByRole("textbox", { name: "Referred by" }), "A friend");
    await user.click(step4.getByRole("combobox", { name: "First visit?" }));
    await user.click(await screen.findByRole("option", { name: "Yes" }));
    await user.click(step4.getByRole("switch", { name: "Happy to be contacted" }));
    await user.type(step4.getByRole("textbox", { name: /Injuries/ }), "Sore back");

    // Payment and notes.
    await user.click(screen.getByRole("button", { name: /^Payment/ }));
    await user.click(screen.getByRole("radio", { name: /Online/ }));
    await user.click(screen.getByRole("button", { name: /^Notes/ }));
    await user.type(screen.getByRole("textbox", { name: /Internal notes/ }), "Regular");
    await submit();

    await waitFor(() => expect(createBody(calls)).toBeDefined());
    expect(createBody(calls)).toEqual({
      serviceId: "s2",
      optionId: "o2",
      addonIds: ["a1"],
      groupId: null,
      resourceIds: ["r2"],
      start: `${DAY}T10:00:00+01:00`,
      customerId: "c2",
      customer: null,
      answers: { q1: "A friend", q2: "Yes", q3: "true", q4: "Sore back" },
      internalNotes: "Regular",
      paymentMode: "collect_online",
      notifyCustomer: true,
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [, options] = toast.success.mock.calls[0] as [string, { action: { onClick: () => void } }];
    options.action.onClick();
    expect(onCreated).toHaveBeenCalledWith("bk9");
  });

  it("books someone with a calendar picked for an exact time, and preselects “No charge” for a free service", async () => {
    const calls = api(undefined, [massage, freebie]);
    const user = userEvent.setup();
    renderSheet({ ...prefill, serviceId: undefined, resourceId: "r1" });
    await user.click(await screen.findByRole("combobox", { name: "Service" }));
    await user.click(await screen.findByRole("option", { name: /Intro chat/ }));
    expect(screen.getByRole("combobox", { name: "With" })).toHaveTextContent("Sam Rivers");
    await user.click(screen.getByRole("button", { name: /^Payment/ }));
    expect(screen.getByRole("radio", { name: /No charge/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /At venue/ })).toBeDisabled();
    await submit();
    await waitFor(() =>
      expect(createBody(calls)).toMatchObject({ paymentMode: "none", resourceIds: ["r1"] }),
    );
  });

  it("looks for free times on another date and with a chosen calendar", async () => {
    const calls = api(undefined, [massage]);
    const user = userEvent.setup();
    renderSheet({ serviceId: "s2", date: DAY });
    await user.click(await screen.findByRole("radio", { name: /Short/ }));
    await user.click(await screen.findByRole("radio", { name: "10:00" }));

    await user.click(screen.getByRole("combobox", { name: "With" }));
    await user.click(await screen.findByRole("option", { name: "Jo Park" }));
    const queries = () =>
      calls.mock.calls
        .map(([u]) => new URL(String(u), "http://x"))
        .filter((u) => u.pathname.endsWith("/availability"))
        .map((u) => Object.fromEntries(u.searchParams));
    await waitFor(() => expect(queries().some((q) => q.resourceId === "r2")).toBe(true));
    expect(screen.getByText("No time yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Date" }));
    await user.click(await screen.findByRole("button", { name: /\b3 October 2099/ }));
    await waitFor(() =>
      expect(queries().some((q) => q.from === "2099-10-03" && q.resourceId === "r2")).toBe(true),
    );
  });

  it("asks for an option when booking a service with options at an exact time", async () => {
    const calls = api(undefined, [massage]);
    renderSheet({ ...prefill, serviceId: "s2" });
    await screen.findByRole("combobox", { name: /find a patient/i });
    await submit();
    expect(await screen.findByText("Choose an option")).toBeInTheDocument();
    expect(createBody(calls)).toBeUndefined();
  });

  it("asks for a time and someone to book for", async () => {
    const calls = api();
    const user = userEvent.setup();
    renderSheet({ serviceId: "s1", date: DAY });
    await screen.findByRole("radio", { name: "10:00" });
    await submit();
    expect(await screen.findByText("Pick a time")).toBeInTheDocument();
    const who = screen.getByRole("combobox", { name: /find a patient/i });
    expect(who).toHaveAttribute("aria-invalid", "true");
    expect(who).toHaveAccessibleDescription(/Choose who this is for/);
    await user.click(screen.getByRole("radio", { name: "Exact time" }));
    await submit();
    expect(await screen.findByText("Enter a start time")).toBeInTheDocument();
    expect(createBody(calls)).toBeUndefined();
  });

  it("asks for another time when the slot was just taken", async () => {
    api(() => json({ error: { code: "SLOT_UNAVAILABLE", message: "Taken" } }, 409));
    renderSheet({ ...prefill, time: undefined });
    await userEvent.click(await screen.findByRole("radio", { name: "10:00" }));
    await submit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That time is no longer free."));
    expect(await screen.findByText("That time was just taken. Pick another one.")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows a plan limit above the actions, as an alert", async () => {
    api(() =>
      json({ error: { code: "PLAN_LIMIT_REACHED", message: "Your plan's monthly limit is used." } }, 402),
    );
    renderSheet();
    await screen.findByRole("combobox", { name: /find a patient/i });
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your plan's monthly limit is used. Upgrade in Settings → Billing to keep taking appointments.",
    );
  });

  it("explains online payments aren't set up under the payment choice", async () => {
    api(() => json({ error: { code: "PAYMENTS_NOT_CONFIGURED", message: "No payments" } }, 409));
    renderSheet();
    await screen.findByRole("combobox", { name: /find a patient/i });
    await submit();
    expect(await screen.findByText(/Online payments aren't set up yet/)).toBeInTheDocument();
  });

  it("checks a new customer's details with the customer form's rules", async () => {
    const calls = api(() => booking());
    const user = userEvent.setup();
    renderSheet({ ...prefill, customer: undefined });
    await screen.findByRole("combobox", { name: /find a patient/i });
    await user.click(screen.getByRole("combobox", { name: /find a patient/i }));
    await user.click(await screen.findByRole("button", { name: /new patient/i }));
    await user.type(screen.getByRole("textbox", { name: /email/i }), "not-an-email");
    await user.type(screen.getByRole("textbox", { name: /phone/i }), "call me");
    await submit();
    expect(await screen.findByText("Enter a name")).toBeInTheDocument();
    const name = screen.getByRole("textbox", { name: /name/i });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Enter a name");
    expect(name).toHaveFocus();
    expect(screen.getByRole("textbox", { name: /email/i })).toHaveAccessibleDescription(
      /Enter a valid email/,
    );
    expect(screen.getByRole("textbox", { name: /phone/i })).toHaveAccessibleDescription(
      /Enter a valid phone number/,
    );
    expect(createBody(calls)).toBeUndefined();
  });

  it("prefills a new customer from the search, and can go back to searching", async () => {
    api();
    const user = userEvent.setup();
    renderSheet({ ...prefill, customer: undefined });
    await screen.findByRole("combobox", { name: /find a patient/i });
    await user.click(screen.getByRole("combobox", { name: /find a patient/i }));
    await user.type(await screen.findByPlaceholderText("Name, email or phone…"), "sam@example.test");
    await user.click(await screen.findByRole("button", { name: /new patient: “sam@example.test”/i }));
    expect(screen.getByRole("textbox", { name: /email/i })).toHaveValue("sam@example.test");
    expect(screen.getByRole("textbox", { name: /name/i })).toHaveValue("");
    await user.click(screen.getByRole("button", { name: /search existing/i }));
    expect(screen.getByRole("combobox", { name: /find a patient/i })).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: /find a patient/i }));
    await user.type(await screen.findByPlaceholderText("Name, email or phone…"), "Sam Lee");
    await user.click(await screen.findByRole("button", { name: /new patient: “Sam Lee”/i }));
    expect(screen.getByRole("textbox", { name: /name/i })).toHaveValue("Sam Lee");
  });

  it("puts the server's field errors under the new customer's fields", async () => {
    const calls = api(() =>
      json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Check the highlighted fields",
            fields: { "customer.email": "This address bounces", "customer.phone": "Not a phone number" },
          },
        },
        400,
      ),
    );
    const user = userEvent.setup();
    renderSheet({ ...prefill, customer: undefined });
    await screen.findByRole("combobox", { name: /find a patient/i });
    await user.click(screen.getByRole("combobox", { name: /find a patient/i }));
    await user.click(await screen.findByRole("button", { name: /new patient/i }));
    await user.type(screen.getByRole("textbox", { name: /name/i }), "  Sam Lee ");
    await user.type(screen.getByRole("textbox", { name: /email/i }), "sam@example.test");
    await user.type(screen.getByRole("textbox", { name: /phone/i }), "087 123 4567");
    await submit();

    const email = screen.getByRole("textbox", { name: /email/i });
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(email).toHaveAccessibleDescription(/This address bounces/);
    expect(email).toHaveFocus();
    const phone = screen.getByRole("textbox", { name: /phone/i });
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(within(fieldOf(phone) as HTMLElement).getByText("Not a phone number")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Check the highlighted fields");
    expect(createBody(calls)).toMatchObject({
      customerId: null,
      customer: { name: "Sam Lee", email: "sam@example.test", phone: "087 123 4567" },
    });
  });

  it("shows the payment link of a booking held for online payment", async () => {
    const heldBooking: CreatedBooking = {
      ...booking({
        id: "bk7",
        status: "held",
        paymentStatus: "pending",
        amountPaidCents: 0,
        depositCents: 2000,
        holdExpiresAt: `${DAY}T09:30:00+01:00`,
      }),
      checkoutUrl: "https://pay.example.test/c/1",
    };
    api(() => heldBooking);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { onOpenChange } = renderSheet(prefill, { onCreated });
    await screen.findByRole("combobox", { name: /find a patient/i });
    await user.click(screen.getByRole("button", { name: /^Payment/ }));
    await user.click(screen.getByRole("radio", { name: /Online/ }));
    await submit();

    expect(await screen.findByRole("dialog", { name: "Appointment held for payment" })).toBeInTheDocument();
    expect(screen.getByText(/held until 09:30/)).toHaveTextContent("the €20 deposit");
    expect(screen.getByRole("textbox", { name: "Payment link" })).toHaveValue("https://pay.example.test/c/1");
    expect(screen.getByText(/We've emailed this link to alex@example.test/)).toBeInTheDocument();
    await expectNoAxeViolations(document.body);
    await user.click(screen.getByRole("button", { name: /copy payment link/i }));
    expect(writeText).toHaveBeenCalledWith("https://pay.example.test/c/1");
    await user.click(screen.getByRole("button", { name: "View appointment" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreated).toHaveBeenCalledWith("bk7");
  });

  it("says to share the link itself when the customer isn't emailed", async () => {
    api(() => ({
      ...booking({ status: "held", paymentStatus: "pending", amountPaidCents: 0, holdExpiresAt: null }),
      checkoutUrl: "https://pay.example.test/c/2",
    }));
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
      configurable: true,
    });
    const { onOpenChange } = renderSheet();
    await screen.findByRole("combobox", { name: /find a patient/i });
    await user.click(screen.getByRole("button", { name: /^Payment/ }));
    await user.click(screen.getByRole("switch", { name: "Email the patient" }));
    await submit();
    expect(await screen.findByText(/Copy the link and send it to the patient/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View appointment" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /copy payment link/i }));
    expect(toast.error).toHaveBeenCalledWith("Couldn't copy. Select the link and copy it instead.");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("says how long a held booking without a link is kept", async () => {
    api(() => ({ ...booking({ status: "held", paymentStatus: "pending" }), checkoutUrl: null }));
    renderSheet();
    await screen.findByRole("combobox", { name: /find a patient/i });
    await submit();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Appointment created", {
        description: "Held for 30 min while the patient pays.",
        action: undefined,
      }),
    );
  });

  it("is accessible, and closes on Escape and Cancel", async () => {
    api(undefined, [followUp, massage]);
    const user = userEvent.setup();
    const { onOpenChange } = renderSheet({ ...prefill, serviceId: "s2", time: undefined });
    await screen.findByRole("radio", { name: /Long/ });
    await expectNoAxeViolations(document.body);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
