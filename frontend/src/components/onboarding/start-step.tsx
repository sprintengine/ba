"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { useMe, useTemplates } from "@/lib/api/hooks";
import { errorMessage } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { templateIcon } from "./template-icon";

const GENERIC = "generic";

export function StartStep({
  onDescribe,
  onPickTemplate,
  pendingTemplate,
  templateError,
}: {
  onDescribe: () => void;
  onPickTemplate: (key: string) => void;
  /** Key of the template currently loading (shows a spinner on its card). */
  pendingTemplate: string | null;
  /** Shown when a template (e.g. from `?template=`) couldn't be loaded. */
  templateError: string | null;
}) {
  const me = useMe();
  const templates = useTemplates();
  const generic = templates.data?.find((t) => t.key === GENERIC);
  const firstName = me.data?.user.name?.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto flex w-full max-w-3xl animate-rise flex-col gap-10">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-brand">{firstName ? `Welcome, ${firstName}` : "Welcome"}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Let&rsquo;s set up your booking page
        </h1>
        <p className="max-w-2xl text-base text-pretty text-muted-foreground">
          Describe your business and we&rsquo;ll draft your services, prices, opening hours and booking
          questions. You review everything before anything goes live.
        </p>
      </header>

      <button
        type="button"
        onClick={onDescribe}
        className={cn(
          "group relative flex w-full items-start gap-4 overflow-hidden rounded-2xl border border-brand-border bg-surface p-5 text-left shadow-sm sm:items-center sm:p-6",
          "transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:shadow-md",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_0%,var(--brand-soft)_0%,transparent_55%)] opacity-90"
        />
        <span className="relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-button">
          <Sparkles aria-hidden className="size-5" />
        </span>
        <span className="relative flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">Describe your business</span>
            <Badge tone="brand">Recommended</Badge>
          </span>
          <span className="text-sm text-pretty text-muted-foreground">
            Write a sentence or two, the way you&rsquo;d explain it to a new colleague. AI drafts the whole
            setup and you can change any of it.
          </span>
        </span>
        <span className="relative hidden size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground sm:flex">
          <ArrowRight aria-hidden className="size-4" />
        </span>
      </button>

      <section aria-labelledby="templates-heading" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h2 id="templates-heading" className="text-sm font-medium text-muted-foreground">
            Or start from a template
          </h2>
          <span aria-hidden className="h-px flex-1 bg-border" />
        </div>

        {templateError && (
          <p
            role="alert"
            className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2.5 text-sm text-warning-soft-foreground"
          >
            {templateError}
          </p>
        )}

        {templates.isPending ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="Loading templates"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
                <Skeleton className="size-9 rounded-lg" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : templates.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-5 text-sm">
            <p className="text-muted-foreground">
              {errorMessage(templates.error, "We couldn't load the templates.")} You can still describe your
              business above.
            </p>
            <Button size="sm" onClick={() => templates.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.data
              .filter((t) => t.key !== GENERIC)
              .map((t) => {
                const Icon = templateIcon(t.icon);
                const loading = pendingTemplate === t.key;
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      onClick={() => onPickTemplate(t.key)}
                      disabled={!!pendingTemplate}
                      aria-busy={loading || undefined}
                      className={cn(
                        "group flex h-full w-full flex-col items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left shadow-xs dark:bg-surface-raised",
                        "transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-md",
                        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        "disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-xs",
                        pendingTemplate && !loading && "opacity-50",
                      )}
                    >
                      <span className="flex w-full items-center justify-between">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-brand-soft group-hover:text-brand-soft-foreground">
                          <Icon aria-hidden className="size-[1.125rem]" />
                        </span>
                        {loading && <Spinner className="size-4 text-muted-foreground" />}
                      </span>
                      <span className="flex flex-col gap-1">
                        <span className="text-sm font-semibold">{t.name}</span>
                        <span className="line-clamp-2 text-sm text-muted-foreground">{t.description}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
        {generic && (
          <button
            type="button"
            onClick={() => onPickTemplate(generic.key)}
            disabled={!!pendingTemplate}
            aria-busy={pendingTemplate === generic.key || undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border border-dashed border-border-strong px-4 py-3 text-left text-sm transition-colors",
              "outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              pendingTemplate && pendingTemplate !== generic.key && "opacity-50",
            )}
          >
            {/* Wraps under the label on phones rather than cutting the description off. */}
            <span className="flex min-w-0 flex-1 flex-col gap-x-3 sm:flex-row">
              <span className="font-medium">Something else?</span>
              <span className="text-muted-foreground">Start from a simple, blank setup</span>
            </span>
            {pendingTemplate === generic.key ? (
              <Spinner className="size-4 text-muted-foreground" />
            ) : (
              <ArrowRight aria-hidden className="size-4 shrink-0 text-subtle-foreground" />
            )}
          </button>
        )}
      </section>
    </div>
  );
}
