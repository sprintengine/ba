/**
 * The example businesses behind the page's cards, in the shapes the real calendar draws. Nothing here is a customer:
 * every name and booking is made up, and the page says so.
 */
import type { Booking, Resource } from "@/lib/api/types";
import { minutesToTime, zonedToIso, type PlainDate } from "@/lib/format";
import type { ExampleSlug } from "./cards";

export const EXAMPLE_TZ = "Europe/Dublin";
export const EXAMPLE_LOCALE = "en-IE";

export type AppointmentType = {
  id: string;
  name: string;
  minutes: number;
  /** In euro; 0 is free. */
  price: number;
  color: string;
  /** Who does this one. */
  staff: string[];
};

/** Person, start, client, appointment type, room. */
type Entry = [who: string, at: string, client: string, type: string, room: string];

export type Example = {
  slug: ExampleSlug;
  /** On the calendar's corner, for the example's tile. */
  name: string;
  color: string;
  hours: [first: number, last: number];
  now: number;
  team: Resource[];
  types: AppointmentType[];
  day: Entry[];
  /** What the cursor shows: two appointment types, one person, and a booking. */
  tour: {
    types: [{ id: string; say: string }, { id: string; say: string }];
    person?: { id: string; say: string };
    booking: { entry: Entry; times: [string, string, string]; asks: string; says: string };
  };
};

const person = (id: string, name: string, color: string, sortOrder: number): Resource => ({
  id,
  kind: "person",
  name,
  description: null,
  color,
  capacity: 1,
  memberId: null,
  isActive: true,
  sortOrder,
});

const BLUE = "#0ea5e9";
const IRIS = "#5b4ae0";
const LILAC = "#a99bff";
const ORANGE = "#e0702f";
const GREEN = "#2f9e6e";
const ROSE = "#d6567f";

const type = (
  id: string,
  name: string,
  minutes: number,
  price: number,
  color: string,
  staff: string[],
): AppointmentType => ({ id, name, minutes, price, color, staff });

const HAIR: Example = {
  slug: "hair-salon",
  name: "Hair salon",
  color: "#b4573f",
  hours: [10, 17],
  now: 12 * 60 + 20,
  team: [
    person("shauna", "Shauna", ROSE, 0),
    person("ciara", "Ciara", LILAC, 1),
    person("mark", "Mark", BLUE, 2),
  ],
  types: [
    type("cut", "Cut and blow-dry", 45, 48, IRIS, ["shauna", "ciara", "mark"]),
    type("blow", "Blow-dry", 30, 28, LILAC, ["shauna", "ciara", "mark"]),
    type("colour", "Full colour", 120, 95, ROSE, ["shauna", "ciara"]),
    type("high", "Highlights", 150, 120, ORANGE, ["shauna"]),
    type("mens", "Men's cut", 30, 24, BLUE, ["ciara", "mark"]),
    type("kids", "Kids' cut", 30, 18, GREEN, ["shauna", "ciara", "mark"]),
  ],
  day: [
    ["shauna", "10:00", "Emma Doyle", "colour", "Chair 1"],
    ["shauna", "12:15", "Orla Reid", "cut", "Chair 1"],
    ["shauna", "13:30", "Helen Fox", "high", "Chair 1"],
    ["ciara", "10:00", "Grace Lynch", "cut", "Chair 2"],
    ["ciara", "11:00", "Tara Moran", "blow", "Chair 2"],
    ["ciara", "11:45", "Finn Moran", "kids", "Chair 2"],
    ["ciara", "13:00", "Anna Burke", "colour", "Chair 2"],
    ["mark", "10:00", "Conor Daly", "mens", "Chair 3"],
    ["mark", "10:45", "Paul Ryan", "mens", "Chair 3"],
    ["mark", "11:30", "Lucy Shaw", "cut", "Chair 3"],
    ["mark", "13:00", "Sean Hart", "mens", "Chair 3"],
    ["mark", "13:45", "Ben Shaw", "kids", "Chair 3"],
  ],
  tour: {
    types: [
      { id: "colour", say: "Full colour takes two hours, and only Shauna and Ciara do it." },
      { id: "mens", say: "Men's cuts go to Ciara and Mark. You choose who does what." },
    ],
    person: { id: "mark", say: "Mark's day, and the appointments he does." },
    booking: {
      entry: ["mark", "15:00", "Ruth Kenny", "cut", "Chair 3"],
      times: ["14:30", "15:00", "15:45"],
      asks: "A client books a cut and blow-dry with Mark.",
      says: "It's on the calendar, with Chair 3 held for it.",
    },
  },
};

