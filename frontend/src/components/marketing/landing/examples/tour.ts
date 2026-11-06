import type { Example } from "./fixtures";

/** What the example shows at one moment. */
export type TourView = {
  /** The appointment type picked in the list. */
  type: string | null;
  /** The person picked in the list. */
  person: string | null;
  /** How far the new booking has got. */
  draft: "open" | "time" | null;
  booked: boolean;
  say: string;
};

/** One thing the cursor does: where it goes, what its click changes, and how long the result stays up. */
export type TourStep = { target: string; hold: number; change: Partial<TourView> };

export const START: Omit<TourView, "say"> = { type: null, person: null, draft: null, booked: false };

export const typeTarget = (id: string) => `type-${id}`;
export const personTarget = (id: string) => `person-${id}`;

/** The same walk for every business: two appointment types, a person where there's a choice of people, a booking. */
export function tourFor({ tour }: Example): TourStep[] {
  const [first, second] = tour.types;
  const { booking } = tour;
  return [
    { target: typeTarget(first.id), hold: 2600, change: { type: first.id, say: first.say } },
    { target: typeTarget(second.id), hold: 2600, change: { type: second.id, say: second.say } },
    ...(tour.person
      ? [
          {
            target: personTarget(tour.person.id),
            hold: 2600,
            change: { type: null, person: tour.person.id, say: tour.person.say },
          },
        ]
      : []),
    {
      target: "new-booking",
      hold: 1500,
      change: { type: null, person: null, draft: "open" as const, say: booking.asks },
    },
    { target: "draft-time", hold: 1100, change: { draft: "time" as const } },
    { target: "draft-book", hold: 4200, change: { draft: null, booked: true, say: booking.says } },
  ];
}

export const applyStep = (view: TourView, step: TourStep): TourView => ({ ...view, ...step.change });

/** Where the walk ends, which is also the still picture with reduced motion: the booking on the calendar. */
export const endOfTour = (steps: TourStep[], intro: string): TourView =>
  steps.reduce<TourView>(applyStep, { ...START, say: intro });
