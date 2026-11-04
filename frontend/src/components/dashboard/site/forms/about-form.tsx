"use client";

import { useState } from "react";
import type { AboutContent, SiteSectionOf } from "@/lib/api/types";
import { LIMITS } from "@/lib/site/schema";
import { FormField } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { ImageField } from "../images/image-field";
import { TextField, useContentForm } from "./fields";
import { SectionForm } from "./section-form";

export function AboutForm({ section }: { section: SiteSectionOf<"about"> }) {
  const form = useContentForm(section);
  return (
    <SectionForm form={form}>
      <TextField<AboutContent> name="heading" label="Heading" max={LIMITS.heading} />
      <TextField<AboutContent>
        name="body"
        label="Text"
        max={LIMITS.aboutBody}
        multiline
        rows={6}
        help="Leave a blank line between paragraphs."
      />
      <FormField<AboutContent, "highlights">
        name="highlights"
        label="Highlights"
        optional
        help={`One per line, up to ${LIMITS.highlights}. Only things that are true, e.g. "Evening appointments".`}
      >
        {(field) => <LinesInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
      </FormField>
      <ImageField<AboutContent> name="image" label="Image" />
    </SectionForm>
  );
}

/** A textarea editing a list of short lines (blank lines are ignored). */
function LinesInput({
  value,
  onChange,
  onBlur,
}: {
  value: string[];
  onChange: (lines: string[]) => void;
  onBlur: () => void;
}) {
  const [text, setText] = useState(value.join("\n"));
  return (
    <Textarea
      rows={4}
      value={text}
      onBlur={onBlur}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
