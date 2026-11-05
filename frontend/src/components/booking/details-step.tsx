"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormField, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DetailsValues, Question } from "@/lib/booking/details-schema";
import { questionAnswerInput } from "@/components/common/question-answer-input";

export const DETAILS_FORM_ID = "booking-details";

export function DetailsStep({
  form,
  onSubmit,
  questions,
  requirePhone,
  businessName,
  signedInAs,
  signInHref,
}: {
  form: UseFormReturn<DetailsValues>;
  onSubmit: (values: DetailsValues) => void;
  questions: Question[];
  requirePhone: boolean;
  businessName: string;
  /** Present when signed in: name/email are prefilled from the account. */
  signedInAs: { name: string | null; email: string } | null;
  signInHref: string;
}) {
  return (
    <Form
      form={form}
      onSubmit={onSubmit}
      id={DETAILS_FORM_ID}
      // A field focused for its error clears the sticky header and, on phones, the bottom bar.
      className="gap-6 [&_:is(input,textarea,button)]:scroll-mt-20 [&_:is(input,textarea,button)]:scroll-mb-32"
    >
      {!signedInAs && (
        <p className="text-sm text-muted-foreground">
          Have an account?{" "}
          <Link href={signInHref} className="font-medium text-brand underline-offset-4 hover:underline">
            Sign in
          </Link>{" "}
          to keep all your bookings in one place.
        </p>
      )}

      <div className="flex flex-col gap-5">
        <FormField<DetailsValues, "name"> name="name" label="Full name" required>
          {(field) => <Input {...field} size="lg" autoComplete="name" />}
        </FormField>
        <FormField<DetailsValues, "email">
          name="email"
          label="Email"
          required
          help="We'll send your confirmation and a link to manage it here."
        >
          {(field) => <Input {...field} size="lg" type="email" inputMode="email" autoComplete="email" />}
        </FormField>
        <FormField<DetailsValues, "phone">
          name="phone"
          label="Phone"
          required={requirePhone}
          optional={!requirePhone}
          help={
            requirePhone
              ? `${businessName} may call if something changes.`
              : "For reminders or if plans change."
          }
        >
          {(field) => (
            <Input
              {...field}
              size="lg"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+353 87 123 4567"
            />
          )}
        </FormField>
      </div>

      {questions.length > 0 && (
        <div className="flex flex-col gap-5 border-t border-border-subtle pt-6">
          {questions.map((q) => (
            <QuestionField key={q.id} question={q} businessName={businessName} />
          ))}
        </div>
      )}

      <div className="border-t border-border-subtle pt-6">
        <FormField<DetailsValues, "notes"> name="notes" label="Anything we should know?" optional>
          {(field) => <Textarea {...field} rows={3} placeholder="Access notes, preferences…" />}
        </FormField>
      </div>
      <FormRootError />
    </Form>
  );
}

function PrivateBadge() {
  return (
    <Badge tone="neutral" className="ml-2 align-middle" title="Kept private between you and the business">
      <Lock /> Private
    </Badge>
  );
}

function QuestionField({ question: q, businessName }: { question: Question; businessName: string }) {
  const name = `answers.${q.id}` as const;
  const help = [q.helpText, q.sensitive ? `Only shared with ${businessName}.` : null]
    .filter(Boolean)
    .join(" ");

  if (q.kind === "checkbox") {
    const id = `q-${q.id}`;
    return (
      <FormField<DetailsValues, `answers.${string}`> name={name} id={id} help={help || undefined}>
        {(field) => (
          <div className="flex items-start gap-3">
            <Checkbox
              ref={field.ref}
              className="mt-0.5"
              checked={field.value === "true"}
              onCheckedChange={(c) => field.onChange(c === true ? "true" : "false")}
              onBlur={field.onBlur}
            />
            <label htmlFor={id} className="text-sm leading-5 font-medium">
              {q.label}
              {q.required && (
                <span aria-hidden className="ml-0.5 text-danger">
                  *
                </span>
              )}
              {q.sensitive && <PrivateBadge />}
            </label>
          </div>
        )}
      </FormField>
    );
  }

  const kind = q.kind;
  return (
    <FormField<DetailsValues, `answers.${string}`>
      name={name}
      label={q.label}
      labelAction={q.sensitive ? <PrivateBadge /> : undefined}
      required={q.required}
      optional={!q.required}
      help={help || undefined}
    >
      {(field) => questionAnswerInput({ kind, options: q.options }, field, "lg")}
    </FormField>
  );
}
