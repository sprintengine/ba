/**
 * Which resources the calendar shows: its one picker's choices, in the URL's `?resource=`. People come first; a space
 * or a piece of equipment is a column only when asked for, or when it holds a booking that no shown person has, so
 * nothing on the day goes missing.
 */
import type { ResourceKind } from "@/lib/api/types";

export type ResourceChoice =
  { type: "people" } | { type: "spaces" } | { type: "everything" } | { type: "ids"; ids: string[] };

type ResourceLike = { id: string; name: string; kind: ResourceKind };
type BookingLike = { resources: { id: string }[] };

const EVERYTHING = "everything";
const SPACES = "spaces";

/** Read `?resource=` as `parseCalendarParams` gives it: "all" (the default), a keyword, or ids joined with commas. */
export function parseResourceChoice(value: string): ResourceChoice {
  if (value === "all" || value === "") return { type: "people" };
  if (value === EVERYTHING) return { type: "everything" };
  if (value === SPACES) return { type: "spaces" };
  return { type: "ids", ids: value.split(",").filter(Boolean) };
}

/** The value for `?resource=`; `null` drops it, for the default. */
export function resourceChoiceParam(choice: ResourceChoice): string | null {
  switch (choice.type) {
    case "people":
      return null;
    case "everything":
      return EVERYTHING;
    case "spaces":
      return SPACES;
    case "ids":
      return choice.ids.length > 0 ? choice.ids.join(",") : null;
  }
}

/** People first, otherwise in the order given. */
export function peopleFirst<R extends ResourceLike>(resources: R[]): R[] {
  return [...resources.filter((r) => r.kind === "person"), ...resources.filter((r) => r.kind !== "person")];
}

/**
 * The resources to show as columns, people first. Ids that no longer exist drop out; if none are left the choice falls
 * back to the default. The default shows every person, plus any other resource holding a booking with no person on it.
 */
export function chosenResources<R extends ResourceLike>(
  choice: ResourceChoice,
  resources: R[],
  bookings: BookingLike[],
): R[] {
  const ordered = peopleFirst(resources);
  if (choice.type === "everything") return ordered;
  if (choice.type === "spaces") {
    const others = ordered.filter((r) => r.kind !== "person");
    return others.length > 0 ? others : ordered;
  }
  if (choice.type === "ids") {
    const picked = ordered.filter((r) => choice.ids.includes(r.id));
    if (picked.length > 0) return picked;
  }
  const people = ordered.filter((r) => r.kind === "person");
  if (people.length === 0) return ordered;
  const personIds = new Set(people.map((r) => r.id));
  const held = new Set(
    bookings
      .filter((b) => !b.resources.some((x) => personIds.has(x.id)))
      .flatMap((b) => b.resources.map((x) => x.id)),
  );
  return [...people, ...ordered.filter((r) => r.kind !== "person" && held.has(r.id))];
}

/** The picker's label: what is showing, in words. `plural` is the business's word for all of its resources. */
export function resourceChoiceLabel(
  choice: ResourceChoice,
  shown: ResourceLike[],
  all: ResourceLike[],
  plural: string,
): string {
  const hasPeople = all.some((r) => r.kind === "person");
  const hasOthers = all.some((r) => r.kind !== "person");
  if (!hasPeople || !hasOthers) {
    // The default word only fits a mix: a team of people are people.
    if (choice.type !== "ids" || shown.length === all.length)
      return hasPeople && plural === "resources" ? "All people" : `All ${plural}`;
  }
  if (choice.type === "everything") return "All people and spaces";
  if (choice.type === "spaces") return "All spaces";
  if (choice.type === "ids" && shown.length <= 2) return shown.map((r) => r.name).join(", ");
  if (choice.type === "ids") return `${shown.length} selected`;
  const extra = shown.filter((r) => r.kind !== "person");
  const first = extra[0];
  if (!first) return "All people";
  return extra.length === 1 ? `All people +${first.name}` : `All people +${extra.length}`;
}
