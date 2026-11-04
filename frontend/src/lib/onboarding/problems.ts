/** Turns setup errors into the review step's "fix these first" list: which section, which item, and a label. */
import type { BusinessSetup } from "@/lib/api/types";
import { DAY_LONG, isWeekday } from "./hours";

export type SetupSection = "business" | "resources" | "services" | "groups" | "questions";

export type SetupProblem = {
  path: string;
  message: string;
  section: SetupSection;
  /** Index of the item within its section list (to expand it), if any. */
  index: number | null;
  /** Human label, e.g. "Full valet · Deposit". */
  label: string;
};

type ListName = "resources" | "services" | "customerGroups" | "questions";

const SECTION_OF: Record<ListName, SetupSection> = {
  resources: "resources",
  services: "services",
  customerGroups: "groups",
  questions: "questions",
};

const FIELD_LABELS: Partial<Record<string, string>> = {
  name: "Name",
  slug: "Web address",
  timezone: "Timezone",
  currency: "Currency",
  description: "Description",
  durationMinutes: "Duration",
  priceCents: "Price",
  depositCents: "Deposit",
  paymentMode: "Payment",
  capacity: "Capacity",
  category: "Category",
  label: "Question",
  options: "Options",
  serviceName: "Service",
  kind: "Type",
  quantity: "Quantity",
  resourceKeys: "Pool",
  startTime: "Opening time",
  endTime: "Closing time",
  helpText: "Help text",
};

const TOP_LABELS: Partial<Record<string, string>> = {
  name: "Business name",
  description: "Short description",
  "branding.primaryColor": "Brand colour",
};

const PART_LABELS: Partial<Record<string, string>> = {
  options: "Option",
  addons: "Add-on",
  requirements: "Requirement",
};

const ITEM_PATH = /^(resources|services|customerGroups|questions)\[(\d+)\](?:\.(.*))?$/;
const PART_PATH = /^(options|addons|requirements)\[(\d+)\]/;
const HOURS_PATH = /^weeklyHours\[(\d+)\]/;

export function describeProblem(setup: BusinessSetup, path: string, message: string): SetupProblem {
  const [, list, idx = "0", rest = ""] = ITEM_PATH.exec(path) ?? [];
  if (isListName(list)) {
    const index = Number(idx);
    const label = joinLabel(itemName(setup, list, index), leafLabel(setup, list, index, rest));
    return { path, message, section: SECTION_OF[list], index, label };
  }
  return { path, message, section: sectionOf(path), index: null, label: listLabel(setup, path) };
}

/** The item's own name, or "Service 2" while it has none. */
function itemName(setup: BusinessSetup, list: ListName, index: number): string {
  const n = index + 1;
  switch (list) {
    case "resources":
      return setup.resources[index]?.name.trim() || `${setup.vocabulary.resource} ${n}`;
    case "services":
      return setup.services[index]?.name.trim() || `Service ${n}`;
    case "customerGroups":
      return setup.customerGroups[index]?.name.trim() || `Group ${n}`;
    case "questions":
      return truncate(setup.questions[index]?.label.trim() || `Question ${n}`, 40);
  }
}

/** The field within the item: "Deposit", "Option 2 · Price", or "Sunday · Closing time" for opening hours. */
function leafLabel(setup: BusinessSetup, list: ListName, index: number, rest: string): string {
  const field = fieldLabel(rest);
  if (list === "resources") {
    const hours = HOURS_PATH.exec(rest);
    const day = hours ? setup.resources[index]?.weeklyHours[Number(hours[1])]?.dayOfWeek : undefined;
    if (day !== undefined && isWeekday(day)) return `${DAY_LONG[day]} · ${field}`;
  }
  const [, part = "", n = "0"] = PART_PATH.exec(rest) ?? [];
  const kind = PART_LABELS[part];
  return kind ? `${kind} ${Number(n) + 1} · ${field}` : field;
}

/** The label of the last segment of [rest] ("options[1].priceCents" → "Price"), or "" for the item itself. */
function fieldLabel(rest: string): string {
  if (!rest) return "";
  const last = (rest.split(".").at(-1) ?? rest).replace(/\[\d+\]$/, "");
  return FIELD_LABELS[last] ?? last;
}

function isListName(name: string | undefined): name is ListName {
  return name !== undefined && name in SECTION_OF;
}

function sectionOf(path: string): SetupSection {
  for (const list of Object.keys(SECTION_OF) as ListName[])
    if (path.startsWith(list)) return SECTION_OF[list];
  return "business";
}

/** Labels for errors about a whole list ("Services") or a business field ("Business name", "Wording · bays"). */
function listLabel(setup: BusinessSetup, path: string): string {
  if (path.startsWith("resources")) return setup.vocabulary.resources;
  if (path.startsWith("services")) return "Services";
  if (path.startsWith("customerGroups")) return "Customer groups";
  if (path.startsWith("questions")) return "Questions";
  if (path.startsWith("vocabulary.")) return `Wording · ${path.slice("vocabulary.".length)}`;
  return TOP_LABELS[path] ?? FIELD_LABELS[path] ?? path;
}

function joinLabel(a: string, b: string): string {
  return b ? `${a} · ${b}` : a;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
