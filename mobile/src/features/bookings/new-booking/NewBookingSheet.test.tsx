import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { Pressable, Share, Text } from "react-native";
import { bookingSparse, customer, customerSparse } from "@shared/api/__tests__/fixtures/bookings";
import { formQuestion, resource, service } from "@shared/api/__tests__/fixtures/catalog";
import { ids } from "@shared/api/__tests__/fixtures/ids";
import { slotOffer } from "@shared/api/__tests__/fixtures/offers";
import type { Availability, CreatedBooking, FormQuestion, Service, Slot } from "@shared/api/types";
import type { NewBookingPrefill } from "@shared/dashboard/new-booking";
import { apiError, calls, json, mockApi, pending, type ApiRoute } from "~/test/api-mock";
import { B, renderOpsScreen, testBusiness, type OpsScreenOptions } from "~/test/render-ops-screen";
import { useBookingActions } from "../BookingActions";

// Thursday 15 October 2026, 09:00 in Dublin (IST, +01:00). Only the clock is fixed; timers run for real.
const NOW = new Date("2026-10-15T08:00:00Z");
const TODAY = "2026-10-15";
const TOMORROW = "2026-10-16";

const at = (date: string, time: string) => `${date}T${time}:00+01:00`;
const slot = (date: string, time: string, patch: Partial<Slot> = {}): Slot => ({
  start: at(date, time),
  end: at(date, time),
  resourceIds: [ids.resource],
  seatsLeft: null,
  offer: null,
  ...patch,
});

const morning = slot(TODAY, "10:00");
const deal = slot(TODAY, "14:30", { resourceIds: [ids.resource2], offer: slotOffer });
const week: Availability = {
  timezone: "Europe/Dublin",
  from: TODAY,
  to: "2026-10-21",
  durationMinutes: 90,
  nextAvailableOnly: false,
  days: [
    { date: TODAY, slots: [morning, deal], opensAt: null, held: false },
    { date: TOMORROW, slots: [slot(TOMORROW, "09:00")], opensAt: null, held: false },
  ],
};

/** Initial assessment: one option ("Extended", chosen for you), the "Taping" add-on, Alex or Jordan. */
const assessment: Service = service;
const massage: Service = {
  ...service,
  id: "svc-massage",
  name: "Sports massage",
  category: "Massage",
  sortOrder: 1,
  options: [
    {
      id: "opt-30",
      name: "30 minutes",
      description: null,
      durationMinutes: 30,
      priceCents: 3000,
      sortOrder: 0,
    },
    {
      id: "opt-60",
      name: "60 minutes",
      description: null,
      durationMinutes: 60,
      priceCents: 5000,
      sortOrder: 1,
    },
  ],
  addons: [
    { id: "addon-heat", name: "Heat pack", description: null, extraMinutes: 0, priceCents: 0, sortOrder: 0 },
  ],
  requirements: [],
};
const checkIn: Service = {
  ...service,
  id: "svc-checkin",
  name: "Free check-in",
  category: null,
  durationMinutes: 15,
  priceCents: 0,
  paymentMode: "free",
  depositCents: null,
  isPublic: false,
  sortOrder: 1,
  options: [],
  addons: [],
  requirements: [],
};
const retired: Service = { ...service, id: "svc-retired", name: "Retired treatment", isActive: false };
const services = [assessment, massage, checkIn, retired];

const jordan = { ...resource, id: ids.resource2, name: "Jordan Casey" };
const resources = [resource, jordan, { ...resource, id: ids.room, name: "Old room", isActive: false }];

const reportEmail: FormQuestion = {
  ...formQuestion,
  id: ids.question2,
  serviceId: null,
  label: "Email for the report",
  helpText: null,
  kind: "email",
  options: [],
  sortOrder: 1,
};
const consent: FormQuestion = {
  ...formQuestion,
  id: "q-consent",
  serviceId: null,
  label: "Consent to treatment",
  helpText: "Signed on the day if not now.",
  kind: "checkbox",
  options: [],
  sensitive: true,
  sortOrder: 2,
};
const history: FormQuestion = {
  ...formQuestion,
  id: "q-history",
  serviceId: null,
  label: "Medical history",
  helpText: null,
  kind: "textarea",
  options: [],
  sortOrder: 3,
};
const archived: FormQuestion = { ...formQuestion, id: "q-archived", label: "Old question", isActive: false };
/** "Which knee?" is the assessment's own; the rest are asked for every service. */
const questions = [history, consent, formQuestion, reportEmail, archived];

