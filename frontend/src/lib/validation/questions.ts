import { QUESTION_LIMITS as L } from "./limits";

/**
 * What's wrong with a choice question's choices, if anything. One rule set for the dashboard's question dialog and
 * onboarding, mirroring the backend's `validateQuestion` (which `SetupValidation` also runs): 1 to 50 choices, each 1
 * to 100 characters.
 */
export function choicesProblem(choices: readonly string[]): string | null {
  if (choices.length === 0) return "Add at least one choice";
  if (choices.length > L.options) return `At most ${L.options} choices`;
  if (choices.some((c) => !c.trim())) return "Choices can't be blank";
  if (choices.some((c) => c.length > L.optionLength))
    return `Keep each choice to ${L.optionLength} characters or fewer`;
  return null;
}
