/**
 * The review step's validation (the website's use-setup-validation and slug-field's useSlugCheck): the shared
 * client rules, the last server errors (until the next edit) and a taken address from the live availability check.
 */
import { useSlugAvailability } from "@shared/api/hooks/use-onboarding";
import type { BusinessSetup } from "@shared/api/types";
import { useDebouncedValue } from "@shared/hooks/use-debounced-value";
import { describeProblem, type SetupProblem } from "@shared/onboarding/problems";
import type { SetupErrors } from "@shared/onboarding/types";
import { validateSetup } from "@shared/onboarding/validation";
import { slugProblem } from "@shared/slug";

export type SlugCheck =
  | { status: "empty" | "invalid" | "checking" | "available" | "unknown" }
  | { status: "taken"; suggestion: string | null };

export const TAKEN_MESSAGE = "That address is already taken";

/** Debounced live availability for a slug; no request while the format is already wrong. */
export function useSlugCheck(slug: string): SlugCheck {
  const debounced = useDebouncedValue(slug, 300);
  const canCheck = !!debounced && !slugProblem(debounced);
  const query = useSlugAvailability(canCheck ? debounced : "", { retry: false, staleTime: 30_000 });

  if (!slug) return { status: "empty" };
  if (slugProblem(slug)) return { status: "invalid" };
  if (debounced !== slug || query.isFetching) return { status: "checking" };
  if (query.isError) return { status: "unknown" };
  if (!query.data) return { status: "checking" };
  return query.data.available
    ? { status: "available" }
    : { status: "taken", suggestion: query.data.suggestion };
}

export function useSetupValidation(
  setup: BusinessSetup,
  serverErrors: SetupErrors,
): { errors: SetupErrors; problems: SetupProblem[]; slugCheck: SlugCheck } {
  const slugCheck = useSlugCheck(setup.slug ?? "");
  const errors: SetupErrors = { ...serverErrors, ...validateSetup(setup) };
  if (slugCheck.status === "taken" && !errors.slug) errors.slug = TAKEN_MESSAGE;
  const problems = Object.entries(errors).map(([path, message]) => describeProblem(setup, path, message));
  return { errors, problems, slugCheck };
}
