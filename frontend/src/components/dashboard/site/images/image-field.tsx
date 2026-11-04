"use client";

import { useState } from "react";
import { useController, type FieldPath, type FieldValues } from "react-hook-form";
import { ImagePlus, Trash2 } from "lucide-react";
import type { SiteImage } from "@/lib/api/types";
import { describeImage } from "@/lib/site/images";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { SiteImageFill } from "@/components/site/site-media";
import { SiteScope } from "@/components/site/site-scope";
import { siteTheme } from "@/lib/site/themes";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useEditor } from "../use-site-editor";
import { ImagePicker, type ImageSource } from "./image-picker";

/** An image slot in a section form: thumbnail, change (picker), remove and alt text. */
export function ImageField<T extends FieldValues>({
  name,
  label,
  help,
  sources,
}: {
  name: FieldPath<T>;
  label: string;
  help?: string;
  sources?: ImageSource[];
}) {
  const { field, fieldState } = useController<T>({ name });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <ImageSlot value={field.value} onChange={field.onChange} sources={sources} />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {fieldState.error && (
        <p role="alert" className="text-xs text-danger">
          {fieldState.error.message ?? "Check this image"}
        </p>
      )}
    </fieldset>
  );
}

export function ImageSlot({
  value,
  onChange,
  sources,
}: {
  value: SiteImage | null;
  onChange: (image: SiteImage | null) => void;
  sources?: ImageSource[];
}) {
  const business = useCurrentBusiness();
  const { plan, site } = useEditor();
  const [open, setOpen] = useState(false);
  const theme = siteTheme(plan.theme);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <SiteScope
          theme={plan.theme}
          palette={plan.palette}
          className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border"
        >
          <SiteImageFill image={value} fallbackPattern={theme.defaultPattern} />
        </SiteScope>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="truncate text-sm text-muted-foreground">{describeImage(value)}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setOpen(true)}>
              <ImagePlus aria-hidden /> {value ? "Change" : "Add image"}
            </Button>
            {value && (
              <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                <Trash2 aria-hidden /> Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      {value && value.kind !== "generated" && (
        <Field label="Alt text" optional help="Describe the image for people using screen readers.">
          <Input
            value={value.alt}
            maxLength={140}
            onChange={(e) => onChange({ ...value, alt: e.target.value })}
          />
        </Field>
      )}
      <ImagePicker
        open={open}
        onOpenChange={setOpen}
        onPick={onChange}
        businessId={business.id}
        theme={plan.theme}
        palette={plan.palette}
        stockEnabled={site.stock.enabled}
        uploadsEnabled={site.uploads.enabled}
        maxBytes={site.uploads.maxBytes}
        current={value}
        sources={sources}
      />
    </div>
  );
}
