"use client";

import { ShieldCheck } from "lucide-react";
import type { SiteSectionOf, TestimonialsContent } from "@/lib/api/types";
import { LIMITS } from "@/lib/site/schema";
import { TextField, useContentForm } from "./fields";
import { ListField } from "./list-field";
import { SectionForm } from "./section-form";

export function TestimonialsForm({ section }: { section: SiteSectionOf<"testimonials"> }) {
  const form = useContentForm(section);
  return (
    <SectionForm form={form}>
      <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2.5 text-sm text-info-soft-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Only add real words from real customers, with their permission. The AI never writes testimonials.
      </p>
      <TextField<TestimonialsContent> name="heading" label="Heading" max={LIMITS.heading} />
      <ListField<TestimonialsContent, "items">
        name="items"
        label="Testimonials"
        itemLabel="testimonial"
        max={LIMITS.testimonials}
        newItem={() => ({ quote: "", author: "", detail: null })}
        empty={
          <p className="text-sm text-muted-foreground">
            This section stays hidden on your site until you add one.
          </p>
        }
        renderItem={(i) => (
          <>
            <TextField<TestimonialsContent>
              name={`items.${i}.quote`}
              label="Quote"
              max={LIMITS.quote}
              multiline
              rows={2}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField<TestimonialsContent> name={`items.${i}.author`} label="Name" max={LIMITS.author} />
              <TextField<TestimonialsContent>
                name={`items.${i}.detail`}
                label="Detail"
                max={LIMITS.detail}
                optional
                placeholder="e.g. Customer since 2024"
              />
            </div>
          </>
        )}
      />
    </SectionForm>
  );
}
