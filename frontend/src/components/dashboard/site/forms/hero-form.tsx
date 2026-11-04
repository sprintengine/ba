"use client";

import type { HeroContent, HeroVariant, SiteSectionOf } from "@/lib/api/types";
import { LIMITS } from "@/lib/site/schema";
import { FormField } from "@/components/ui/form";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ImageField } from "../images/image-field";
import { TextField, useContentForm } from "./fields";
import { SectionForm } from "./section-form";

const VARIANTS: { value: HeroVariant; label: string }[] = [
  { value: "split", label: "Split" },
  { value: "cover", label: "Cover" },
  { value: "minimal", label: "Minimal" },
];

export function HeroForm({ section }: { section: SiteSectionOf<"hero"> }) {
  const form = useContentForm(section);
  return (
    <SectionForm form={form}>
      <FormField<HeroContent, "variant">
        name="variant"
        label="Layout"
        help="Split puts the image beside the text, Cover behind it, Minimal is type only."
      >
        {(field) => (
          <SegmentedControl
            aria-label="Hero layout"
            value={field.value}
            onValueChange={field.onChange}
            options={VARIANTS}
          />
        )}
      </FormField>
      <TextField<HeroContent>
        name="eyebrow"
        label="Eyebrow"
        max={LIMITS.eyebrow}
        optional
        placeholder="e.g. Dublin 2 · Book online"
      />
      <TextField<HeroContent> name="headline" label="Headline" max={LIMITS.headline} />
      <TextField<HeroContent> name="subheadline" label="Intro" max={LIMITS.subheadline} optional multiline />
      <TextField<HeroContent>
        name="ctaLabel"
        label="Book button"
        max={LIMITS.ctaLabel}
        optional
        placeholder="Book now"
      />
      <ImageField<HeroContent> name="image" label="Image" help="Used beside or behind the headline." />
    </SectionForm>
  );
}
