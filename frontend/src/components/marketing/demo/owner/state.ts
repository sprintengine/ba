/** The owner demo's world: Lumen Physiotherapy's dashboard, as the cursor changes it. */

export type Route = "overview" | "services" | "therapists" | "calendar";

export type DemoService = {
  id: string;
  name: string;
  category: string;
  duration: string;
  price: string;
  color: string;
  options?: number;
  /** Just created: highlighted in the list. */
  fresh?: boolean;
};

export type PaymentChoice = "full" | "deposit" | "at_venue" | "free";

export type ServiceDraft = {
  name: string;
  category: string;
  description: string;
  color: string;
  duration: string;
  price: string;
  payment: PaymentChoice;
  /** The sheet body scrolled down to timing and price. */
  scrolled: boolean;
};

export type TimeRange = { start: string; end: string };
export type DayHours = { day: string; ranges: TimeRange[] };

export type CalendarBooking = {
  id: string;
  /** Column index in CALENDAR_RESOURCES. */
  columns: number[];
  start: number;
  end: number;
  customer: string;
  service: string;
  color: string;
  fresh?: boolean;
};

export type ChatMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; tools?: string[] }
  | { role: "proposal"; status: "pending" | "confirmed" };

export type OwnerState = {
  route: Route;
  sheet: ServiceDraft | null;
  services: DemoService[];
  hours: DayHours[];
  hoursDirty: boolean;
  /** How far the main panel is scrolled (px). */
  scroll: number;
  bookings: CalendarBooking[];
  drawer: string | null;
  bo: { open: boolean; input: string; messages: ChatMessage[]; thinking: boolean };
  toast: { title: string; description?: string } | null;
};

export const SERVICE_COLORS = [
  "#5b4ae0",
  "#2a78d6",
  "#0e7c70",
  "#c2417a",
  "#d9622b",
  "#b7791f",
  "#3f8f3a",
  "#5b6472",
] as const;

export const BUSINESS = { name: "Lumen Physiotherapy", slug: "lumen-physio", color: "#5b4ae0" };

const SERVICES: DemoService[] = [
  {
    id: "initial",
    name: "Initial assessment",
    category: "Physiotherapy",
    duration: "1 h",
    price: "€70",
    color: "#5b4ae0",
  },
  {
    id: "follow-up",
    name: "Follow-up treatment",
    category: "Physiotherapy",
    duration: "45 min",
    price: "€60",
    color: "#a99bff",
  },
  {
    id: "massage",
    name: "Sports massage",
    category: "Massage",
    duration: "30 min–1 h",
    price: "from €40",
    color: "#0ea5e9",
    options: 2,
  },
];

const WEEK: DayHours[] = [
  { day: "Monday", ranges: [{ start: "09:00", end: "17:30" }] },
  { day: "Tuesday", ranges: [{ start: "09:00", end: "17:30" }] },
  { day: "Wednesday", ranges: [{ start: "09:00", end: "17:30" }] },
  { day: "Thursday", ranges: [{ start: "09:00", end: "17:30" }] },
  { day: "Friday", ranges: [{ start: "09:00", end: "13:00" }] },
  { day: "Saturday", ranges: [] },
  { day: "Sunday", ranges: [] },
];

export const CALENDAR_RESOURCES = [
  { name: "Sam Rivers", kind: "person", color: "#0ea5e9" },
  { name: "Casey Lane", kind: "person", color: "#8b5cf6" },
  { name: "Treatment room 1", kind: "space", color: "#f59e0b" },
  { name: "Treatment room 2", kind: "space", color: "#10b981" },
] as const;

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