const GP: Example = {
  slug: "gp-practice",
  name: "GP practice",
  color: "#1f7a5c",
  hours: [9, 13],
  now: 10 * 60 + 40,
  team: [
    person("nolan", "Dr Nolan", BLUE, 0),
    person("farrell", "Dr Farrell", LILAC, 1),
    person("kelly", "Nurse Kelly", GREEN, 2),
  ],
  types: [
    type("consult", "GP consultation", 15, 60, IRIS, ["nolan", "farrell"]),
    type("long", "Long consultation", 30, 90, BLUE, ["nolan", "farrell"]),
    type("review", "Medication review", 15, 40, LILAC, ["nolan", "farrell"]),
    type("nurse", "Nurse appointment", 15, 35, GREEN, ["kelly"]),
    type("bloods", "Blood test", 10, 25, ROSE, ["farrell", "kelly"]),
    type("vaccine", "Vaccination", 10, 30, ORANGE, ["nolan", "farrell", "kelly"]),
    type("check", "Cervical check", 20, 0, ROSE, ["farrell", "kelly"]),
  ],
  day: [
    ["nolan", "09:00", "Mary Walsh", "consult", "Room 1"],
    ["nolan", "09:15", "John Byrne", "consult", "Room 1"],
    ["nolan", "09:30", "Peter Hogan", "long", "Room 1"],
    ["nolan", "10:15", "Rose Tierney", "review", "Room 1"],
    ["nolan", "10:45", "Liam Quirke", "consult", "Room 1"],
    ["nolan", "11:30", "Kate Egan", "long", "Room 1"],
    ["nolan", "12:15", "Tom Foley", "vaccine", "Room 1"],
    ["farrell", "09:00", "Sarah Duffy", "long", "Room 2"],
    ["farrell", "09:45", "Alan Coyle", "consult", "Room 2"],
    ["farrell", "10:15", "Nora Keane", "check", "Room 2"],
    ["farrell", "11:00", "Eoin Barry", "consult", "Room 2"],
    ["farrell", "11:15", "Jane Carey", "review", "Room 2"],
    ["farrell", "12:00", "Dan Fahy", "consult", "Room 2"],
    ["kelly", "09:00", "Ann Power", "bloods", "Room 3"],
    ["kelly", "09:15", "Mick Dunne", "bloods", "Room 3"],
    ["kelly", "09:45", "Una Healy", "nurse", "Room 3"],
    ["kelly", "10:15", "Joe Rice", "vaccine", "Room 3"],
    ["kelly", "10:30", "Maeve Roche", "vaccine", "Room 3"],
    ["kelly", "11:15", "Clare Nash", "check", "Room 3"],
    ["kelly", "12:00", "Hugh Lane", "nurse", "Room 3"],
  ],
  tour: {
    types: [
      {
        id: "long",
        say: "Each kind of appointment has its own length and price. Long consultations are for the GPs.",
      },
      { id: "bloods", say: "Blood tests go to Nurse Kelly or Dr Farrell, and the room comes with them." },
    ],
    person: { id: "kelly", say: "Nurse Kelly's day, and the appointments she does." },
    booking: {
      entry: ["kelly", "11:45", "Ita Murray", "bloods", "Room 3"],
      times: ["11:00", "11:45", "12:30"],
      asks: "A patient books a blood test with Nurse Kelly.",
      says: "It's on the calendar, with Room 3 held for it.",
    },
  },
};

const CAR: Example = {
  slug: "car-wash",
  name: "Car wash",
  color: "#2563a8",
  hours: [9, 16],
  now: 11 * 60 + 50,
  team: [person("danny", "Danny", BLUE, 0)],
  types: [
    type("wash", "Wash", 30, 15, BLUE, ["danny"]),
    type("polish", "Polish", 60, 40, LILAC, ["danny"]),
    type("valet", "Full valet", 120, 85, IRIS, ["danny"]),
  ],
  day: [
    ["danny", "09:00", "Aidan Coll", "valet", "Yard"],
    ["danny", "11:15", "Gerry Tuite", "wash", "Yard"],
    ["danny", "12:00", "Sinead Lacey", "polish", "Yard"],
    ["danny", "14:15", "Rob Geraghty", "wash", "Yard"],
  ],
  tour: {
    types: [
      { id: "valet", say: "A full valet takes two hours, so the calendar keeps two hours clear." },
      { id: "wash", say: "A wash is thirty minutes. Each one has its own length and price." },
    ],
    booking: {
      entry: ["danny", "13:00", "Fiona Madden", "polish", "Yard"],
      times: ["10:00", "13:00", "15:00"],
      asks: "A client books a polish online while Danny is working.",
      says: "It's on the calendar. On your own, you don't need to stop to answer the phone.",
    },
  },
};

