"use client";

import type { CtaContent, SiteSectionOf } from "@/lib/api/types";
import { LIMITS } from "@/lib/site/schema";
import { TextField, useContentForm } from "./fields";
import { SectionForm } from "./section-form";

export function CtaForm({ section }: { section: SiteSectionOf<"cta"> }) {
  const form = useContentForm(section);
  return (
    <SectionForm form={form}>
      <TextField<CtaContent> name="headline" label="Headline" max={LIMITS.headline} />
      <TextField<CtaContent> name="body" label="Text" max={LIMITS.ctaBody} optional multiline rows={2} />
      <TextField<CtaContent> name="buttonLabel" label="Button" max={LIMITS.ctaLabel} />
    </SectionForm>
  );
}
