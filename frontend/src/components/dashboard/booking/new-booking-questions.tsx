"use client";

import type { FormQuestion } from "@/lib/api/types";
import type { NewBookingValues as Values } from "@/lib/dashboard/new-booking";
import { FormField } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { questionAnswerInput } from "@/components/common/question-answer-input";
import { SensitiveMark } from "../common";
import { Step } from "./new-booking-step";

/** Step 4 (only when the service has questions): the booking form's questions, all optional for staff. */
export function QuestionFields({ questions }: { questions: FormQuestion[] }) {
  if (questions.length === 0) return null;
  const sorted = [...questions].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <Step n={4} title="Questions">
      <p className="-mt-1.5 text-xs text-muted-foreground">
        All optional when you book for someone. Fill in what you know.
      </p>
      {sorted.map((q) => (
        <FormField<Values, `answers.${string}`>
          key={q.id}
          name={`answers.${q.id}`}
          label={
            <span className="flex items-center gap-2">
              {q.label}
              {q.sensitive && <SensitiveMark />}
            </span>
          }
          help={q.helpText ?? undefined}
        >
          {(field) => {
            const kind = q.kind;
            return kind === "checkbox" ? (
              <Switch
                ref={field.ref}
                checked={field.value === "true"}
                onCheckedChange={(c) => field.onChange(c ? "true" : "false")}
                onBlur={field.onBlur}
              />
            ) : (
              questionAnswerInput({ kind, options: q.options }, field)
            );
          }}
        </FormField>
      ))}
    </Step>
  );
}
