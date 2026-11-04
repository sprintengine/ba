"use client";

import { useQuery } from "@tanstack/react-query";
import { onboardingApi } from "../onboarding";
import { qk } from "../query-keys";
import type { AiDraftInput, Business, BusinessSetup, SlugAvailability } from "../types";
import {
  enabledWhen,
  invalidateAll,
  useApiMutation,
  type MutationOptions,
  type QueryOptions,
} from "./shared";

/** Disabled while `slug` is empty. Debounce the input before passing it in. */
export function useSlugAvailability(slug: string, options?: QueryOptions<SlugAvailability>) {
  return useQuery({
    ...options,
    queryKey: qk.onboarding.slugAvailable(slug),
    queryFn: () => onboardingApi.slugAvailable(slug),
    enabled: enabledWhen(!!slug, options),
  });
}

export function useCreateBusiness(options?: MutationOptions<Business, BusinessSetup>) {
  return useApiMutation(
    (setup: BusinessSetup) => onboardingApi.createBusiness(setup),
    (qc, business) => {
      qc.setQueryData(qk.business(business.id).detail(), business);
      return invalidateAll(qc, [qk.me()]);
    },
    options,
  );
}

/** Returns a draft `BusinessSetup` for the user to review; nothing is saved. */
export function useAiBusinessDraft(options?: MutationOptions<BusinessSetup, AiDraftInput>) {
  return useApiMutation((input: AiDraftInput) => onboardingApi.aiBusinessDraft(input), undefined, options);
}