const PHYSIO: Example = {
  slug: "physio",
  name: "Physio clinic",
  color: "#5b4ae0",
  hours: [13, 18],
  now: 15 * 60 + 14,
  team: [
    person("sam", "Sam", BLUE, 0),
    person("aoife", "Aoife", LILAC, 1),
    person("niamh", "Niamh", ORANGE, 2),
  ],
  types: [
    type("assess", "Initial assessment", 60, 70, IRIS, ["sam", "aoife", "niamh"]),
    type("follow", "Follow-up treatment", 45, 60, BLUE, ["sam", "aoife", "niamh"]),
    type("massage", "Sports massage", 30, 40, LILAC, ["sam", "niamh"]),
    type("rehab", "Rehab session", 45, 55, GREEN, ["aoife"]),
  ],
  day: [
    ["sam", "13:30", "Remy Stroud", "follow", "Room 1"],
    ["sam", "14:30", "Dara Quinn", "massage", "Room 1"],
    ["sam", "16:30", "Jo Hayes", "assess", "Room 1"],
    ["aoife", "13:00", "Toby Marsh", "assess", "Room 2"],
    ["aoife", "14:15", "Avery Lane", "follow", "Room 2"],
    ["aoife", "15:15", "Casey Rowe", "rehab", "Rehab gym"],
    ["niamh", "13:00", "Mia Doyle", "massage", "Room 3"],
    ["niamh", "14:00", "Liam Hayes", "assess", "Room 3"],
    ["niamh", "15:30", "Noor Ali", "massage", "Room 3"],
  ],
  tour: {
    types: [
      { id: "massage", say: "Sports massage goes to Sam and Niamh." },
      { id: "rehab", say: "Rehab sessions are Aoife's, and they hold the gym." },
    ],
    person: { id: "aoife", say: "Aoife's day, and the appointments she does." },
    booking: {
      entry: ["aoife", "16:30", "Rory Kane", "follow", "Room 2"],
      times: ["16:15", "16:30", "17:00"],
      asks: "A client books a follow-up with Aoife.",
      says: "It's on the calendar, with Room 2 held for it.",
    },
  },
};

const MUSIC: Example = {
  slug: "music-teacher",
  name: "Music teachers",
  color: "#7c3aed",
  hours: [14, 20],
  now: 16 * 60 + 5,
  team: [person("clara", "Clara", LILAC, 0), person("tom", "Tom", ORANGE, 1)],
  types: [
    type("trial", "Trial lesson", 30, 0, GREEN, ["clara", "tom"]),
    type("piano", "Piano lesson", 30, 25, IRIS, ["clara"]),
    type("exam", "Exam preparation", 60, 50, LILAC, ["clara"]),
    type("guitar", "Guitar lesson", 30, 25, ORANGE, ["tom"]),
  ],
  day: [
    ["clara", "14:30", "Ella Walsh", "piano", "Room 1"],
    ["clara", "15:00", "Sam Boyle", "piano", "Room 1"],
    ["clara", "16:00", "Zoe Grant", "exam", "Room 1"],
    ["clara", "17:30", "Jack Tighe", "piano", "Room 1"],
    ["tom", "15:00", "Adam Cole", "guitar", "Room 2"],
    ["tom", "16:30", "Isla Reilly", "trial", "Room 2"],
    ["tom", "17:00", "Ross Kane", "guitar", "Room 2"],
    ["tom", "18:00", "Luke Dolan", "guitar", "Room 2"],
  ],
  tour: {
    types: [
      { id: "piano", say: "Piano lessons go to Clara only." },
      { id: "trial", say: "Trial lessons are free, and either teacher can take one." },
    ],
    person: { id: "tom", say: "Tom's week starts here, and he teaches guitar and trial lessons." },
    booking: {
      entry: ["tom", "18:30", "Mia Lawlor", "trial", "Room 2"],
      times: ["15:30", "18:30", "19:00"],
      asks: "A parent books a free trial with Tom.",
      says: "It's on the calendar, with Room 2 held for it.",
    },
  },
};

export const EXAMPLES: Record<ExampleSlug, Example> = {
  "hair-salon": HAIR,
  "gp-practice": GP,
  "car-wash": CAR,
  physio: PHYSIO,
  "music-teacher": MUSIC,
};

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/** One entry as the calendar's Booking. */
export function toBooking(
  example: Example,
  [who, at, client, typeId, room]: Entry,
  date: PlainDate,
): Booking {
  const chosen = example.types.find((t) => t.id === typeId);
  const end = toMinutes(at) + (chosen?.minutes ?? 30);
  return {
    id: `${example.slug}-${who}-${at}`,
    status: "confirmed",
    start: zonedToIso(date, at, EXAMPLE_TZ),
    end: zonedToIso(date, minutesToTime(end), EXAMPLE_TZ),
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    customer: { id: client, name: client, email: null, phone: null, groupId: null },
    service: { id: typeId, name: chosen?.name ?? "", color: chosen?.color ?? BLUE },
    option: null,
    resources: [
      {
        id: who,
        name: example.team.find((t) => t.id === who)?.name ?? "",
        kind: "person",
        requirementId: null,
      },
      { id: room, name: room, kind: "space", requirementId: null },
    ],
  } as unknown as Booking;
}

export const priceText = (t: AppointmentType) => (t.price ? `€${String(t.price)}` : "Free");

export const durationText = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${String(h)} h` : "", m ? `${String(m)} min` : ""].filter(Boolean).join(" ");
};
