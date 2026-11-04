"use client";

import { Banknote, CreditCard, Gift, HandCoins, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { controlStyles } from "@/components/ui/input";
import { PAYMENT_MODE_LABEL } from "@/lib/services/service-form";
import { cn } from "@/lib/utils";
import { DemoCaret, useDemoTarget } from "../../engine/demo-context";
import { DemoInput } from "../../engine/controls";
import { DemoLabel } from "../primitives";
import { SERVICE_COLORS, type PaymentChoice, type ServiceDraft } from "../state";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="border-b border-border-subtle pb-2">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  help,
  optional,
  required,
  children,
}: {
  label: string;
  help?: string;
  optional?: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <DemoLabel optional={optional} required={required}>
        {label}
      </DemoLabel>
      {children}
      {help && <p className="text-xs leading-5 text-muted-foreground">{help}</p>}
    </div>
  );
}

function Swatch({ color, index, selected }: { color: string; index: number; selected: boolean }) {
  const t = useDemoTarget(`svc-color-${String(index)}`);
  return (
    <span
      {...t.props}
      className={cn(
        "size-7 rounded-full ring-offset-2 ring-offset-background transition-[box-shadow,transform]",
        selected && "ring-2 ring-foreground",
        t.hovered && "scale-110",
      )}
      style={{ backgroundColor: color }}
    />
  );
}

const PAYMENT: { value: PaymentChoice; icon: typeof CreditCard; title: string; description: string }[] = [
  {
    value: "full",
    icon: CreditCard,
    title: PAYMENT_MODE_LABEL.full,
    description: "Paid when booking. Fewer no-shows.",
  },
  {
    value: "deposit",
    icon: HandCoins,
    title: PAYMENT_MODE_LABEL.deposit,
    description: "Secure the slot, rest on the day.",
  },
  {
    value: "at_venue",
    icon: Banknote,
    title: PAYMENT_MODE_LABEL.at_venue,
    description: "Nothing to pay online.",
  },
  { value: "free", icon: Gift, title: PAYMENT_MODE_LABEL.free, description: "No charge at all." },
];

function PaymentCard({ option, checked }: { option: (typeof PAYMENT)[number]; checked: boolean }) {
  const t = useDemoTarget(`pay-${option.value}`);
  return (
    <span
      {...t.props}
      className={cn(
        "flex items-start gap-3 rounded-xl border border-border bg-surface p-3 shadow-xs transition-[border-color,box-shadow] dark:bg-surface-raised",
        t.hovered && !checked && "border-border-strong",
        checked && "border-primary shadow-[0_0_0_1px_var(--primary)]",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors [&_svg]:size-[1.125rem]",
          checked && "bg-brand-soft text-brand-soft-foreground",
        )}
      >
        <option.icon />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm leading-5 font-medium">{option.title}</span>
        <span className="text-sm text-muted-foreground">{option.description}</span>
      </span>
    </span>
  );
}

function Basics({ d }: { d: ServiceDraft }) {
  const desc = useDemoTarget("svc-description");
  return (
    <Section title="Basics">
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4">
        <Field label="Name" required>
          <DemoInput id="svc-name" value={d.name} placeholder="e.g. Initial consultation" />
        </Field>
        <Field label="Category" optional help="Groups services on your page.">
          <DemoInput id="svc-category" value={d.category} />
        </Field>
      </div>
      <Field label="Description" optional help="Shown to people choosing a service.">
        <div
          {...desc.props}
          className={cn(
            controlStyles,
            "h-20 px-3 py-2 text-sm",
            desc.focused && "border-ring ring-3 ring-ring/20",
          )}
        >
          {d.description}
          {desc.focused && <DemoCaret />}
        </div>
      </Field>
      <Field label="Calendar colour">
        <div className="flex gap-2">
          {SERVICE_COLORS.map((c, i) => (
            <Swatch key={c} color={c} index={i} selected={d.color === c} />
          ))}
        </div>
      </Field>
    </Section>
  );
}

function TimingAndPrice({ d }: { d: ServiceDraft }) {
  return (
    <>
      <Section
        title="Timing"
        description="Buffers block time for setup or cleaning without showing it to the customer."
      >
        <div className="grid grid-cols-3 gap-4">
          <Field label="Duration" required>
            <DemoInput id="svc-duration" value={d.duration} trailing="min" />
          </Field>
          <Field label="Buffer before">
            <DemoInput id="svc-before" value="0" trailing="min" />
          </Field>
          <Field label="Buffer after">
            <DemoInput id="svc-after" value="5" trailing="min" />
          </Field>
        </div>
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Group session</span>
            <span className="text-xs text-muted-foreground">
              Several people book the same time (a class, a tour). Each takes one seat.
            </span>
          </div>
          <Switch tabIndex={-1} checked={false} />
        </div>
      </Section>
      <Section title="Price and payment" description="bookanything never takes a cut of your payments.">
        <div className="grid grid-cols-2 gap-3">
          {PAYMENT.map((p) => (
            <PaymentCard key={p.value} option={p} checked={d.payment === p.value} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Price" help="With options, each option has its own price.">
            <DemoInput id="svc-price" value={d.price} leading="€" placeholder="0.00" />
          </Field>
        </div>
      </Section>
    </>
  );
}

function Preview({ d }: { d: ServiceDraft }) {
  const minutes = Number(d.duration) || 0;
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium tracking-wide text-subtle-foreground uppercase">
        Customer preview
      </span>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight">{d.name || "Service name"}</p>
            <p className="tnum text-sm text-muted-foreground">{minutes ? `${String(minutes)} min` : "—"}</p>
          </div>
          <span className="tnum shrink-0 text-sm font-semibold">{d.price ? `€${d.price}` : "Free"}</span>
        </div>
        {d.description && <p className="line-clamp-4 text-sm text-muted-foreground">{d.description}</p>}
        {d.payment === "at_venue" && (
          <div>
            <Badge>Pay at venue</Badge>
          </div>
        )}
        <span
          className="mt-1 flex h-8 items-center justify-center rounded-button-sm text-sm font-medium text-white"
          style={{ backgroundColor: d.color }}
        >
          Book
        </span>
      </div>
    </div>
  );
}

/** The "New service" sheet: basics, timing, price, with the live customer preview on the right. */
export function ServiceSheet({ d }: { d: ServiceDraft }) {
  const create = useDemoTarget("svc-create");
  return (
    <>
      <div className="flex flex-col gap-1 border-b border-border-subtle px-5 py-4 pr-12">
        <p className="text-base font-semibold tracking-tight">New service</p>
        <p className="text-sm text-muted-foreground">
          What people book, how long it takes, what it costs and who does it.
        </p>
        <X className="absolute top-5 right-5 size-4 text-muted-foreground" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem] overflow-hidden">
        <div className="overflow-hidden">
          <div
            className="flex flex-col gap-9 px-5 py-6 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: d.scrolled ? "translateY(-404px)" : undefined }}
          >
            <Basics d={d} />
            <TimingAndPrice d={d} />
          </div>
        </div>
        <div className="border-l border-border-subtle bg-surface-sunken/60 px-5 py-6">
          <Preview d={d} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3.5">
        <Button tabIndex={-1}>Cancel</Button>
        <Button
          {...create.props}
          tabIndex={-1}
          variant="primary"
          className={cn(create.hovered && "bg-primary-hover", create.pressed && "scale-[0.98]")}
        >
          Create service
        </Button>
      </div>
    </>
  );
}