const created = (patch: Partial<CreatedBooking> = {}): CreatedBooking => ({
  ...bookingSparse,
  status: "confirmed",
  start: morning.start,
  checkoutUrl: null,
  ...patch,
});

type Api = { customers?: () => unknown; create?: (body: unknown) => unknown; extra?: ApiRoute };

function api({ customers = () => ({ items: [customer], nextCursor: null }), create, extra }: Api = {}) {
  return mockApi((method, path, body) => {
    const custom = extra?.(method, path, body);
    if (custom !== undefined) return custom;
    if (method === "GET" && path === `${B}/services`) return services;
    if (method === "GET" && path === `${B}/resources`) return resources;
    if (method === "GET" && path === `${B}/questions`) return questions;
    if (method === "GET" && path === `${B}/customers`) return customers();
    if (method === "GET" && path === `${B}/availability`) return week;
    if (method === "POST" && path === `${B}/bookings`) return create ? create(body) : created();
    if (path === "/v1/me/notifications") return { items: [], unreadCount: 0 };
    return undefined;
  });
}

function Opener({ prefill }: { prefill?: NewBookingPrefill }) {
  const { openNewBooking } = useBookingActions();
  return (
    <Pressable testID="open-new-booking" onPress={() => openNewBooking(prefill)}>
      <Text>Open the form</Text>
    </Pressable>
  );
}

/** A receptionist opens "New appointment" (from the Bookings section, or with a prefill). */
async function openSheet(prefill?: NewBookingPrefill, options: OpsScreenOptions = {}) {
  const app = renderOpsScreen(<Opener prefill={prefill} />, {
    routes: { "dashboard/[slug]/bookings/[id]": () => <Text testID="booking-page">Booking page</Text> },
    ...options,
  });
  fireEvent.press(screen.getByTestId("open-new-booking"));
  expect(await screen.findByTestId("new-booking-sheet")).toBeOnTheScreen();
  return app;
}

const sheet = () => within(screen.getByTestId("new-booking-sheet"));
const summary = () => screen.getByTestId("new-booking-summary");
const create = () => fireEvent.press(screen.getByTestId("create-booking"));
const posts = (fetch: jest.Mock) =>
  fetch.mock.calls.filter(
    ([url, init]) =>
      (init as RequestInit | undefined)?.method === "POST" && String(url).endsWith("/bookings"),
  );
const postedBody = (fetch: jest.Mock, n = 0) =>
  JSON.parse(String((posts(fetch)[n]![1] as RequestInit).body)) as unknown;

async function chooseService(id = assessment.id) {
  fireEvent.press(await screen.findByTestId(`service-${id}`));
}
/** A free time, once the times for what's chosen have loaded (until then the last ones show, not choosable). */
async function pickTime(time: string) {
  await waitFor(() => expect(screen.getByTestId(`slot-${time}`)).toBeEnabled());
  fireEvent.press(screen.getByTestId(`slot-${time}`));
}
async function chooseCustomer() {
  fireEvent.press(await screen.findByTestId(`customer-${ids.customer}`));
}

