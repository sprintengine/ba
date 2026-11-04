import type { useTemplate } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { createDraft } from "@/lib/onboarding/draft";
import type { SetupDraft } from "@/lib/onboarding/types";
import { loadOnboarding, type CreatedBusiness, type DraftOrigin } from "./draft-storage";

export type WizardState =
  | { step: "start" }
  | { step: "describe" }
  /** Loading a template; becomes the review step as soon as it arrives. */
  | { step: "template"; key: string }
  | { step: "review"; draft: SetupDraft; origin: DraftOrigin; id: number }
  /** The booking page's style (or the site, where websites are on); skippable. */
  | { step: "site"; business: CreatedBusiness }
  | { step: "success"; business: CreatedBusiness };

/** What the wizard shows: a template that has loaded is reviewed; one still loading (or failed) stays on Start. */
export type WizardView =
  | { step: "start"; pendingTemplate: string | null; templateError: string | null }
  | { step: "describe" }
  | { step: "review"; reviewKey: string; draft: SetupDraft; origin: DraftOrigin }
  | { step: "site"; business: CreatedBusiness }
  | { step: "success"; business: CreatedBusiness };

/** The progress bar's step for each view. */
export const WIZARD_PROGRESS: Record<WizardView["step"], 0 | 1 | 2 | 3> = {
  start: 0,
  describe: 0,
  review: 1,
  site: 2,
  success: 3,
};

/** `?template=` wins; otherwise resume a saved review, site or success step from this tab. */
export function initialWizardState(templateParam: string | null): WizardState {
  if (templateParam) return { step: "template", key: templateParam };
  const saved = loadOnboarding();
  if (saved?.step === "review") return { step: "review", draft: saved.draft, origin: saved.origin, id: 0 };
  if (saved?.step === "site") return { step: "site", business: saved.business };
  if (saved?.step === "success") return { step: "success", business: saved.business };
  return { step: "start" };
}

export function wizardView(state: WizardState, template: ReturnType<typeof useTemplate>): WizardView {
  if (state.step !== "template") {
    if (state.step === "start") return { step: "start", pendingTemplate: null, templateError: null };
    if (state.step === "review")
      return { step: "review", reviewKey: `review-${state.id}`, draft: state.draft, origin: state.origin };
    return state;
  }
  if (template.data) {
    return {
      step: "review",
      reviewKey: `template-${state.key}`,
      draft: createDraft(template.data),
      origin: { kind: "template", key: state.key },
    };
  }
  if (!template.isError) return { step: "start", pendingTemplate: state.key, templateError: null };
  const templateError = template.error.isNotFound
    ? `We couldn't find the "${state.key}" template. Pick one below or describe your business.`
    : errorMessage(template.error, "We couldn't load that template.");
  return { step: "start", pendingTemplate: null, templateError };
}
