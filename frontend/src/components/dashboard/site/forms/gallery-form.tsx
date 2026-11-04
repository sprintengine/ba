"use client";

import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { ImagePlus, X } from "lucide-react";
import type { GalleryContent, SiteSectionOf } from "@/lib/api/types";
import { LIMITS } from "@/lib/site/schema";
import { siteTheme } from "@/lib/site/themes";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { SiteImageFill } from "@/components/site/site-media";
import { SiteScope } from "@/components/site/site-scope";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ImagePicker } from "../images/image-picker";
import { useEditor } from "../use-site-editor";
import { TextField, useContentForm } from "./fields";
import { SectionForm } from "./section-form";

export function GalleryForm({ section }: { section: SiteSectionOf<"gallery"> }) {
  const form = useContentForm(section);
  return (
    <SectionForm form={form}>
      <TextField<GalleryContent> name="heading" label="Heading" max={LIMITS.heading} optional />
      <GalleryImages />
    </SectionForm>
  );
}

function GalleryImages() {
  const business = useCurrentBusiness();
  const { plan, site } = useEditor();
  const [open, setOpen] = useState(false);
  const { control } = useFormContext<GalleryContent>();
  const { fields, append, remove } = useFieldArray<GalleryContent, "images">({ control, name: "images" });
  const images = useWatch<GalleryContent, "images">({ name: "images" });
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 flex w-full justify-between text-sm font-medium">
        Photos
        <span className="tnum text-xs font-normal text-muted-foreground">
          {fields.length}/{LIMITS.galleryImages}
        </span>
      </legend>
      {fields.length > 0 && (
        <SiteScope
          theme={plan.theme}
          palette={plan.palette}
          className="grid grid-cols-3 gap-2 bg-transparent"
        >
          {fields.map((f, i) => (
            <div
              key={f.id}
              className="relative aspect-square overflow-hidden rounded-lg border border-border"
            >
              <SiteImageFill
                image={images[i] ?? null}
                fallbackPattern={siteTheme(plan.theme).defaultPattern}
              />
              <IconButton
                label={`Remove photo ${i + 1}`}
                size="xs"
                variant="secondary"
                className="absolute top-1 right-1 z-20"
                onClick={() => remove(i)}
              >
                <X />
              </IconButton>
            </div>
          ))}
        </SiteScope>
      )}
      <Button
        size="sm"
        className="self-start"
        disabled={fields.length >= LIMITS.galleryImages}
        onClick={() => setOpen(true)}
      >
        <ImagePlus aria-hidden /> Add photo
      </Button>
      <ImagePicker
        open={open}
        onOpenChange={setOpen}
        onPick={(img) => append(img)}
        businessId={business.id}
        theme={plan.theme}
        palette={plan.palette}
        stockEnabled={site.stock.enabled}
        uploadsEnabled={site.uploads.enabled}
        maxBytes={site.uploads.maxBytes}
        sources={["upload", "stock"]}
      />
    </fieldset>
  );
}
