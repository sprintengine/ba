"use client";

import { ChevronRight, Clock, Sparkles } from "lucide-react";
import type { PublicService } from "@/lib/api/types";
import { durationLabel, priceSummary } from "@/lib/booking/quote";
import { groupByCategory } from "@/lib/booking/services";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { useDemoTarget } from "../engine/demo-context";
import { LUMEN, LUMEN_SERVICES } from "./fixture";
import { SAM_ID, SERVICE_ID } from "./state";

/* The flow's first two steps, as components/booking/steps.tsx renders them on a phone. */

const SERVICE = LUMEN_SERVICES.find((s) => s.id === SERVICE_ID);

/** Step 1: the services, grouped by category, each a card with price, description and duration. */
export function ServiceStep() {
  return (
    <div className="flex flex-col gap-7">
      {groupByCategory(LUMEN_SERVICES).map((g) => (
        <section key={g.category ?? "all"} className="flex flex-col gap-2.5">
          {g.category && (
            <h3 className="text-xs font-semibold tracking-wide text-subtle-foreground uppercase">
              {g.category}
            </h3>
          )}
          <ul className="flex flex-col gap-2.5">
            {g.services.map((s) => (
              <li key={s.id}>
                <ServiceCard service={s} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ServiceCard({ service: s }: { service: PublicService }) {
  const t = useDemoTarget(`service-${s.id}`);
  const price = priceSummary(s);
  const meta = [durationLabel(s), s.options.length > 1 ? `${String(s.options.length)} options` : null];
  return (
    <div
      {...t.props}
      className={cn(
        "group relative flex w-full items-center gap-4 overflow-hidden rounded-xl border border-border bg-surface p-4 pl-5 text-left shadow-xs transition-[border-color,box-shadow,transform] duration-150 dark:bg-surface-raised",
        t.pressed && "scale-[0.995] border-primary shadow-[0_0_0_1px_var(--primary)]",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-4 left-0 w-[3px] rounded-r-full opacity-80"
        style={{ backgroundColor: s.color }}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start justify-between gap-3">
          <span className="text-[0.9375rem] leading-6 font-semibold tracking-tight">{s.name}</span>
          <span className="tnum shrink-0 text-[0.9375rem] leading-6 font-semibold">
            {price.kind === "from" && (
              <span className="mr-1 text-xs font-normal text-muted-foreground">from</span>
            )}
            {price.kind === "free"
              ? "Free"
              : formatMoney(price.cents, LUMEN.currency, { locale: LUMEN.locale })}
          </span>
        </span>
        {s.description && <span className="line-clamp-2 text-sm text-muted-foreground">{s.description}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {meta.filter(Boolean).map((m, i) => (
            <span key={i} className="inline-flex items-center gap-3">
              {i > 0 && <span aria-hidden className="size-0.5 rounded-full bg-subtle-foreground" />}
              {i === 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden />
                  {m}
                </span>
              ) : (
                m
              )}
            </span>
          ))}
        </span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-subtle-foreground" />
    </div>
  );
}

/** Step 2: any therapist, or one by name (a RadioCard each). */
export function TherapistStep({ chosen }: { chosen: string | null }) {
  const requirement = SERVICE?.selectableRequirement;
  if (!requirement) return null;
  return (
    <div className="grid gap-3">
      <TherapistCard
        id="therapist-any"
        icon={<Sparkles />}
        title={`Any ${requirement.label.toLowerCase()}`}
        description="See the most times — we'll match you with whoever is free."
        checked={false}
      />
      {requirement.resources.map((r) => (
        <TherapistCard
          key={r.id}
          id={r.id === SAM_ID ? "therapist-sam" : `therapist-${r.id}`}
          icon={<Avatar name={r.name} shape="square" className="size-9 rounded-lg text-xs" />}
          title={r.name}
          description={r.description}
          checked={chosen === r.id}
        />
      ))}
    </div>
  );
}

/** components/ui/radio-group.tsx's RadioCard, its checked state driven by the script. */
function TherapistCard({
  id,
  icon,
  title,
  description,
  checked,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string | null;
  checked: boolean;
}) {
  const t = useDemoTarget(id);
  const on = checked || t.pressed;
  return (
    <div
      {...t.props}
      data-state={on ? "checked" : "unchecked"}
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-xl border border-border bg-surface p-5 text-left shadow-xs transition-[border-color,box-shadow,background-color] duration-150 dark:bg-surface-raised",
        "data-[state=checked]:border-primary data-[state=checked]:bg-surface data-[state=checked]:shadow-[0_0_0_1px_var(--primary)]",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-data-[state=checked]:bg-brand-soft group-data-[state=checked]:text-brand-soft-foreground [&_svg]:size-[1.125rem]">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm leading-5 font-medium">{title}</span>
        {description && <span className="text-sm text-muted-foreground">{description}</span>}
      </span>
      <span
        aria-hidden
        className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input transition-colors group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary"
      >
        <span className="size-1.5 scale-0 rounded-full bg-primary-foreground transition-transform group-data-[state=checked]:scale-100" />
      </span>
    </div>
  );
}
