"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSiteRender } from "./site-render-context";
import { EYEBROW, TYPE } from "./theme-classes";

export function SiteContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 @3xl:px-8", className)}>{children}</div>;
}

export type SectionTone = "plain" | "sunken" | "brand";

/** A page section: anchor, theme spacing and background tone. */
export function SectionShell({
  anchor,
  sectionId,
  tone = "plain",
  className,
  children,
}: {
  anchor: string;
  sectionId: string;
  tone?: SectionTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={anchor}
      data-section-id={sectionId}
      className={cn(
        "site-section relative scroll-mt-20",
        tone === "sunken" && "bg-surface-sunken",
        tone === "brand" && "bg-brand text-brand-foreground",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  const { theme } = useSiteRender();
  return <p className={cn(EYEBROW[theme.eyebrow], className)}>{children}</p>;
}

/** Section title block: eyebrow, heading and intro. */
export function SectionIntro({
  eyebrow,
  heading,
  intro,
  align = "start",
  className,
}: {
  eyebrow?: string | null;
  heading: string | null;
  intro?: string | null;
  align?: "start" | "center";
  className?: string;
}) {
  const { plan } = useSiteRender();
  if (!heading && !intro) return null;
  return (
    <header
      className={cn(
        "flex max-w-2xl flex-col gap-4",
        align === "center" && "mx-auto items-center text-center",
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {heading && <h2 className={cn("site-heading", TYPE[plan.theme].title)}>{heading}</h2>}
      {intro && <p className={cn("text-pretty text-muted-foreground", TYPE[plan.theme].lead)}>{intro}</p>}
    </header>
  );
}

/** A link into the booking flow, styled as a button. */
export function BookButton({
  serviceId,
  children,
  arrow = false,
  ...props
}: Omit<ButtonProps, "asChild"> & { serviceId?: string; arrow?: boolean }) {
  const { bookHref } = useSiteRender();
  return (
    <Button asChild variant="primary" {...props}>
      <Link href={bookHref(serviceId)}>
        {children}
        {arrow && <ArrowRight aria-hidden />}
      </Link>
    </Button>
  );
}

/** Shown in the editor preview only, where the public page would hide an empty section. */
export function EmptyHint({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface-sunken/60 px-5 py-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
