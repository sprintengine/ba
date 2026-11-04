/**
 * Pure pieces of the onboarding wizard (the website's components/onboarding: describe-step, wizard-state,
 * review-step): the wizard's states, the describe form's rules, turning an AI or template setup into a draft, and
 * where a validation problem is fixed in the app's lighter review.
 */
import * as z from "zod";
import type { AiDraftInput, BusinessSetup } from "@shared/api/types";
import { createDraft } from "@shared/onboarding/draft";
import type { SetupProblem } from "@shared/onboarding/problems";
import type { SetupDraft, SetupErrors } from "@shared/onboarding/types";

/** Where a draft came from: an AI draft (which may fall back to a template) or a template the owner picked. */
export type DraftOrigin = { kind: "ai" } | { kind: "template"; key: string };

/** The business the wizard just created (enough for the success step). */
export type CreatedBusiness = { id: string; slug: string; name: string };

export type WizardState =
  | { step: "describe" }
  /** Asking for an AI draft (`attempt` tells a stale response from the current one) or loading a template. */
  | { step: "drafting"; source: { kind: "ai"; attempt: number } | { kind: "template"; key: string } }
  | { step: "review"; draft: SetupDraft; origin: DraftOrigin }
  | { step: "success"; business: CreatedBusiness };

export type WizardStep = WizardState["step"];

/** The header's title for each step. */
export const STEP_TITLE: Record<WizardStep, string> = {
  describe: "New business",
  drafting: "New business",
  review: "Review",
  success: "All set",
};

/** The AI request is capped at 4000 characters; the name is added to the description. */
const DESCRIPTION_MAX = 3800;

export const describeSchema = z.object({
  name: z.string().trim().max(100, "Keep it under 100 characters"),
  description: z
    .string()
    .trim()
    .min(20, "Tell us a little more: what you offer, roughly how long it takes and what it costs.")
    .max(DESCRIPTION_MAX, `Keep it under ${DESCRIPTION_MAX} characters`),
  websiteUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (v) => v === "" || /^https?:\/\/\S+\.\S+/.test(v) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v),
      "Enter a web address like example.ie",
    ),
});
export type DescribeValues = z.infer<typeof describeSchema>;

export const EMPTY_DESCRIBE: DescribeValues = { name: "", description: "", websiteUrl: "" };

/** Examples to start from (the website's describe step). */
export const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "Car wash",
    text: "We're Gleam Car Wash, a two-bay hand car wash in Galway. Open Monday to Saturday 8am–6pm. Exterior washes from €15, full valets from €60 with a €20 deposit, priced by car size.",
  },
  {
    label: "Physio clinic",
    text: "We are Lumen Physiotherapy, two chartered physios and two treatment rooms in Cork. Initial assessments are 60 minutes (€70), follow-ups 45 minutes (€60). Open weekdays 9–6 and Saturday mornings.",
  },
  {
    label: "Hair salon",
    text: "We are Halcyon Hair Studio, three stylists in Dublin 8. Cuts from €35, colour from €80, blow-dries €30. Open Tuesday to Saturday 9:30–6, late opening Thursday until 8.",
  },
  {
    label: "Yoga studio",
    text: "We're Stillwater Yoga, a small studio running group classes for up to 12 people. Weekday mornings at 7 and evenings at 6:30, Saturday at 10. €14 per class, paid when booking.",
  },
];

/** "example.ie" → "https://example.ie"; empty → null. */
export function normaliseUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** The AI request: the description, with the name the owner typed so the draft uses it. */
export function aiDraftInput(values: DescribeValues): AiDraftInput {
  const name = values.name.trim();
  const description = values.description.trim();
  return {
    description: name ? `${description}\n\nThe business is called ${name}.` : description,
    websiteUrl: normaliseUrl(values.websiteUrl),
  };
}

/** A draft from an AI or template setup, named what the owner typed (its address then follows that name). */
export function draftFrom(setup: BusinessSetup, name: string): SetupDraft {
  const typed = name.trim();
  return createDraft(typed ? { ...setup, name: typed, slug: null } : setup);
}

/** What opens to fix a problem: the business sheet, a service's, a resource's, or nothing editable here. */
export type FixTarget =
  | { sheet: "business" }
  | { sheet: "service"; index: number }
  | { sheet: "resource"; key: string }
  | { sheet: null };

export function fixTarget(problem: SetupProblem, setup: BusinessSetup): FixTarget {
  if (problem.section === "business") return { sheet: "business" };
  if (problem.section === "services" && problem.index !== null)
    return { sheet: "service", index: problem.index };
  if (problem.section === "resources" && problem.index !== null) {
    const key = setup.resources[problem.index]?.key;
    if (key) return { sheet: "resource", key };
  }
  return { sheet: null };
}

/** The errors under one item (`services[2].`), as `[field path after the prefix, message]`. */
export function errorsUnder(errors: SetupErrors, prefix: string): [string, string][] {
  return Object.entries(errors)
    .filter(([path]) => path.startsWith(prefix))
    .map(([path, message]) => [path.slice(prefix.length), message]);
}

/** "1 thing to fix" / "3 things to fix". */
export function problemCount(n: number): string {
  return n === 1 ? "1 thing to fix" : `${n} things to fix`;
}

/** "2 options, 1 add-on": what a service has beyond what the app edits here. */
export function serviceExtras(service: BusinessSetup["services"][number]): string | null {
  const parts: string[] = [];
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  if (service.options.length) parts.push(n(service.options.length, "option", "options"));
  if (service.addons.length) parts.push(n(service.addons.length, "add-on", "add-ons"));
  return parts.length ? parts.join(", ") : null;
}

/** "2 booking questions and 1 customer group": the parts of a setup the app's review doesn't edit. */
export function alsoIncluded(setup: BusinessSetup): string | null {
  const parts: string[] = [];
  const q = setup.questions.length;
  const g = setup.customerGroups.length;
  if (q) parts.push(`${q} booking ${q === 1 ? "question" : "questions"}`);
  if (g) parts.push(`${g} customer ${g === 1 ? "group" : "groups"}`);
  return parts.length ? parts.join(" and ") : null;
}
