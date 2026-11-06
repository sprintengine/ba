"use client";

import { Check, ChevronLeft, ChevronRight, Clock, Plus, Sparkles, Users } from "lucide-react";
import type { PublicBusiness, PublicService } from "@/lib/api/types";
import { formatDuration, formatMoney, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RadioCard, RadioCards } from "@/components/ui/radio-group";
import { durationLabel, priceSummary } from "@/lib/booking/quote";
import { ANY_RESOURCE } from "@/lib/booking/selection";
import { groupByCategory } from "@/lib/booking/services";

// ---------------------------------------------------------------------------
// Step chrome
// ---------------------------------------------------------------------------

export function StepHeader({
  index,
  total,
  title,
  description,
  onBack,
  backLabel = "Back",
  headingRef,
}: {
  index: number;
  /** Null while not known (before a service is chosen): "Step 1" alone. */
  total: number | null;
  title: React.ReactNode;
  description?: React.ReactNode;
  onBack?: (() => void) | null;
  backLabel?: string;
  /** The title's heading, focusable from script (to move focus to a new step). */
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn("flex items-center gap-2 text-xs font-medium text-subtle-foreground", onBack && "h-7")}
      >
        {onBack && (
          <>
            <button
              type="button"
              onClick={onBack}
              className="-my-2 -ml-1.5 inline-flex h-11 items-center gap-0.5 rounded-md pr-2 pl-1 text-sm font-normal text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ChevronLeft className="size-4" /> {backLabel}
            </button>
          </>
        )}
        {/* The bar says this to the eye: one signal on screen, the words for a screen reader. */}
        <span className="sr-only" aria-live="polite">
          Step {index + 1}
          {total !== null && ` of ${total}`}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <h2
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className="text-xl font-semibold tracking-tight outline-none sm:text-2xl"
        >
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer group
// ---------------------------------------------------------------------------

export function GroupStep({
  groups,
  value,
  onSelect,
}: {
  groups: PublicBusiness["customerGroups"];
  value: string | null;
  onSelect: (groupId: string) => void;
}) {
  return (
    <RadioCards value={value ?? ""} onValueChange={onSelect} aria-label="Who is booking" className="gap-3">
      {groups.map((g) => (
        <RadioCard
          key={g.id}
          value={g.id}
          icon={<Users />}
          title={<span className="text-[0.9375rem]">{g.name}</span>}
          description={g.description}
          className="p-5"
        />
      ))}
    </RadioCards>
  );
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function ServiceStep({
  services,
  currency,
  locale,
  value,
  onSelect,
}: {
  services: PublicService[];
  currency: string;
  locale: string;
  value: string | null;
  onSelect: (service: PublicService) => void;
}) {
  if (services.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles />}
        title="Nothing to book online just yet"
        description="This business hasn't published any services for online booking. Please get in touch with them directly."
      />
    );
  }
  const groups = groupByCategory(services);
  return (
    <div className="flex flex-col gap-7">
      {groups.map((g) => (
        <section key={g.category ?? "all"} className="flex flex-col gap-2.5">
          {g.category && <h3 className="text-sm font-medium text-muted-foreground">{g.category}</h3>}
          <ul className="flex flex-col divide-y divide-border-subtle border-y border-border">
            {g.services.map((s) => (
              <li key={s.id}>
                <ServiceCard
                  service={s}
                  currency={currency}
                  locale={locale}
                  selected={value === s.id}
                  onSelect={() => onSelect(s)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ServiceCard({
  service: s,
  currency,
  locale,
  selected,
  onSelect,
}: {
  service: PublicService;
  currency: string;
  locale: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const price = priceSummary(s);
  const meta: React.ReactNode[] = [];
  meta.push(
    <span key="d" className="inline-flex items-center gap-1">
      <Clock className="size-3.5" aria-hidden />
      {durationLabel(s)}
    </span>,
  );
  if (s.options.length > 1) meta.push(<span key="o">{s.options.length} options</span>);
  if (s.capacity > 1) meta.push(<span key="c">Group · up to {s.capacity}</span>);
  if (s.locationType === "online") meta.push(<span key="l">Online</span>);
  if (s.locationType === "customer") meta.push(<span key="l">At your address</span>);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative flex w-full items-center gap-4 px-3 py-3.5 text-left transition-colors duration-150 outline-none",
        "hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        selected && "bg-accent",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start justify-between gap-3">
          <span className="text-[0.9375rem] leading-6 font-semibold tracking-tight">{s.name}</span>
          <span className="tnum shrink-0 text-[0.9375rem] leading-6 font-semibold">
            {price.kind === "from" && (
              <span className="mr-1 text-xs font-normal text-muted-foreground">from</span>
            )}
            {price.kind === "free" ? "Free" : formatMoney(price.cents, currency, { locale })}
          </span>
        </span>
        {s.description && <span className="text-sm text-muted-foreground">{s.description}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {meta.map((m, i) => (
            <span key={i} className="inline-flex items-center gap-3">
              {i > 0 && <span aria-hidden className="size-0.5 rounded-full bg-subtle-foreground" />}
              {m}
            </span>
          ))}
          <PaymentBadge service={s} currency={currency} locale={locale} />
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-subtle-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground"
      />
    </button>
  );
}

function PaymentBadge({
  service: s,
  currency,
  locale,
}: {
  service: PublicService;
  currency: string;
  locale: string;
}) {
  if (s.requiresApproval) return <Badge tone="info">Request to book</Badge>;
  if (priceSummary(s).kind === "free") return null;
  if (s.paymentMode === "at_venue") return <Badge tone="neutral">Pay at venue</Badge>;
  if (s.paymentMode === "deposit" && s.depositCents) {
    const deposit = `${formatMoney(s.depositCents, currency, { locale })} deposit`;
    return <Badge tone="neutral">{s.allowPayAtVenue ? `${deposit} or pay at venue` : deposit}</Badge>;
  }
  if (s.allowPayAtVenue) return <Badge tone="neutral">Pay online or at venue</Badge>;
  return null;
}

// ---------------------------------------------------------------------------
// Options and add-ons
// ---------------------------------------------------------------------------

export function ExtrasStep({
  service,
  currency,
  locale,
  optionId,
  addonIds,
  onOption,
  onToggleAddon,
}: {
  service: PublicService;
  currency: string;
  locale: string;
  optionId: string | null;
  addonIds: string[];
  onOption: (id: string) => void;
  onToggleAddon: (id: string) => void;
}) {
  const options = [...service.options].sort((a, b) => a.sortOrder - b.sortOrder);
  const addons = [...service.addons].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div className="flex flex-col gap-8">
      {options.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Choose an option</h3>
          <RadioCards value={optionId ?? ""} onValueChange={onOption} aria-label="Option">
            {options.map((o) => (
              <RadioCard
                key={o.id}
                value={o.id}
                title={o.name}
                aside={formatPrice(o.priceCents, currency, { locale })}
                description={
                  <span className="flex flex-col gap-1">
                    {o.description && <span>{o.description}</span>}
                    <span className="inline-flex items-center gap-1 text-xs">
                      <Clock className="size-3" aria-hidden /> {formatDuration(o.durationMinutes)}
                    </span>
                  </span>
                }
              />
            ))}
          </RadioCards>
        </section>
      )}
      {addons.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold">Add extras</h3>
            <p className="text-sm text-muted-foreground">Optional. Pick as many as you like.</p>
          </div>
          <div role="group" aria-label="Extras">
            <ul className="flex flex-col gap-2.5">
              {addons.map((a) => {
                const checked = addonIds.includes(a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => onToggleAddon(a.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border bg-surface p-4 text-left shadow-xs transition-[border-color,box-shadow] duration-150 outline-none dark:bg-surface-raised",
                        "hover:border-border-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25",
                        checked ? "border-primary shadow-[0_0_0_1px_var(--primary)]" : "border-border",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input text-transparent",
                        )}
                      >
                        {checked ? (
                          <Check className="size-3.5" strokeWidth={3} />
                        ) : (
                          <Plus className="size-3" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-start justify-between gap-3">
                          <span className="text-sm leading-5 font-medium">{a.name}</span>
                          <span className="tnum text-sm font-medium">
                            {a.priceCents > 0
                              ? formatMoney(a.priceCents, currency, { locale, signed: true })
                              : "Free"}
                          </span>
                        </span>
                        {a.description && (
                          <span className="text-sm text-muted-foreground">{a.description}</span>
                        )}
                        {a.extraMinutes > 0 && (
                          <span className="text-xs text-muted-foreground">
                            +{formatDuration(a.extraMinutes)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resource preference
// ---------------------------------------------------------------------------

export function ResourceStep({
  requirement,
  value,
  onSelect,
}: {
  requirement: NonNullable<PublicService["selectableRequirement"]>;
  value: string | null;
  onSelect: (resource: string) => void;
}) {
  const { v } = useVocabulary();
  const noun = requirement.label.trim() || v("resource", { title: true });
  return (
    <RadioCards value={value ?? ""} onValueChange={onSelect} aria-label={noun} columns={2} className="gap-3">
      <RadioCard
        value={ANY_RESOURCE}
        icon={<Sparkles />}
        title={`Any ${noun.toLowerCase()}`}
        description="See the most times. We'll match you with whoever is free."
        className="p-5 sm:col-span-2"
      />
      {requirement.resources.map((r) => (
        <RadioCard
          key={r.id}
          value={r.id}
          icon={<Avatar name={r.name} shape="square" className="size-9 rounded-lg text-xs" />}
          title={r.name}
          description={r.description}
          className="p-5"
        />
      ))}
    </RadioCards>
  );
}
