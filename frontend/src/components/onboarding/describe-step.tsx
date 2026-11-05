"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Globe } from "lucide-react";
import { AiIcon } from "@/components/brand/logo";
import { useAiBusinessDraft } from "@/lib/api/hooks";
import { isApiError } from "@/lib/api/client";
import type { BusinessSetup } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormRootError, applyApiErrors } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GeneratingState } from "./generating-state";

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
    label: "Music teacher",
    text: "I run Cadence Music Studio: piano and guitar lessons for kids and adults in Limerick. 30, 45 or 60 minute lessons from €25, and a free trial lesson for new students. Weekday afternoons and Saturdays.",
  },
  {
    label: "GP practice",
    text: "We're Meadowbrook Family Practice, a GP practice with two doctors and a practice nurse. 15 minute GP consultations paid at reception, nurse appointments and blood tests. Medical card patients book morning slots.",
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

const schema = z.object({
  description: z
    .string()
    .trim()
    .min(20, "Tell us a little more: what you offer, roughly how long it takes and what it costs.")
    .max(4000, "Keep it under 4000 characters"),
  websiteUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (v) => v === "" || /^https?:\/\/\S+\.\S+/.test(v) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v),
      "Enter a web address like example.ie",
    ),
});
export type DescribeValues = z.infer<typeof schema>;

function normaliseUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function DescribeStep({
  initial,
  onBack,
  onDraft,
}: {
  initial: DescribeValues;
  onBack: () => void;
  /** Called with the draft and the values that produced it (to restore the form later). */
  onDraft: (setup: BusinessSetup, values: DescribeValues) => void;
}) {
  const form = useForm<DescribeValues>({ resolver: zodResolver(schema), defaultValues: initial });
  const draft = useAiBusinessDraft();
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ setup: BusinessSetup; values: DescribeValues } | null>(null);
  const description = useWatch({ control: form.control, name: "description" });

  async function submit(values: DescribeValues) {
    setGenerating(true);
    setResult(null);
    try {
      const setup = await draft.mutateAsync({
        description: values.description,
        websiteUrl: normaliseUrl(values.websiteUrl),
      });
      setResult({ setup, values });
    } catch (err) {
      setGenerating(false);
      if (isApiError(err) && err.code === "RATE_LIMITED") {
        form.setError("root", {
          message:
            "You've drafted a lot in a short time. Wait a minute and try again, or start from a template.",
        });
      } else {
        applyApiErrors(form, err);
      }
    }
  }

  if (generating) {
    return (
      <GeneratingState
        description={form.getValues("description")}
        done={!!result}
        onFinished={() => result && onDraft(result.setup, result.values)}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl animate-rise flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="-ml-3 self-start text-muted-foreground" onClick={onBack}>
          <ArrowLeft />
          Back
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Describe your business</h1>
        <p className="text-base text-pretty text-muted-foreground">
          What do people book, how long does it take, what does it cost, and when are you open? Plain words
          are perfect.
        </p>
      </div>

      <Form form={form} onSubmit={submit} className="gap-6">
        <FormField name="description" label="About your business" required>
          {(field) => (
            <Textarea
              {...field}
              rows={6}
              autoFocus
              className="min-h-40 text-base sm:text-[0.9375rem] sm:leading-7"
              placeholder="We're a two-bay car wash in Galway, open Mon–Sat 8–6, valets from €40…"
            />
          )}
        </FormField>

        <div className="-mt-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-subtle-foreground" id="examples-label">
            Need inspiration? Try an example
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="examples-label">
            {EXAMPLES.map((ex) => {
              const active = description === ex.text;
              return (
                <button
                  key={ex.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    form.setValue("description", ex.text, {
                      shouldValidate: form.formState.isSubmitted,
                      shouldDirty: true,
                    })
                  }
                  className={cn(
                    "inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors pointer-coarse:h-11 pointer-coarse:px-4",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    active
                      ? "border-brand-border bg-brand-soft text-brand-soft-foreground"
                      : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground dark:bg-surface-raised",
                  )}
                >
                  {ex.label}
                </button>
              );
            })}
          </div>
        </div>

        <FormField
          name="websiteUrl"
          label="Your website"
          optional
          help="If you have one, we'll use it for context."
        >
          {(field) => (
            <Input
              {...field}
              type="url"
              inputMode="url"
              autoComplete="url"
              leading={<Globe />}
              placeholder="example.ie"
            />
          )}
        </FormField>

        <FormRootError />

        <div className="flex flex-col-reverse items-stretch gap-3 border-t border-border-subtle pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Nothing is published until you review it and click Create.
          </p>
          <Button type="submit" variant="primary" size="lg">
            <AiIcon />
            Draft my setup
          </Button>
        </div>
      </Form>
    </div>
  );
}
