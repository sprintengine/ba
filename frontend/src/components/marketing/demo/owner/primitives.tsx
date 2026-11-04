"use client";

import { CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Label row as the real Field draws it. */
export function DemoLabel({
  children,
  optional,
  required,
}: {
  children: string;
  optional?: boolean;
  required?: boolean;
}) {
  return (
    <span className="text-sm leading-5 font-medium text-foreground">
      {children}
      {required && <span className="ml-0.5 text-danger">*</span>}
      {optional && <span className="ml-1.5 text-xs font-normal text-subtle-foreground">Optional</span>}
    </span>
  );
}

/** The sonner toast as the app styles it, bottom-right. */
export function DemoToast({ toast }: { toast: { title: string; description?: string } | null }) {
  return (
    <div
      className={cn(
        "absolute right-6 bottom-6 z-40 flex w-[22rem] items-start gap-2.5 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm shadow-lg transition-[opacity,transform] duration-300 ease-out",
        toast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
      <div className="min-w-0">
        <p className="font-medium">{toast?.title}</p>
        {toast?.description && <p className="text-muted-foreground">{toast.description}</p>}
      </div>
    </div>
  );
}

/** The dimmed, blurred backdrop behind sheets. */
export function DemoOverlay({ show }: { show: boolean }) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-30 bg-overlay transition-opacity duration-300",
        show ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    />
  );
}

/** A right-hand sheet that slides in over the dashboard. */
export function DemoSheet({
  open,
  width,
  children,
  className,
}: {
  open: boolean;
  width: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute inset-y-0 right-0 z-30 flex flex-col border-l border-border bg-surface-raised shadow-xl transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        open ? "translate-x-0" : "translate-x-full",
        className,
      )}
      style={{ width }}
    >
      {children}
    </div>
  );
}
