/**
 * The "your details" form: schema built from the business policy and the
 * service's questions, mirroring backend validation (BookingSupport.validateAnswers).
 *
 * Checked by hand rather than with zod: this is the only schema on the public booking page, and zod would add about
 * 30 KB (gzip) to its first load for one small form.
 */
import type { FieldErrors, Resolver } from "react-hook-form";
import type { PublicService } from "@/lib/api/types";
import { PHONE_PATTERN } from "@/lib/validation/limits";

export type Question = PublicService["questions"][number];

export type DetailsValues = {
  name: string;
  email: string;
  phone: string;
  notes: string;
  /** questionId → answer ("true"/"false" for checkboxes). */
  /** By question id; absent until answered. */
  answers: Record<string, string | undefined>;
};

export const EMPTY_DETAILS: DetailsValues = { name: "", email: "", phone: "", notes: "", answers: {} };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function sortedQuestions(service: PublicService | null): Question[] {
  return [...(service?.questions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Whether an answer counts as given: non-blank, and a ticked box for checkboxes. */
export function isAnswered(q: Pick<Question, "kind">, raw: string | undefined): boolean {
  const v = (raw ?? "").trim();
  return v !== "" && !(q.kind === "checkbox" && v === "false");
}

function missingAnswerMessage(q: Question): string {
  if (q.kind === "checkbox") return "Please confirm to continue";
  if (q.kind === "select") return "Choose an option";
  return "Please answer this question";
}

/** What is wrong with a given (non-blank) answer, mirroring the backend's limits; empty when it is fine. */
export function answerIssues(q: Pick<Question, "kind" | "options">, value: string): string[] {
  const issues: string[] = [];
  if (value.length > 2000) issues.push("Keep it under 2000 characters");
  const format = formatIssue(q, value);
  if (format) issues.push(format);
  return issues;
}

function formatIssue(q: Pick<Question, "kind" | "options">, v: string): string | null {
  switch (q.kind) {
    case "text":
      return v.length > 500 ? "Keep it under 500 characters" : null;
    case "checkbox":
    case "textarea":
      return null; // Required-ness and the 2000-character limit are checked by the caller.
    case "select":
      return q.options.includes(v) ? null : "Choose one of the options";
    case "number":
      return /^-?\d+(\.\d+)?$/.test(v) ? null : "Enter a number";
    case "email":
      return EMAIL.test(v) ? null : "Enter a valid email address";
    case "phone":
      return PHONE_PATTERN.test(v) ? null : "Enter a valid phone number";
  }
}

export type DetailsIssue = { path: string[]; message: string };
export type DetailsParse =
  | { success: true; data: DetailsValues; error?: undefined }
  | { success: false; data?: undefined; error: { issues: DetailsIssue[] } };
/** The details form's schema: `safeParse` like a zod schema's, trimming name, email and phone. */
export type DetailsSchema = { safeParse(values: DetailsValues): DetailsParse };

export function buildDetailsSchema(opts: { requirePhone: boolean; questions: Question[] }): DetailsSchema {
  return {
    safeParse(values) {
      const issues: DetailsIssue[] = [];
      const add = (path: string[], message: string) => issues.push({ path, message });
      // Values may come back from sessionStorage, so don't trust their types.
      const text = (v: unknown) => (typeof v === "string" ? v : "");
      const name = text(values.name).trim();
      const email = text(values.email).trim();
      const phone = text(values.phone).trim();
      const notes = text(values.notes);
      const answers = (values as Partial<DetailsValues>).answers ?? {};

      if (!name) add(["name"], "Enter your name");
      else if (name.length > 120) add(["name"], "Keep it under 120 characters");
      if (!email) add(["email"], "Enter your email");
      else if (!EMAIL.test(email)) add(["email"], "Enter a valid email address");
      if (!phone) {
        if (opts.requirePhone) add(["phone"], "Enter a phone number");
      } else if (!PHONE_PATTERN.test(phone)) add(["phone"], "Enter a valid phone number");
      if (notes.length > 2000) add(["notes"], "Keep it under 2000 characters");
      for (const q of opts.questions) {
        const raw = answers[q.id];
        if (!isAnswered(q, raw)) {
          if (q.required) add(["answers", q.id], missingAnswerMessage(q));
          continue;
        }
        for (const message of answerIssues(q, (raw ?? "").trim())) add(["answers", q.id], message);
      }
      return issues.length
        ? { success: false, error: { issues } }
        : { success: true, data: { ...values, name, email, phone, notes, answers } };
    },
  };
}

/** The schema as a react-hook-form resolver: the first message per field, values trimmed on success. */
export function detailsResolver(schema: DetailsSchema): Resolver<DetailsValues> {
  return (values) => {
    const r = schema.safeParse(values);
    if (r.success) return { values: r.data, errors: {} };
    const errors: Record<string, unknown> = {};
    for (const { path, message } of r.error.issues) {
      const [field, id] = path as [keyof DetailsValues, string | undefined];
      const error = { type: "custom", message };
      if (id === undefined) errors[field] ??= error;
      else ((errors.answers ??= {}) as Record<string, unknown>)[id] ??= error;
    }
    return { values: {}, errors: errors as FieldErrors<DetailsValues> };
  };
}

/** Answers to send: only this service's questions, trimmed, blanks dropped. */
export function answersPayload(values: DetailsValues, questions: Question[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of questions) {
    const v = values.answers[q.id]?.trim();
    if (!v) continue;
    if (q.kind === "checkbox" && v === "false" && !q.required) continue;
    out[q.id] = v;
  }
  return out;
}

/** What may be kept in sessionStorage between refreshes: never sensitive answers. */
export function storableDetails(values: DetailsValues, questions: Question[]): DetailsValues {
  const sensitive = new Set(questions.filter((q) => q.sensitive).map((q) => q.id));
  const answers: Record<string, string> = {};
  for (const [id, v] of Object.entries(values.answers))
    if (v !== undefined && !sensitive.has(id)) answers[id] = v;
  return { ...values, answers };
}
