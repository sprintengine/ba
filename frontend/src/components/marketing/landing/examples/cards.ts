import type { IndustrySlug } from "@/components/shells/industries";

/** What a card on the page says. The photos are illustrations, so each is labelled by type of business, never by name. */
export type ExampleCard = {
  slug: ExampleSlug;
  label: string;
  /** Who works there and where. */
  shape: string;
  /** The kinds of appointment, in short. */
  types: string;
  photo: string;
  alt: string;
  /** The longer page for this kind of business, where there is one. */
  page?: IndustrySlug;
};

export type ExampleSlug = "hair-salon" | "gp-practice" | "car-wash" | "physio" | "music-teacher";

export const photoSrc = (photo: string, width: 480 | 960) => `/examples/${photo}-${String(width)}.webp`;
export const photoSrcSet = (photo: string) => `${photoSrc(photo, 480)} 480w, ${photoSrc(photo, 960)} 960w`;

export const EXAMPLE_CARDS: ExampleCard[] = [
  {
    slug: "hair-salon",
    label: "Hair salon",
    shape: "Three hairdressers, three chairs",
    types: "Cuts, colour, highlights and more",
    photo: "hair-salon",
    alt: "A hairdresser blow-drying a client's hair in a bright salon",
  },
  {
    slug: "gp-practice",
    label: "GP practice",
    shape: "Two GPs, a nurse, three rooms",
    types: "Seven kinds of appointment",
    photo: "gp-practice",
    alt: "A GP talking with a patient across a desk in a consulting room",
    page: "gp-practice",
  },
  {
    slug: "car-wash",
    label: "Car wash",
    shape: "One person, one yard",
    types: "Wash, polish, full valet",
    photo: "car-wash",
    alt: "A man polishing a dark car by hand outside a unit",
    page: "car-wash",
  },
  {
    slug: "physio",
    label: "Physio clinic",
    shape: "Three physios, three rooms and a gym",
    types: "Assessments, treatment, rehab",
    photo: "physio",
    alt: "A physiotherapist guiding a client's arm through a shoulder stretch",
    page: "physio",
  },
  {
    slug: "music-teacher",
    label: "Music teachers",
    shape: "Two teachers, two rooms",
    types: "Trial lessons, piano, guitar, exams",
    photo: "music-teacher",
    alt: "A teacher sitting beside a pupil playing the piano",
    page: "music-lessons",
  },
];
