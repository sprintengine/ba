/** Launch industries (architecture §11 `/for/[industry]`). Marketing pages and nav read from here. */
export const INDUSTRIES = [
  { slug: "physio", name: "Physiotherapy", short: "Physios", template: "physio" },
  { slug: "car-wash", name: "Car wash & valeting", short: "Car washes", template: "car_wash" },
  { slug: "music-lessons", name: "Music lessons", short: "Music teachers", template: "music_lessons" },
  { slug: "gp-practice", name: "GP practices", short: "GP practices", template: "gp_practice" },
] as const;

export type IndustrySlug = (typeof INDUSTRIES)[number]["slug"];

export function findIndustry(slug: string) {
  return INDUSTRIES.find((i) => i.slug === slug) ?? null;
}
