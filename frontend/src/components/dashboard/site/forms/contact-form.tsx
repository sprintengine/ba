"use client";

import Link from "next/link";
import type { ContactContent, SiteSectionOf } from "@/lib/api/types";
import { LIMITS } from "@/lib/site/schema";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { TextField, ToggleField, useContentForm } from "./fields";
import { SectionForm } from "./section-form";

export function ContactForm({ section }: { section: SiteSectionOf<"contact"> }) {
  const form = useContentForm(section);
  const business = useCurrentBusiness();
  return (
    <SectionForm form={form}>
      <p className="text-sm text-muted-foreground">
        Phone, email and address come from{" "}
        <Link
          className="font-medium text-brand hover:underline"
          href={dashboardHref(business.slug, "settings/general")}
        >
          settings
        </Link>
        .
      </p>
      <TextField<ContactContent> name="heading" label="Heading" max={LIMITS.heading} />
      <TextField<ContactContent>
        name="body"
        label="Text"
        max={LIMITS.contactBody}
        optional
        multiline
        rows={2}
      />
      <ToggleField<ContactContent> name="showPhone" label="Show phone" />
      <ToggleField<ContactContent> name="showEmail" label="Show email" />
      <ToggleField<ContactContent> name="showAddress" label="Show address" />
    </SectionForm>
  );
}
