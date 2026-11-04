"use client";

import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { quickActions } from "@/lib/assistant/quick-actions";
import { useBusinessContext } from "@/lib/business/business-context";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { useAssistant } from "./assistant-context";

const chip =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-xs pointer-coarse:min-h-11 pointer-coarse:px-4 pointer-coarse:text-sm transition-colors hover:border-border-strong hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

/** Starting points: questions for Bo (only when AI is available) and shortcuts that always work. */
export function QuickActions({ className, onNavigate }: { className?: string; onNavigate: () => void }) {
  const { business, role } = useBusinessContext();
  const { v } = useVocabulary();
  const { ask, state } = useAssistant();
  const canAsk = !!state?.configured && !state.credits.limitReached;
  const actions = quickActions(role, {
    booking: v("booking", { title: true }),
    bookings: v("bookings", { title: true }),
    customer: v("customer"),
  });
  return (
    <ul className={cn("flex flex-wrap gap-2", className)} aria-label="Quick actions">
      {actions.map((a) => (
        <li key={a.id}>
          {a.kind === "ask" ? (
            <button type="button" className={chip} disabled={!canAsk} onClick={() => ask(a.prompt)}>
              <Sparkles className="size-3.5 text-brand" aria-hidden /> {a.label}
            </button>
          ) : (
            <Link href={dashboardHref(business.slug, a.path)} onClick={onNavigate} className={chip}>
              {a.label} <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
