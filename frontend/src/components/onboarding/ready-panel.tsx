"use client";

import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import type { BusinessSetup } from "@/lib/api/types";
import { durationLabel, priceLabel } from "@/lib/booking/quote";
import type { SetupProblem } from "@/lib/onboarding/problems";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { cn } from "@/lib/utils";
import { BusinessTile } from "@/components/shells/business-tile";
import { Button } from "@/components/ui/button";
import { PUBLIC_HOST } from "./slug-field";

type ReadyPanelProps = {
  setup: BusinessSetup;
  problems: SetupProblem[];
  attempted: boolean;
  rootError: string | null;
  creating: boolean;
  checkingSlug: boolean;
  onJump: (p: SetupProblem) => void;
  onCreate: () => void;
};

/** The review step's summary: a booking page preview, what's left to fix, and Create. */
export function ReadyPanel({
  setup,
  problems,
  attempted,
  rootError,
  creating,
  checkingSlug,
  onJump,
  onCreate,
}: ReadyPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <BookingPagePreview setup={setup} />
      <ProblemsCard
        setup={setup}
        problems={problems}
        attempted={attempted}
        rootError={rootError}
        creating={creating}
        checkingSlug={checkingSlug}
        onJump={onJump}
        onCreate={onCreate}
      />
    </div>
  );
}

/** A small preview of the public booking page in the business's colour. */
function BookingPagePreview({ setup }: { setup: BusinessSetup }) {
  const shown = setup.services.slice(0, 4);
  const more = setup.services.length - shown.length;
  const name = setup.name.trim() || "Your business";
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <p className="border-b border-border-subtle bg-surface-sunken/60 px-4 py-2 text-2xs font-medium tracking-wide text-subtle-foreground uppercase">
        Booking page preview
      </p>
      <BusinessThemeProvider primaryColor={setup.branding.primaryColor} className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-3">
          <BusinessTile name={name} color={setup.branding.primaryColor} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate font-mono text-2xs text-muted-foreground">
              {PUBLIC_HOST}/{setup.slug || "…"}
            </p>
          </div>
        </div>
        {shown.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {shown.map((s, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.name || "Unnamed service"}</span>
                  <span className="block text-xs text-muted-foreground">{durationLabel(s)}</span>
                </span>
                <span className="tnum shrink-0 text-sm">{priceLabel(s, setup.currency)}</span>
              </li>
            ))}
            {more > 0 && <li className="px-3 py-2 text-xs text-muted-foreground">+{more} more</li>}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No services yet
          </p>
        )}
        <span
          aria-hidden
          className="flex h-9 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-button"
        >
          Book{" "}
          {setup.vocabulary.booking.toLowerCase() === "booking"
            ? "now"
            : `${article(setup.vocabulary.booking)} ${setup.vocabulary.booking.toLowerCase()}`}
        </span>
      </BusinessThemeProvider>
    </div>
  );
}

/** "Ready to create" with a count, or the problems to fix (each jumps to its field), and the Create button. */
function ProblemsCard({
  setup,
  problems,
  attempted,
  rootError,
  creating,
  checkingSlug,
  onJump,
  onCreate,
}: ReadyPanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4",
        problems.length > 0 && attempted
          ? "border-danger-border bg-danger-soft/40"
          : "border-border bg-surface",
      )}
    >
      {problems.length === 0 ? (
        <div className="flex items-start gap-2.5">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">Ready to create</p>
            <p className="text-xs text-muted-foreground">
              {setup.resources.length}{" "}
              {setup.resources.length === 1
                ? setup.vocabulary.resource.toLowerCase()
                : setup.vocabulary.resources.toLowerCase()}{" "}
              · {setup.services.length} {setup.services.length === 1 ? "service" : "services"} ·{" "}
              {setup.questions.length} {setup.questions.length === 1 ? "question" : "questions"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2" role={attempted ? "alert" : undefined}>
          <p className="flex items-center gap-2 text-sm font-medium">
            <CircleAlert aria-hidden className="size-4 shrink-0 text-danger" />
            {problems.length === 1
              ? "1 thing to fix before creating"
              : `${problems.length} things to fix before creating`}
          </p>
          <ul className="flex flex-col gap-0.5">
            {problems.slice(0, 6).map((p) => (
              <li key={p.path}>
                <button
                  type="button"
                  onClick={() => onJump(p)}
                  className="group flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{p.label}</span>
                    <span className="block text-muted-foreground">{p.message}</span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="mt-0.5 size-3 shrink-0 text-subtle-foreground group-hover:text-foreground"
                  />
                </button>
              </li>
            ))}
            {problems.length > 6 && (
              <li className="px-1.5 text-xs text-muted-foreground">and {problems.length - 6} more</li>
            )}
          </ul>
        </div>
      )}
      {rootError && (
        <p
          role="alert"
          className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground"
        >
          {rootError}
        </p>
      )}
      <Button
        variant="primary"
        size="lg"
        block
        onClick={onCreate}
        loading={creating}
        className="hidden lg:inline-flex"
      >
        Create business
      </Button>
      <p className="hidden text-center text-xs text-muted-foreground lg:block">
        {checkingSlug ? "Checking your address…" : "Goes live right away. You can change anything later."}
      </p>
    </div>
  );
}

const article = (word: string) => (/^[aeiou]/i.test(word.trim()) ? "an" : "a");
