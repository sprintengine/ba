import type { DemoChapter, DemoStep } from "../engine/types";
import {
  AFTER_HOURS,
  AFTER_SERVICE,
  EMPTY_DRAFT,
  INITIAL,
  NEW_BOOKING,
  SERVICE_COLORS,
  createService,
  editDraft,
  go,
  saveHours,
  setDay,
  type OwnerState,
} from "./state";

type Step = DemoStep<OwnerState>;

const SEGMENT = {
  overview: "",
  services: "/services",
  therapists: "/resources",
  calendar: "/calendar",
} as const;
const url = (s: OwnerState) => `bookanything.ie/dashboard/lumen-physio${SEGMENT[s.route]}`;

const dismissToast: Step = { kind: "set", apply: (s) => ({ ...s, toast: null }) };

const addService: DemoChapter<OwnerState> = {
  id: "service",
  label: "Add a service",
  caption:
    "The owner adds a Dry needling service: name, category, description, colour, 40 minutes, €55 paid online.",
  url,
  initial: INITIAL,
  steps: [
    { kind: "wait", ms: 1600 },
    { kind: "move", target: "nav-calendar" },
    { kind: "click", target: "nav-services", apply: go("services") },
    { kind: "wait", ms: 500 },
    { kind: "click", target: "new-service", apply: (s) => ({ ...s, sheet: EMPTY_DRAFT }) },
    { kind: "wait", ms: 350 },
    { kind: "type", target: "svc-name", text: "Dry needling", apply: (s, name) => editDraft({ name })(s) },
    {
      kind: "type",
      target: "svc-category",
      text: "Physiotherapy",
      cps: 18,
      apply: (s, category) => editDraft({ category })(s),
    },
    {
      kind: "type",
      target: "svc-description",
      text: "Fine needles release tight, painful muscles.",
      cps: 22,
      apply: (s, description) => editDraft({ description })(s),
    },
    { kind: "click", target: "svc-color-2", apply: editDraft({ color: SERVICE_COLORS[2] }) },
    { kind: "set", apply: editDraft({ scrolled: true }) },
    { kind: "wait", ms: 700 },
    { kind: "click", target: "svc-duration", apply: editDraft({ duration: "" }) },
    { kind: "type", target: "svc-duration", text: "40", apply: (s, duration) => editDraft({ duration })(s) },
    { kind: "click", target: "pay-full", apply: editDraft({ payment: "full" }) },
    { kind: "type", target: "svc-price", text: "55", apply: (s, price) => editDraft({ price })(s) },
    { kind: "click", target: "svc-create", apply: createService },
    { kind: "wait", ms: 2200 },
    dismissToast,
  ],
};

const setHours: DemoChapter<OwnerState> = {
  id: "hours",
  label: "Set opening hours",
  caption: "The owner opens Saturday mornings for Sam Rivers, 09:00 to 13:00, and saves.",
  url,
  initial: AFTER_SERVICE,
  steps: [
    { kind: "click", target: "nav-therapists", apply: go("therapists") },
    { kind: "wait", ms: 500 },
    { kind: "click", target: "day-5-toggle", apply: setDay(5, [{ start: "09:00", end: "17:00" }]) },
    { kind: "click", target: "day-5-end", apply: setDay(5, [{ start: "09:00", end: "" }]) },
    {
      kind: "type",
      target: "day-5-end",
      text: "13:00",
      apply: (s, end) => setDay(5, [{ start: "09:00", end }])(s),
    },
    { kind: "set", apply: (s) => ({ ...s, scroll: 96 }) },
    { kind: "wait", ms: 700 },
    { kind: "click", target: "hours-save", apply: saveHours },
    { kind: "wait", ms: 2200 },
    dismissToast,
  ],
};

const bookingsArrive: DemoChapter<OwnerState> = {
  id: "calendar",
  label: "Bookings roll in",
  caption: "A client books Dry needling online; it lands in the calendar, paid, and the owner opens it.",
  url,
  initial: AFTER_HOURS,
  steps: [
    { kind: "click", target: "nav-calendar", apply: go("calendar") },
    { kind: "wait", ms: 1200 },
    {
      kind: "set",
      apply: (s) => ({
        ...s,
        bookings: [...s.bookings, NEW_BOOKING],
        toast: { title: "New booking · Jordan Pike", description: "Dry needling, today 15:30 · €55 paid" },
      }),
    },
    { kind: "wait", ms: 1600 },
    { kind: "click", target: "event-new", apply: (s) => ({ ...s, drawer: "new", toast: null }) },
    { kind: "wait", ms: 2600 },
  ],
};

const QUESTION = "Can you move Toby Marsh to Friday at 10?";

const askBo: DemoChapter<OwnerState> = {
  id: "bo",
  label: "Ask Bo",
  caption:
    "The owner asks Bo, the assistant, to move a booking; Bo checks, proposes the change, and moves it on Confirm.",
  url,
  initial: {
    ...AFTER_HOURS,
    route: "calendar",
    bookings: [...AFTER_HOURS.bookings, { ...NEW_BOOKING, fresh: false }],
  },
  steps: [
    { kind: "click", target: "bo-launcher", apply: (s) => ({ ...s, bo: { ...s.bo, open: true } }) },
    { kind: "wait", ms: 500 },
    { kind: "click", target: "bo-input" },
    {
      kind: "type",
      target: "bo-input",
      text: QUESTION,
      cps: 20,
      apply: (s, input) => ({ ...s, bo: { ...s.bo, input } }),
    },
    {
      kind: "click",
      target: "bo-send",
      apply: (s) => ({
        ...s,
        bo: { ...s.bo, input: "", thinking: true, messages: [{ role: "user", text: QUESTION }] },
      }),
    },
    { kind: "wait", ms: 1500 },
    {
      kind: "set",
      apply: (s) => ({
        ...s,
        bo: {
          ...s.bo,
          thinking: false,
          messages: [
            ...s.bo.messages,
            {
              role: "assistant",
              tools: ["Finding the booking", "Checking availability"],
              text: "Friday at 10:00 is free with Sam Rivers. Confirm and I'll move it and email Toby.",
            },
            { role: "proposal", status: "pending" },
          ],
        },
      }),
    },
    { kind: "wait", ms: 1000 },
    {
      kind: "click",
      target: "bo-confirm",
      apply: (s) => ({
        ...s,
        bookings: s.bookings.filter((b) => b.id !== "b1"),
        bo: {
          ...s.bo,
          messages: s.bo.messages.map((m) =>
            m.role === "proposal" ? { ...m, status: "confirmed" as const } : m,
          ),
        },
      }),
    },
    { kind: "wait", ms: 2600 },
  ],
};

export const OWNER_CHAPTERS = [addService, setHours, bookingsArrive, askBo] as const;
