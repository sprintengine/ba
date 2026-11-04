"use client";

import Link from "next/link";
import type { HoursContent, SiteSectionOf } from "@/lib/api/types";
import { LIMITS } from "@/lib/site/schema";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { TextField, ToggleField, useContentForm } from "./fields";
import { SectionForm } from "./section-form";

export function HoursForm({ section }: { section: SiteSectionOf<"hours"> }) {
  const form = useContentForm(section);
  const business = useCurrentBusiness();
  return (
    <SectionForm form={form}>
      <p className="text-sm text-muted-foreground">
        Hours come from your{" "}
        <Link
          className="font-medium text-brand hover:underline"
          href={dashboardHref(business.slug, "resources")}
        >
          weekly availability
        </Link>{" "}
        and the address from{" "}
        <Link
          className="font-medium text-brand hover:underline"
          href={dashboardHref(business.slug, "settings/general")}
        >
          settings
        </Link>
        , so they are always up to date.
      </p>
      <TextField<HoursContent> name="heading" label="Heading" max={LIMITS.heading} />
      <TextField<HoursContent>
        name="note"
        label="Note"
        max={LIMITS.note}
        optional
        multiline
        rows={2}
        placeholder="e.g. Free parking behind the building"
      />
      <ToggleField<HoursContent> name="showAddress" label="Show address" />
      <ToggleField<HoursContent> name="showMapLink" label="Show a directions link" />
    </SectionForm>
  );
}
