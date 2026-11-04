import { api } from "./client";
import type { AiDraftInput, Business, BusinessSetup, SlugAvailability } from "./types";

/** Onboarding and AI endpoints (§6.3). */
export const onboardingApi = {
  /** Creates the business with the caller as owner (status `active`). */
  createBusiness: (setup: BusinessSetup): Promise<Business> => api.post<Business>("/v1/businesses", setup),

  slugAvailable: (slug: string): Promise<SlugAvailability> =>
    api.get<SlugAvailability>("/v1/businesses/slug-available", { slug }),

  /** AI draft; falls back to the best-matching template (`source: "template"`) when AI is not configured. */
  aiBusinessDraft: (input: AiDraftInput): Promise<BusinessSetup> =>
    api.post<BusinessSetup>("/v1/ai/business-draft", input),
};
