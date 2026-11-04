"use client";

import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/ui/page-header";

/** Layout pieces shared by the kitchen sink sections. */

export const TZ = "Europe/Dublin";

export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <SectionHeader title={title} description={description} className="mb-3 border-b border-border pb-3" />
      <div className="pt-3">{children}</div>
    </section>
  );
}

export function Demo({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-xs font-medium text-subtle-foreground">{label}</span>}
      <div className={cn("flex flex-wrap items-center gap-3", className)}>{children}</div>
    </div>
  );
}