const BOOKINGS: CalendarBooking[] = [
  {
    id: "b1",
    columns: [0, 2],
    start: h(9, 30),
    end: h(10, 15),
    customer: "Toby Marsh",
    service: "Follow-up treatment",
    color: "#a99bff",
  },
  {
    id: "b2",
    columns: [1, 3],
    start: h(10),
    end: h(11),
    customer: "Avery Lane",
    service: "Initial assessment",
    color: "#5b4ae0",
  },
  {
    id: "b3",
    columns: [0, 3],
    start: h(11, 30),
    end: h(12, 30),
    customer: "Casey Rowe",
    service: "Initial assessment",
    color: "#5b4ae0",
  },
  {
    id: "b4",
    columns: [1, 2],
    start: h(12),
    end: h(12, 45),
    customer: "Kit Fairley",
    service: "Follow-up treatment",
    color: "#a99bff",
  },
  {
    id: "b5",
    columns: [0, 2],
    start: h(14),
    end: h(15),
    customer: "Remy Stroud",
    service: "Sports massage",
    color: "#0ea5e9",
  },
];

/** The booking that arrives while the owner watches, from the customer demo below. */
export const NEW_BOOKING: CalendarBooking = {
  id: "new",
  columns: [0, 3],
  start: h(15, 30),
  end: h(16, 10),
  customer: "Jordan Pike",
  service: "Dry needling",
  color: SERVICE_COLORS[2],
  fresh: true,
};

export const EMPTY_DRAFT: ServiceDraft = {
  name: "",
  category: "",
  description: "",
  color: SERVICE_COLORS[0],
  duration: "30",
  price: "",
  payment: "at_venue",
  scrolled: false,
};

export const INITIAL: OwnerState = {
  route: "overview",
  sheet: null,
  services: SERVICES,
  hours: WEEK,
  hoursDirty: false,
  scroll: 0,
  bookings: BOOKINGS,
  drawer: null,
  bo: { open: false, input: "", messages: [], thinking: false },
  toast: null,
};

/* ---------- changes the script applies ---------- */

export const go =
  (route: Route) =>
  (s: OwnerState): OwnerState => ({ ...s, route, scroll: 0, toast: null });

export const editDraft =
  (patch: Partial<ServiceDraft>) =>
  (s: OwnerState): OwnerState =>
    s.sheet ? { ...s, sheet: { ...s.sheet, ...patch } } : s;

export function createService(s: OwnerState): OwnerState {
  const d = s.sheet;
  if (!d) return s;
  const minutes = Number(d.duration) || 30;
  const service: DemoService = {
    id: "new",
    name: d.name,
    category: d.category || "Physiotherapy",
    duration: minutes >= 60 ? `${String(minutes / 60)} h` : `${String(minutes)} min`,
    price: d.price ? `€${d.price}` : "Free",
    color: d.color,
    fresh: true,
  };
  return {
    ...s,
    sheet: null,
    services: [...s.services.slice(0, 2), service, ...s.services.slice(2)],
    toast: { title: "Service created", description: `${d.name} is on your booking page.` },
  };
}

export const setDay =
  (index: number, ranges: TimeRange[]) =>
  (s: OwnerState): OwnerState => ({
    ...s,
    hoursDirty: true,
    hours: s.hours.map((d, i) => (i === index ? { ...d, ranges } : d)),
  });

export const saveHours = (s: OwnerState): OwnerState => ({
  ...s,
  hoursDirty: false,
  toast: { title: "Hours saved", description: "Sam Rivers now takes bookings on Saturday mornings." },
});

/** The state after the first chapter: the new service exists, nothing is open. */
export const AFTER_SERVICE: OwnerState = {
  ...INITIAL,
  route: "services",
  services: [
    ...SERVICES.slice(0, 2),
    {
      id: "new",
      name: "Dry needling",
      category: "Physiotherapy",
      duration: "40 min",
      price: "€55",
      color: SERVICE_COLORS[2],
    },
    ...SERVICES.slice(2),
  ],
};

export const AFTER_HOURS: OwnerState = {
  ...AFTER_SERVICE,
  route: "therapists",
  hours: WEEK.map((d, i) => (i === 5 ? { ...d, ranges: [{ start: "09:00", end: "13:00" }] } : d)),
};
