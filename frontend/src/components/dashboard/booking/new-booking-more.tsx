"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useFormContext, useFormState, useWatch } from "react-hook-form";
import type { FormQuestion, Service } from "@/lib/api/types";
import type { NewBookingValues as Values } from "@/lib/dashboard/new-booking";
import { cn } from "@/lib/utils";
import { FormField } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { PaymentFields } from "./new-booking-payment";
import { QuestionFields } from "./new-booking-questions";

const PAYMENT_WORDS: Record<Values["paymentMode"], string> = {
  collect_online: "Online",
  at_venue: "At venue",
  none: "No charge",
};

/** A line that says what is set, and opens to change it. It opens by itself when something in it needs attention. */
function MoreRow({
  label,
  summary,
  attention,
  children,
}: {
  label: string;
  summary: string;
  attention?: boolean;
  children: React.ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  const open = opened || !!attention;
  return (
    <section className="border-t border-border-subtle">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpened(!open)}
        className="flex min-h-11 w-full items-center gap-3 rounded-md py-2 text-left text-sm transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="shrink-0 font-medium">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">{summary}</span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 shrink-0 text-subtle-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="flex flex-col gap-3.5 pt-1 pb-4">{children}</div>}
    </section>
  );
}

/** What most bookings leave as it is, one line each: payment and the email, notes, and any questions. */
export function NewBookingMore({
  service,
  questions,
}: {
  service: Service | undefined;
  questions: FormQuestion[];
}) {
  const form = useFormContext<Values>();
  const { errors } = useFormState({ control: form.control });
  const [paymentMode, notify, notes, answers] = useWatch({
    control: form.control,
    name: ["paymentMode", "notifyCustomer", "internalNotes", "answers"],
  });
  const answered = questions.filter((q) => (answers[q.id] ?? "") !== "").length;
  const email = notify ? "Confirmation email" : "No email";

  return (
    <div className="flex flex-col border-b border-border-subtle">
      {questions.length > 0 && (
        <MoreRow
          label="Questions"
          summary={answered > 0 ? `${answered} of ${questions.length} answered` : "All optional"}
          attention={!!errors.answers}
        >
          <QuestionFields questions={questions} />
        </MoreRow>
      )}
      <MoreRow
        label="Payment and email"
        summary={`${PAYMENT_WORDS[paymentMode]} · ${email}`}
        attention={!!errors.paymentMode}
      >
        <PaymentFields service={service} />
      </MoreRow>
      <MoreRow label="Notes" summary={notes.trim() || "Only your team sees these"}>
        <FormField<Values, "internalNotes"> name="internalNotes" label="Internal notes" optional>
          {(field) => <Textarea {...field} rows={2} placeholder="Add a note" />}
        </FormField>
      </MoreRow>
    </div>
  );
}
