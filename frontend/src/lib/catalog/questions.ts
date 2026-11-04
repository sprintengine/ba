import type { FormQuestionKind } from "@/lib/api/types";

/** Every booking-form question kind, in picker order (mirrors the backend's `QUESTION_KINDS` in `Questions.kt`). */
export const QUESTION_KINDS: readonly FormQuestionKind[] = [
  "text",
  "textarea",
  "select",
  "checkbox",
  "number",
  "phone",
  "email",
];

/** The answer type as an owner picks it while setting up the booking form. */
export const QUESTION_KIND_LABEL: Record<FormQuestionKind, string> = {
  text: "Short answer",
  textarea: "Long answer",
  select: "Dropdown",
  checkbox: "Checkbox",
  number: "Number",
  phone: "Phone number",
  email: "Email",
};
