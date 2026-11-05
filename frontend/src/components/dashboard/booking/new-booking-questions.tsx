"use client";

import type { FormQuestion } from "@/lib/api/types";
import type { NewBookingValues as Values } from "@/lib/dashboard/new-booking";
import { FormField } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { questionAnswerInput } from "@/components/common/question-answer-input";
import { SensitiveMark } from "../common";

/** The booking form's questions, all optional for staff. */
export function QuestionFields({ questions }: { questions: FormQuestion[] }) {
  if (questions.length === 0) return null;
  const sorted = [...questions].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <>
      <p className="text-xs text-muted-foreground">
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
    </>
  );
}
