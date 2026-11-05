"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { ChecklistKey } from "@/lib/api/types";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { checklistProgress, checklistSteps, type ChecklistStep } from "@/lib/dashboard/overview";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** "Get set up": progress and the remaining steps (links), until everything is done. */
export function SetupChecklist({ items }: { items: { key: ChecklistKey; done: boolean }[] }) {
  const { v } = useVocabulary();
  const progress = checklistProgress(items);
  if (progress.complete) return null;
  const steps = checklistSteps(v);
  return (
    <Card>
      <CardHeader>
        <CardTitle headingLevel={2}>Get set up</CardTitle>
        <CardDescription>
          {progress.done} of {progress.total} done
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-3 pb-3">
        <div
          className="mx-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <ul className="flex flex-col">
          {/* The bar and the count already say what's done: the list is what's left. */}
          {items
            .filter((item) => !item.done)
            .map((item) => (
              <li key={item.key}>
                <ChecklistItem step={steps[item.key]} done={false} />
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** One step: a link while it is to do; plain (and struck through) once done or when only the owner can do it. */
function ChecklistItem({ step, done }: { step: ChecklistStep; done: boolean }) {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const locked = step.ownerOnly && !perms.managePayments;
  const content = (
    <>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border",
          done ? "border-transparent bg-success text-success-foreground" : "border-border-strong",
        )}
      >
        {done && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("text-sm font-medium", done && "text-muted-foreground")}>{step.label}</span>
        {!done && (
          <span className="text-xs text-muted-foreground">
            {locked ? "Ask the owner to do this." : step.hint}
          </span>
        )}
      </span>
      {!done && !locked && (
        <ArrowRight className="size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
      )}
    </>
  );
  return done || locked ? (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2">{content}</div>
  ) : (
    <Link
      href={dashboardHref(business.slug, step.href)}
      className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/60"
    >
      {content}
    </Link>
  );
}
