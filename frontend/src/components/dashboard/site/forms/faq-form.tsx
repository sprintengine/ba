"use client";

import type { FaqContent, SiteSectionOf } from "@/lib/api/types";
import { LIMITS } from "@/lib/site/schema";
import { TextField, useContentForm } from "./fields";
import { ListField } from "./list-field";
import { SectionForm } from "./section-form";

export function FaqForm({ section }: { section: SiteSectionOf<"faq"> }) {
  const form = useContentForm(section);
  return (
    <SectionForm form={form}>
      <TextField<FaqContent> name="heading" label="Heading" max={LIMITS.heading} />
      <ListField<FaqContent, "items">
        name="items"
        label="Questions"
        itemLabel="question"
        max={LIMITS.faqItems}
        newItem={() => ({ question: "", answer: "" })}
        renderItem={(i) => (
          <>
            <TextField<FaqContent> name={`items.${i}.question`} label="Question" max={LIMITS.question} />
            <TextField<FaqContent>
              name={`items.${i}.answer`}
              label="Answer"
              max={LIMITS.answer}
              multiline
              rows={3}
            />
          </>
        )}
      />
    </SectionForm>
  );
}
