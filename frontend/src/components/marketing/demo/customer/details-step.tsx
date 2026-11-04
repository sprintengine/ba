"use client";

import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { DemoInput } from "../engine/controls";
import { DemoSelect, DemoTextarea } from "./controls";
import { LUMEN, LUMEN_SERVICES } from "./fixture";
import { SERVICE_ID, type Details } from "./state";

/*
 * The details step for a signed-out visitor, as components/booking/details-step.tsx renders it: name, email
 * and phone, the service's intake questions (two of them private), and notes for the clinic.
 */

const QUESTIONS = [...(LUMEN_SERVICES.find((s) => s.id === SERVICE_ID)?.questions ?? [])].sort(
  (a, b) => a.sortOrder - b.sortOrder,
);

function PrivateBadge() {
  return (
    <Badge tone="neutral" className="ml-2 align-middle">
      <Lock /> Private
    </Badge>
  );
}

function helpFor(q: (typeof QUESTIONS)[number]) {
  return [q.helpText, q.sensitive ? `Only shared with ${LUMEN.name}.` : null].filter(Boolean).join(" ");
}

/** Demo ids of the question controls, in order: what the visitor needs help with, then surgery, then source. */
const QUESTION_IDS = ["field-help", "field-surgery", "field-source"];

export function DetailsStep({ details, selectOpen }: { details: Details; selectOpen: boolean }) {
  const answers = [details.help, details.surgery, null];
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Have an account? <span className="font-medium text-brand underline-offset-4">Sign in</span> to keep
        all your bookings in one place.
      </p>

      <div className="grid gap-5">
        <Field label="Full name" required>
          <DemoInput id="field-name" size="lg" value={details.name} placeholder="Alex Morgan" />
        </Field>
        <Field label="Email" required help="We'll send your confirmation and a link to manage it here.">
          <DemoInput id="field-email" size="lg" value={details.email} placeholder="you@example.com" />
        </Field>
        <Field label="Phone" required help={`${LUMEN.name} may call if something changes.`}>
          <DemoInput id="field-phone" size="lg" value={details.phone} placeholder="+353 87 123 4567" />
        </Field>
      </div>

      <div className="flex flex-col gap-5 border-t border-border-subtle pt-6">
        {QUESTIONS.map((q, i) => {
          const id = QUESTION_IDS[i] ?? q.id;
          const answer = answers[i] ?? null;
          return (
            <Field
              key={q.id}
              label={q.label}
              labelAction={q.sensitive ? <PrivateBadge /> : undefined}
              required={q.required}
              optional={!q.required}
              help={helpFor(q) || undefined}
            >
              {q.kind === "textarea" ? (
                <DemoTextarea id={id} value={answer ?? ""} />
              ) : (
                <DemoSelect
                  id={id}
                  value={answer}
                  options={q.options}
                  open={selectOpen && id === "field-surgery"}
                  highlighted={q.options[0]}
                />
              )}
            </Field>
          );
        })}
      </div>

      <div className="border-t border-border-subtle pt-6">
        <Field label={`Anything ${LUMEN.name} should know?`} optional>
          <DemoTextarea id="field-notes" value="" placeholder="Access notes, preferences…" />
        </Field>
      </div>
    </div>
  );
}