beforeEach(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("NewBookingSheet", () => {
  it("books a free time for an existing patient, with an add-on, answers and notes", async () => {
    const fetch = api();
    await openSheet();
    expect(screen.getByText("New appointment", { exact: true })).toBeOnTheScreen();
    expect(await screen.findByText("Times are in Europe/Dublin.")).toBeOnTheScreen();
    expect(summary()).toHaveTextContent("Nothing selected yet");
    expect(screen.getByTestId("create-booking")).toBeDisabled();
    expect(screen.getByText("Choose a service to see free times.")).toBeOnTheScreen();

    // Services by category; inactive ones aren't offered; private ones say so.
    await chooseService();
    expect(screen.queryByTestId(`service-${retired.id}`)).toBeNull();
    expect(screen.getByTestId("service-chosen")).toHaveTextContent(/Initial assessment/);
    // Its only option is chosen for them.
    expect(screen.getByTestId(`option-${ids.option}`)).toBeChecked();
    fireEvent.press(screen.getByTestId(`addon-${ids.addon}`));
    expect(screen.getByTestId(`addon-${ids.addon}`)).toBeChecked();
    expect(summary()).toHaveTextContent("No time yet · 1 h 40 min · €105");

    await pickTime("10:00");
    expect(summary()).toHaveTextContent("Thu, 15 Oct, 10:00 · 1 h 40 min · €105");

    await chooseCustomer();
    expect(screen.getByTestId(`customer-${ids.customer}`)).toBeChecked();

    // Questions: theirs and everyone's, active ones only, in order; sensitive ones flagged.
    expect(
      screen.getByText("All optional when you book for someone. Fill in what you know."),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Old question")).toBeNull();
    expect(screen.getByText("Sensitive: never emailed or shared with AI")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("radio", { name: "Left" }));
    fireEvent(screen.getByTestId("answer-q-consent"), "valueChange", true);
    fireEvent.changeText(screen.getByTestId("answer-q-history"), "  ");

    fireEvent.changeText(screen.getByLabelText("Internal notes (optional)"), "  Bring shorts ");
    create();

    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(postedBody(fetch)).toEqual({
      serviceId: assessment.id,
      optionId: ids.option,
      addonIds: [ids.addon],
      groupId: null,
      resourceIds: [ids.resource],
      start: morning.start,
      customerId: ids.customer,
      customer: null,
      answers: { [ids.question]: "Left", "q-consent": "true" },
      internalNotes: "Bring shorts",
      paymentMode: "at_venue",
      notifyCustomer: true,
    });
    expect((posts(fetch)[0]![1] as RequestInit).headers).toMatchObject({
      "Idempotency-Key": expect.any(String) as unknown,
    });
    expect(
      await screen.findByText("Appointment created: Thu, 15 Oct, 10:00 · Rowan Example"),
    ).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId("new-booking-sheet")).toBeNull());
  });

  it("shows a deal's price for a discounted time, and books who that time is with", async () => {
    const fetch = api();
    await openSheet();
    await chooseService();
    await pickTime("14:30");
    expect(summary()).toHaveTextContent("Thu, 15 Oct, 14:30 · 1 h 30 min · €56");
    await chooseCustomer();
    create();
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(postedBody(fetch)).toMatchObject({ start: deal.start, resourceIds: [ids.resource2] });
  });

  it("asks for a time and a patient before booking", async () => {
    const fetch = api();
    await openSheet();
    await chooseService();
    create();
    expect(await screen.findByText("Pick a time")).toBeOnTheScreen();
    expect(screen.getByText("Choose who this is for")).toBeOnTheScreen();
    expect(posts(fetch)).toHaveLength(0);
    // Picking fixes each one.
    await pickTime("10:00");
    await waitFor(() => expect(screen.queryByText("Pick a time")).toBeNull());
    await chooseCustomer();
    await waitFor(() => expect(screen.queryByText("Choose who this is for")).toBeNull());
  });

  it("picks the day from the chips or another month, and who it's with", async () => {
    const fetch = api();
    await openSheet();
    await chooseService();
    const date = within(screen.getByTestId("new-booking-date"));
    expect(date.getByText("Today")).toBeOnTheScreen();
    fireEvent.press(date.getByTestId(`date-${TOMORROW}`));
    expect(await screen.findByTestId("slot-09:00")).toBeOnTheScreen();

    fireEvent.press(date.getByText("Other date…"));
    expect(date.getByRole("button", { name: "Previous month" })).toBeDisabled();
    expect(date.getByTestId("day-2026-10-14")).toBeDisabled();
    fireEvent.press(date.getByRole("button", { name: "Next month" }));
    expect(date.getByRole("header", { name: "November 2026" })).toBeOnTheScreen();
    fireEvent.press(date.getByTestId("day-2026-11-20"));
    expect(date.getByText("Friday, 20 November")).toBeOnTheScreen();
    expect(date.getByTestId("date-2026-11-20")).toBeChecked();

    // "With": anyone who can do it (active ones), Alex by default "Any therapist".
    expect(screen.getByRole("radio", { name: "Any therapist" })).toBeChecked();
    expect(screen.queryByText("Old room")).toBeNull();
    fireEvent.press(screen.getByTestId(`with-${ids.resource2}`));
    expect(screen.getByTestId(`with-${ids.resource2}`)).toBeChecked();
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([url]) => {
          const u = new URL(String(url));
          return (
            u.searchParams.get("from") === "2026-11-20" && u.searchParams.get("resourceId") === ids.resource2
          );
        }),
      ).toBe(true),
    );
    fireEvent.press(screen.getByRole("radio", { name: "Any therapist" }));
    expect(screen.getByRole("radio", { name: "Any therapist" })).toBeChecked();
  });

  it("books an exact time typed any way, on the column it was opened from", async () => {
    const fetch = api();
    await openSheet({
      serviceId: assessment.id,
      resourceId: ids.resource2,
      date: "2026-10-20",
      time: "08:00",
    });
    // The service is already chosen; it can be changed.
    expect(await screen.findByTestId("service-chosen")).toHaveTextContent(/Initial assessment/);
    expect(screen.getByTestId(`with-${ids.resource2}`)).toBeChecked();
    expect(screen.getByRole("tab", { name: "Exact time" })).toBeSelected();
    const time = screen.getByTestId("new-booking-exact-time");
    expect(time).toHaveDisplayValue("08:00");
    // A prefilled service waits for its option to be chosen, even when it has just one.
    expect(summary()).toHaveTextContent("Tue, 20 Oct, 08:00 · 1 h · €70");
    expect(screen.getByTestId(`option-${ids.option}`)).not.toBeChecked();

    fireEvent.changeText(time, "nine-ish");
    fireEvent(time, "blur");
    expect(screen.getByText("Enter a time like 09:30")).toBeOnTheScreen();
    fireEvent.changeText(time, "930");
    fireEvent(time, "blur");
    expect(time).toHaveDisplayValue("09:30");
    expect(screen.queryByText("Enter a time like 09:30")).toBeNull();
    fireEvent.press(screen.getByTestId(`option-${ids.option}`));
    expect(summary()).toHaveTextContent("Tue, 20 Oct, 09:30 · 1 h 30 min · €95");

    await chooseCustomer();
    create();
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(postedBody(fetch)).toMatchObject({
      start: "2026-10-20T09:30:00+01:00",
      resourceIds: [ids.resource2],
      optionId: ids.option,
    });
  });

  it("asks for a start time when the exact time is empty", async () => {
    api();
    await openSheet({ serviceId: assessment.id, time: "08:00" });
    const time = await screen.findByTestId("new-booking-exact-time");
    fireEvent.changeText(time, "");
    await chooseCustomer();
    create();
    expect(await screen.findByText("Enter a start time")).toBeOnTheScreen();
    fireEvent.changeText(time, "11");
    await waitFor(() => expect(screen.queryByText("Enter a start time")).toBeNull());
  });

  it("asks for an option when the service has several", async () => {
    const fetch = api();
    await openSheet();
    await chooseService(massage.id);
    expect(screen.getByText("Choose an option to see free times.")).toBeOnTheScreen();
    expect(screen.getByTestId("option-opt-30")).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Heat pack" })).toHaveProp("accessibilityHint", "Free");
    fireEvent.press(screen.getByRole("tab", { name: "Exact time" }));
    fireEvent.changeText(screen.getByTestId("new-booking-exact-time"), "15:00");
    await chooseCustomer();
    create();
    expect(await screen.findByText("Choose an option")).toBeOnTheScreen();
    expect(posts(fetch)).toHaveLength(0);
    fireEvent.press(screen.getByTestId("option-opt-60"));
    expect(screen.queryByText("Choose an option")).toBeNull();
    expect(summary()).toHaveTextContent("Thu, 15 Oct, 15:00 · 1 h · €50");
    fireEvent.press(screen.getByRole("tab", { name: "Free times" }));
    expect(await screen.findByTestId("slot-10:00")).toBeOnTheScreen();
  });

  it("changes the service, which clears the time and suits the payment to it", async () => {
    const fetch = api();
    await openSheet();
    await chooseService();
    await pickTime("10:00");
    expect(screen.getByTestId("payment-at_venue")).toBeChecked();
    expect(screen.getByTestId("payment-collect_online")).toBeEnabled();

    fireEvent.press(screen.getByRole("button", { name: "Change service" }));
    expect(screen.getByText("Physiotherapy")).toBeOnTheScreen();
    expect(screen.getByText("Massage")).toBeOnTheScreen();
    // Uncategorised services are just "Services".
    expect(screen.getByText("Services")).toBeOnTheScreen();
    expect(screen.getByTestId(`service-${assessment.id}`)).toBeChecked();
    expect(screen.getByTestId(`service-${checkIn.id}`)).toHaveTextContent(/15 min · private/);
    await chooseService(checkIn.id);
    expect(screen.queryByTestId("service-chosen")).toHaveTextContent(/Free check-in/);
    // A free service: nothing to pay, no option, no add-ons, anyone; the time chosen before is gone.
    expect(screen.getByTestId("payment-none")).toBeChecked();
    expect(screen.getByTestId("payment-at_venue")).toBeDisabled();
    expect(screen.getByTestId("payment-collect_online")).toBeDisabled();
    expect(screen.queryByText("Option")).toBeNull();
    // It needs nobody in particular, so anyone can do it.
    expect(screen.getByRole("radio", { name: "Any therapist" })).toBeChecked();
    expect(summary()).toHaveTextContent("No time yet · 15 min · Free");
    // The assessment's own question isn't asked for it.
    expect(screen.queryByText("Which knee?")).toBeNull();

    fireEvent.press(screen.getByTestId("service-chosen"));
    expect(screen.getByTestId(`service-${massage.id}`)).toBeOnTheScreen();
    await chooseService(checkIn.id);

    await pickTime("10:00");
    await chooseCustomer();
    fireEvent(screen.getByTestId("notify-customer"), "valueChange", false);
    create();
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(postedBody(fetch)).toMatchObject({
      serviceId: checkIn.id,
      optionId: null,
      addonIds: [],
      paymentMode: "none",
      notifyCustomer: false,
      answers: {},
      internalNotes: null,
    });
  });

  it("removes an add-on again", async () => {
    api();
    await openSheet();
    await chooseService();
    const taping = screen.getByRole("checkbox", { name: "Taping · +10 min" });
    fireEvent.press(taping);
    fireEvent.press(taping);
    expect(taping).not.toBeChecked();
    expect(summary()).toHaveTextContent("No time yet · 1 h 30 min · €95");
  });

  it("checks answers that are given, but needs none", async () => {
    const fetch = api();
    await openSheet();
    await chooseService();
    await pickTime("10:00");
    await chooseCustomer();
    fireEvent.changeText(screen.getByTestId(`answer-${ids.question2}`), "not-an-email");
    create();
    expect(await screen.findByText("Enter a valid email address")).toBeOnTheScreen();
    expect(posts(fetch)).toHaveLength(0);

    // Choosing a select answer twice clears it.
    fireEvent.press(screen.getByRole("radio", { name: "Right" }));
    expect(screen.getByRole("radio", { name: "Right" })).toBeChecked();
    fireEvent.press(screen.getByRole("radio", { name: "Right" }));
    expect(screen.getByRole("radio", { name: "Right" })).not.toBeChecked();

    fireEvent.changeText(screen.getByTestId(`answer-${ids.question2}`), "");
    create();
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(postedBody(fetch)).toMatchObject({ answers: {} });
  });

  it("finds a patient by search, or adds a new one from what was typed", async () => {
    const phoneOnly = { ...customerSparse, id: "cust-phone", name: "Pat Phone", phone: "+353 87 555 0100" };
    let results: unknown[] = [customer, phoneOnly];
    const fetch = api({ customers: () => ({ items: results, nextCursor: null }) });
    await openSheet();
    await chooseService();
    await pickTime("10:00");

    const search = screen.getByTestId("customer-search");
    expect(screen.getByLabelText("Find a patient")).toBeOnTheScreen();
    expect(await screen.findByTestId(`customer-${ids.customer}`)).toHaveTextContent(/rowan@example.test/);
    expect(screen.getByTestId("customer-cust-phone")).toHaveTextContent(/\+353 87 555 0100/);
    results = [];
    fireEvent.changeText(search, "Casey Nobody");
    expect(await screen.findByText("No patients found.")).toBeOnTheScreen();
    expect(
      fetch.mock.calls.some(([url]) => new URL(String(url)).searchParams.get("q") === "Casey Nobody"),
    ).toBe(true);

    fireEvent.press(screen.getByRole("button", { name: "New patient: “Casey Nobody”" }));
    const box = within(screen.getByTestId("new-customer"));
    expect(box.getByTestId("new-customer-name")).toHaveDisplayValue("Casey Nobody");
    expect(box.getByLabelText("Phone (optional)")).toBeOnTheScreen();
    fireEvent.changeText(box.getByTestId("new-customer-name"), " ");
    fireEvent.changeText(box.getByTestId("new-customer-email"), "casey@");
    fireEvent.changeText(box.getByTestId("new-customer-phone"), "call me");
    create();
    expect(await screen.findByText("Enter a name")).toBeOnTheScreen();
    expect(screen.getByText("Enter a valid email")).toBeOnTheScreen();
    expect(screen.getByText("Enter a valid phone number")).toBeOnTheScreen();
    expect(posts(fetch)).toHaveLength(0);

    fireEvent.changeText(box.getByTestId("new-customer-name"), " Casey Nobody ");
    fireEvent.changeText(box.getByTestId("new-customer-email"), " casey@example.test ");
    fireEvent.changeText(box.getByTestId("new-customer-phone"), "");
    create();
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(postedBody(fetch)).toMatchObject({
      customerId: null,
      customer: { name: "Casey Nobody", email: "casey@example.test", phone: null },
    });
  });

  it("starts a new patient from a typed email, and goes back to searching", async () => {
    api({ customers: () => ({ items: [], nextCursor: null }) });
    await openSheet();
    fireEvent.changeText(await screen.findByTestId("customer-search"), "sam@example.test");
    fireEvent.press(await screen.findByRole("button", { name: "New patient: “sam@example.test”" }));
    expect(screen.getByTestId("new-customer-email")).toHaveDisplayValue("sam@example.test");
    expect(screen.getByTestId("new-customer-name")).toHaveDisplayValue("");
    fireEvent.press(screen.getByRole("button", { name: "Search existing" }));
    expect(screen.getByTestId("customer-search")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("new-customer-button"));
    expect(screen.getByTestId("new-customer")).toBeOnTheScreen();
  });

  it("opened for a patient, has them chosen already", async () => {
    const fetch = api();
    const rowan = { id: ids.customer, name: "Rowan Example", email: "rowan@example.test", phone: null };
    await openSheet({ customer: rowan, date: "2026-10-01" }, { section: "customers" });
    expect(await screen.findByTestId(`customer-${ids.customer}`)).toBeChecked();
    // No search until they type one.
    expect(calls(fetch)).not.toContain(`GET ${B}/customers`);
    fireEvent.changeText(screen.getByTestId("customer-search"), "Rowan");
    await waitFor(() => expect(calls(fetch)).toContain(`GET ${B}/customers`));
    fireEvent.changeText(screen.getByTestId("customer-search"), "");
    expect(screen.getByTestId(`customer-${ids.customer}`)).toBeChecked();
    await chooseService();
    // A date in the past becomes today.
    expect(within(screen.getByTestId("new-booking-date")).getByTestId(`date-${TODAY}`)).toBeChecked();
    await pickTime("10:00");
    create();
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(postedBody(fetch)).toMatchObject({ customerId: ids.customer, customer: null });
  });

  it("jumps to the next day with free times", async () => {
    const fetch = api({
      extra: (method, path) =>
        method === "GET" && path === `${B}/availability`
          ? { ...week, days: [{ date: TODAY, slots: [], opensAt: null, held: false }, ...week.days.slice(1)] }
          : undefined,
    });
    await openSheet();
    await chooseService();
    expect(await screen.findByTestId("no-free-times")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Next available: Fri, 16 Oct" }));
    expect(screen.getByTestId(`date-${TOMORROW}`)).toBeChecked();
    await pickTime("09:00");
    await chooseCustomer();
    create();
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(postedBody(fetch)).toMatchObject({ start: at(TOMORROW, "09:00") });
  });

  it("follows the business's settings: payments not connected, a phone needed for new patients", async () => {
    const fetch = api();
    await openSheet(undefined, {
      business: {
        ...testBusiness,
        paymentsEnabled: false,
        policies: { ...testBusiness.policies, requireCustomerPhone: true },
      },
    });
    await chooseService();
    expect(screen.getByRole("radio", { name: "Online, Connect payments first" })).toBeDisabled();
    fireEvent.press(screen.getByTestId("payment-none"));
    expect(screen.getByTestId("payment-none")).toBeChecked();
    fireEvent.press(screen.getByTestId("payment-at_venue"));
    expect(screen.getByTestId("payment-at_venue")).toBeChecked();
    fireEvent.press(screen.getByTestId("new-customer-button"));
    expect(screen.getByLabelText("Phone")).toBeOnTheScreen();
    await pickTime("10:00");
    fireEvent.changeText(screen.getByTestId("new-customer-name"), "Pat");
    fireEvent.changeText(screen.getByTestId("new-customer-phone"), "+353 87 555 0100");
    create();
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(postedBody(fetch)).toMatchObject({
      paymentMode: "at_venue",
      customer: { name: "Pat", email: null, phone: "+353 87 555 0100" },
    });
  });

  it("leaves the calendar to the server when staff book (their own)", async () => {
    const fetch = api();
    await openSheet(undefined, { role: "staff" });
    await chooseService();
    await pickTime("10:00");
    await chooseCustomer();
    create();
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(postedBody(fetch)).toMatchObject({ resourceIds: null });
  });

  describe("paid online", () => {
    async function bookOnline(booking: CreatedBooking) {
      const fetch = api({ create: () => booking });
      const app = await openSheet();
      await chooseService();
      await pickTime("10:00");
      await chooseCustomer();
      fireEvent.press(screen.getByTestId("payment-collect_online"));
      expect(screen.getByTestId("payment-collect_online")).toBeChecked();
      create();
      await waitFor(() => expect(posts(fetch)).toHaveLength(1));
      expect(postedBody(fetch)).toMatchObject({ paymentMode: "collect_online" });
      return app;
    }

    const held = created({
      status: "held",
      checkoutUrl: "https://checkout.stripe.test/c/pay_9",
      holdExpiresAt: "2026-10-15T09:30:00+01:00",
      depositCents: 2000,
      customer: { ...bookingSparse.customer, email: "rowan@example.test" },
    });

    it("shows the payment link to share, emailed to them, and opens the appointment", async () => {
      const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
      const app = await bookOnline(held);
      const view = await screen.findByTestId("held-for-payment");
      expect(screen.getByText("Appointment held for payment")).toBeOnTheScreen();
      expect(screen.queryByTestId("create-booking")).toBeNull();
      expect(view).toHaveTextContent(/Rowan Example · Initial assessment · Thu, 15 Oct, 10:00/);
      expect(
        screen.getByText(
          "The time is held until 09:30. It's confirmed as soon as the patient pays the €20 deposit; after that the time is released.",
        ),
      ).toBeOnTheScreen();
      expect(screen.getByText("https://checkout.stripe.test/c/pay_9")).toBeOnTheScreen();
      expect(
        screen.getByText("We've emailed this link to rowan@example.test. You can also share it another way."),
      ).toBeOnTheScreen();

      fireEvent.press(screen.getByRole("button", { name: "Share payment link" }));
      expect(share).toHaveBeenCalledWith({
        message: "https://checkout.stripe.test/c/pay_9",
        url: "https://checkout.stripe.test/c/pay_9",
      });

      fireEvent.press(screen.getByRole("button", { name: "View appointment" }));
      expect(await screen.findByTestId("booking-page")).toBeOnTheScreen();
      expect(app.getPathname()).toBe(`/dashboard/lumen-physio/bookings/${held.id}`);
      expect(screen.queryByTestId("new-booking-sheet")).toBeNull();
    });

    it("asks to share the link when it wasn't emailed, and closes when done", async () => {
      const failure = new Error("No share sheet");
      jest.spyOn(Share, "share").mockRejectedValue(failure);
      const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
      await bookOnline(
        created({
          status: "held",
          checkoutUrl: "https://checkout.stripe.test/c/pay_9",
          holdExpiresAt: null,
          depositCents: null,
          priceCents: 9500,
          customer: { ...bookingSparse.customer, email: null },
        }),
      );
      expect(await screen.findByText("Share the link with the patient by text or email.")).toBeOnTheScreen();
      expect(screen.queryByText(/The time is held until/)).toBeNull();
      // A share sheet that fails is logged, and nothing else happens.
      fireEvent.press(screen.getByRole("button", { name: "Share payment link" }));
      await waitFor(() => expect(logged).toHaveBeenCalledWith("[bookanything]", failure, ""));
      expect(screen.getByTestId("held-for-payment")).toBeOnTheScreen();
      fireEvent.press(screen.getByRole("button", { name: "Done" }));
      await waitFor(() => expect(screen.queryByTestId("new-booking-sheet")).toBeNull());
    });

    it("says how long it's held when there's no link to show", async () => {
      await bookOnline(created({ status: "held", checkoutUrl: null }));
      expect(
        await screen.findByText("Appointment created. Held for 30 min while the patient pays."),
      ).toBeOnTheScreen();
      await waitFor(() => expect(screen.queryByTestId("new-booking-sheet")).toBeNull());
    });
  });

  describe("when creating fails", () => {
    async function fillAndCreate(create: (body: unknown) => unknown) {
      const fetch = api({ create });
      await openSheet();
      await chooseService();
      await pickTime("10:00");
      await chooseCustomer();
      fireEvent.press(screen.getByTestId("create-booking"));
      await waitFor(() => expect(posts(fetch)).toHaveLength(1));
      return fetch;
    }

    it("asks for another time when it was just taken", async () => {
      await fillAndCreate(() => apiError(409, "SLOT_UNAVAILABLE", "Taken"));
      expect(await screen.findByText("That time was just taken. Pick another one.")).toBeOnTheScreen();
      expect(screen.getByText("That time is no longer free.")).toBeOnTheScreen();
      expect(summary()).toHaveTextContent(/^No time yet/);
      expect(screen.getByTestId("new-booking-sheet")).toBeOnTheScreen();
    });

    it("explains the plan limit", async () => {
      await fillAndCreate(() =>
        apiError(402, "PLAN_LIMIT_REACHED", "You've reached your plan's 100 bookings."),
      );
      expect(
        await screen.findByText(
          "You've reached your plan's 100 bookings. Upgrade in Settings → Billing to keep taking appointments.",
        ),
      ).toBeOnTheScreen();
    });

    it("points at the payment choice when payments aren't connected", async () => {
      await fillAndCreate(() => apiError(409, "PAYMENTS_NOT_CONFIGURED", "No Stripe"));
      expect(
        await screen.findByText(
          "Online payments aren't set up yet. Choose “At venue” or connect payments in Settings.",
        ),
      ).toBeOnTheScreen();
    });

    it("puts field errors on the form", async () => {
      await fillAndCreate(() =>
        json(
          {
            error: {
              code: "INVALID_REQUEST",
              message: "Check the notes",
              fields: { internalNotes: "Too long" },
            },
          },
          422,
        ),
      );
      // Notes have no error line of their own: the server's message is toasted.
      expect(await screen.findByText("Check the notes")).toBeOnTheScreen();
    });

    it("shows the server's message, and retries with the same idempotency key", async () => {
      let n = 0;
      const fetch = await fillAndCreate(() => {
        n += 1;
        return n === 1 ? apiError(500, "INTERNAL", "The server fell over") : created();
      });
      expect(await screen.findAllByText("The server fell over")).not.toHaveLength(0);
      create();
      await waitFor(() => expect(posts(fetch)).toHaveLength(2));
      const key = (i: number) =>
        ((posts(fetch)[i]![1] as RequestInit).headers as Record<string, string>)["Idempotency-Key"];
      expect(key(1)).toBe(key(0));
      await waitFor(() => expect(screen.queryByTestId("new-booking-sheet")).toBeNull());
    });
  });

  describe("loading", () => {
    it("shows a placeholder while services load", async () => {
      mockApi(() => pending());
      await openSheet();
      expect(sheet().getByRole("progressbar", { name: "Loading" })).toBeOnTheScreen();
      expect(screen.getByTestId("create-booking")).toBeDisabled();
    });

    it("shows what failed to load, and retries", async () => {
      let fail = true;
      api({
        extra: (_m, path) =>
          path === `${B}/resources` && fail ? apiError(500, "INTERNAL", "Resources unavailable") : undefined,
      });
      await openSheet();
      expect(await screen.findByText("Resources unavailable")).toBeOnTheScreen();
      expect(screen.getByTestId("create-booking")).toBeDisabled();
      fail = false;
      await act(async () => {
        fireEvent.press(screen.getByRole("button", { name: /Try again|Retry/ }));
        await Promise.resolve();
      });
      expect(await screen.findByTestId(`service-${assessment.id}`)).toBeOnTheScreen();
    });

    it("asks for a service first when there are none", async () => {
      api({ extra: (_m, path) => (path === `${B}/services` ? [retired] : undefined) });
      await openSheet();
      expect(
        await screen.findByText("Add a service first. Every appointment is for a service."),
      ).toBeOnTheScreen();
    });

    it("closes", async () => {
      api();
      await openSheet();
      fireEvent.press(sheet().getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByTestId("new-booking-sheet")).toBeNull());
    });
  });
});
