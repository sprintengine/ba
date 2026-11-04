"use client";

import type { GeneratedPattern, SiteImage } from "@/lib/api/types";
import type { ImageStyle } from "@/lib/site/themes";
import { cn } from "@/lib/utils";
import { GeneratedArt } from "./generated-art";

/**
 * An image slot: an uploaded or stock photo (with Unsplash attribution, as their guidelines
 * require) or a generated background. `treatment` is the theme's image style (arch, tilted…).
 */
export function SiteMedia({
  image,
  fallbackPattern,
  treatment,
  className,
  frameClassName,
  eager = false,
}: {
  image: SiteImage | null;
  fallbackPattern: GeneratedPattern;
  treatment: ImageStyle;
  /** Sizes the outer box (aspect ratio, width). */
  className?: string;
  frameClassName?: string;
  eager?: boolean;
}) {
  const frame = (
    <div className={cn("relative size-full overflow-hidden bg-muted", FRAME[treatment], frameClassName)}>
      <SiteImageFill image={image} fallbackPattern={fallbackPattern} eager={eager} />
    </div>
  );
  return (
    <div className={cn("relative", className)}>
      {treatment === "tilted" && (
        <span
          aria-hidden
          className="absolute inset-0 translate-x-3 translate-y-3 rotate-3 rounded-image bg-highlight-fill"
        />
      )}
      {treatment === "sharp" && (
        <span
          aria-hidden
          className="absolute inset-0 translate-x-2.5 translate-y-2.5 rounded-image bg-foreground"
        />
      )}
      {treatment === "framed" ? (
        <div className="size-full border border-border bg-surface p-2 @3xl:p-3">{frame}</div>
      ) : (
        frame
      )}
    </div>
  );
}

const FRAME: Record<ImageStyle, string> = {
  rounded: "rounded-image",
  arch: "rounded-t-[999px] rounded-b-image",
  sharp: "rounded-image",
  tilted: "-rotate-2 rounded-image ring-4 ring-surface",
  framed: "",
};

/** The picture itself, filling its box (used for covers and cards too). */
export function SiteImageFill({
  image,
  fallbackPattern,
  tone = "soft",
  eager = false,
}: {
  image: SiteImage | null;
  fallbackPattern: GeneratedPattern;
  tone?: "soft" | "deep";
  eager?: boolean;
}) {
  if (!image || image.kind === "generated" || !image.url) {
    return <GeneratedArt pattern={image?.pattern ?? fallbackPattern} tone={tone} />;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- owner uploads and Unsplash hotlinks (required by their API terms) */}
      <img
        src={image.url}
        alt={image.alt}
        loading={eager ? "eager" : "lazy"}
        // Eager is the hero, usually the page's largest paint: fetched ahead of other images.
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
      {image.kind === "stock" && image.attribution && <StockCredit attribution={image.attribution} />}
    </>
  );
}

export function StockCredit({ attribution }: { attribution: { name: string; url: string } }) {
  return (
    <p className="absolute right-2 bottom-2 z-10 max-w-[80%] truncate rounded-full bg-black/55 px-2.5 py-1 text-2xs text-white/90 backdrop-blur-sm">
      Photo by{" "}
      <a
        href={attribution.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-white underline-offset-2 hover:underline"
      >
        {attribution.name}
      </a>{" "}
      on{" "}
      <a
        href="https://unsplash.com/?utm_source=bookanything&utm_medium=referral"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-white underline-offset-2 hover:underline"
      >
        Unsplash
      </a>
    </p>
  );
}
