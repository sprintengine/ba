"use client";

import { cn } from "@/lib/utils";
import { EmptyHint, SectionIntro, SectionShell, SiteContainer } from "../primitives";
import { SiteImageFill } from "../site-media";
import { useSiteRender } from "../site-render-context";
import type { SectionProps } from "./types";

export function GallerySection({ section, anchor }: SectionProps<"gallery">) {
  const { theme } = useSiteRender();
  const images = section.content.images;
  return (
    <SectionShell anchor={anchor} sectionId={section.id}>
      <SiteContainer className="flex flex-col gap-10">
        <SectionIntro heading={section.content.heading} />
        {images.length === 0 ? (
          <EmptyHint title="No photos yet">
            Upload photos of your place and your work, or pick stock photos.
          </EmptyHint>
        ) : (
          <ul className={cn("grid grid-cols-2 gap-3 @3xl:gap-4", images.length >= 3 && "@4xl:grid-cols-3")}>
            {images.map((img, i) => (
              <li
                key={`${img.url ?? img.pattern}-${i}`}
                className={cn(
                  "relative overflow-hidden bg-muted",
                  theme.image === "framed" ? "border border-border" : "rounded-image",
                  // A feature tile keeps the grid from looking like a contact sheet.
                  i === 0 && images.length >= 3 ? "col-span-2 row-span-2 aspect-square" : "aspect-square",
                )}
              >
                <SiteImageFill image={img} fallbackPattern={theme.defaultPattern} />
              </li>
            ))}
          </ul>
        )}
      </SiteContainer>
    </SectionShell>
  );
}
