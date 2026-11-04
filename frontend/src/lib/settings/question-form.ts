/**
 * Settings → Questions: answer-type labels, the question dialog's zod schema and FormQuestion ↔ form values ↔
 * FormQuestionInput. Kept free of React so it can be unit-tested.
 */
import * as z from "zod";
import type { FormQuestion, FormQuestionInput, FormQuestionKind } from "@/lib/api/types";
import { QUESTION_LIMITS as L } from "@/lib/validation/limits";
import { choicesProblem } from "@/lib/validation/questions";

/**
 * The dashboard's answer-type wording. It differs from the onboarding labels (`QUESTION_KIND_LABEL` in
 * lib/catalog/questions.ts: "Dropdown", "Checkbox", "Phone number"): which to keep is a product decision.
 */
export const KIND_LABEL: Record<FormQuestionKind, string> = {
  text: "Short answer",
  textarea: "Long answer",
  select: "Choice",
  checkbox: "Yes / no",
  number: "Number",
  phone: "Phone",
  email: "Email",
};

/** The "Ask for" select's value for a question asked for every service. */
export const ALL_SERVICES = "all";

/** Choices are typed one per line; blank lines are ignored. */
export const parseChoices = (text: string): string[] =>
  text
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);

export const questionSchema = z
  .object({
    label: z.string().trim().min(1, "Write the question").max(L.label),
    helpText: z.string().max(L.helpText),
    kind: z.enum(["text", "textarea", "select", "checkbox", "number", "phone", "email"]),
    optionsText: z.string(),
    required: z.boolean(),
    sensitive: z.boolean(),
    serviceId: z.string(),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind !== "select") return;
    const message = choicesProblem(parseChoices(v.optionsText));
    if (message) ctx.addIssue({ code: "custom", path: ["optionsText"], message });
  });

export type QuestionFormValues = z.infer<typeof questionSchema>;

/** Form values for `question`, or a new question's defaults (asked for `defaultService`). */
export function questionToFormValues(
  question: FormQuestion | null,
  defaultService: string,
): QuestionFormValues {
  if (!question) {
    return {
      label: "",
      helpText: "",
      kind: "text",
      optionsText: "",
      required: false,
      sensitive: false,
      serviceId: defaultService,
      isActive: true,
    };
  }
  return {
    label: question.label,
    helpText: question.helpText ?? "",
    kind: question.kind,
    optionsText: question.options.join("\n"),
    required: question.required,
    sensitive: question.sensitive,
    serviceId: question.serviceId ?? ALL_SERVICES,
    isActive: question.isActive,
  };
}

export function formValuesToQuestionInput(v: QuestionFormValues, sortOrder: number): FormQuestionInput {
  return {
    label: v.label.trim(),
    helpText: v.helpText.trim() || null,
    kind: v.kind,
    options: v.kind === "select" ? parseChoices(v.optionsText) : [],
    required: v.required,
    sensitive: v.sensitive,
    serviceId: v.serviceId === ALL_SERVICES ? null : v.serviceId,
    isActive: v.isActive,
    sortOrder,
  };
}
