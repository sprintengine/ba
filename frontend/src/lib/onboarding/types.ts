import type { BusinessSetup } from "@/lib/api/types";

export type SetupResource = BusinessSetup["resources"][number];
export type SetupWeeklyHours = SetupResource["weeklyHours"][number];
export type SetupService = BusinessSetup["services"][number];
export type SetupOption = SetupService["options"][number];
export type SetupAddon = SetupService["addons"][number];
export type SetupRequirement = SetupService["requirements"][number];
export type SetupGroup = BusinessSetup["customerGroups"][number];
export type SetupQuestion = BusinessSetup["questions"][number];

/** Onboarding draft state: a `BusinessSetup` being reviewed before `POST /v1/businesses`. */
export type SetupDraft = {
  setup: BusinessSetup;
  /** Once the owner types a slug we stop deriving it from the name. */
  slugEdited: boolean;
};

/** Field path (the API's `fields` keys, e.g. `services[0].depositCents`) → message. */
export type SetupErrors = Record<string, string>;
