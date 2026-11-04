"use client";

import { useMemo } from "react";
import type { BusinessSetup } from "@/lib/api/types";
import { describeProblem, type SetupProblem } from "@/lib/onboarding/problems";
import type { SetupErrors } from "@/lib/onboarding/types";
import { validateSetup } from "@/lib/onboarding/validation";
import { useSlugCheck, type SlugCheck } from "./slug-field";

/**
 * Every problem with [setup]: client validation, the last server errors (until the next edit), and a taken slug
 * from the live availability check. `problems` is the same list described for the "fix these first" summary.
 */
export function useSetupValidation(
  setup: BusinessSetup,
  serverErrors: SetupErrors,
): { errors: SetupErrors; problems: SetupProblem[]; slugCheck: SlugCheck } {
  const slugCheck = useSlugCheck(setup.slug ?? "");
  const clientErrors = useMemo(() => validateSetup(setup), [setup]);
  const errors: SetupErrors = useMemo(() => {
    const merged = { ...serverErrors, ...clientErrors };
    if (slugCheck.status === "taken" && !merged.slug) merged.slug = "That address is already taken";
    return merged;
  }, [serverErrors, clientErrors, slugCheck.status]);
  const problems = useMemo(
    () => Object.entries(errors).map(([path, message]) => describeProblem(setup, path, message)),
    [errors, setup],
  );
  return { errors, problems, slugCheck };
}
