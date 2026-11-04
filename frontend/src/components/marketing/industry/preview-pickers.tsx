"use client";

import { Lock } from "lucide-react";
import { priceLabel } from "@/lib/booking/quote";
import { formatDate, formatDuration, formatMoney, type PlainDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CheckboxItem } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioCards } from "@/components/ui/radio-group";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ExampleService, PreviewQuestion } from "../industries/types";

/** The building blocks of the industry booking preview, one per step of the page. */

function PickerBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs font-medium text-subtle-foreground">{label}</p>
      {children}
    </div>
  );
}

export function ServicePicker({
  services,
  value,
  onChange,
}: {
  services: { index: number; service: ExampleService }[];
  value: number;
  onChange: (index: number) => void;
}) {
  return (
    <PickerBlock label="Service">
      <RadioCards
        aria-label="Service"
        value={String(value)}
        onValueChange={(v) => onChange(Number(v))}
        className="gap-2"
      >
        {services.map(({ index, service: s }) => (
          <RadioCard
            key={s.name}
            value={String(index)}
            title={s.name}
            description={
              s.options
                ? s.options.map((o) => formatDuration(o.durationMinutes)).join(" / ")
                : formatDuration(s.durationMinutes)
            }
            aside={priceLabel(s, "EUR")}
            className="p-3.5"
          >
            {s.restriction && (
              <Badge tone="brand" className="mt-1.5 w-fit">
                {s.restriction}
              </Badge>
            )}
          </RadioCard>
        ))}
      </RadioCards>
    </PickerBlock>
  );
}

/** Customer groups as a segmented choice with the selected group's hint; nothing when there are none. */
export function GroupPicker({
  label,
  groups,
  value,
  onChange,
}: {
  label: string;
  groups: { label: string; hint: string }[] | undefined;
  value: number;
  onChange: (index: number) => void;
}) {
  if (!groups) return null;
  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        aria-label={label}
        size="sm"
        value={String(value)}
        onValueChange={(v) => onChange(Number(v))}
        className="w-full [&>*]:flex-1"
        options={groups.map((g, i) => ({ value: String(i), label: g.label }))}
      />
      <p className="text-xs text-muted-foreground">{groups[value]?.hint}</p>
    </div>
  );
}

/** The service's options (nothing when it has none). */
export function OptionPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ExampleService["options"];
  value: number;
  onChange: (index: number) => void;
}) {
  if (!options?.length) return null;
  return (
    <PickerBlock label={label}>
      <div
        role="group"
        aria-label={label}
        className={cn("grid gap-1.5", options.length === 3 ? "grid-cols-3" : "grid-cols-2")}
      >
        {options.map((o, i) => (
          <button
            key={o.name}
            type="button"
            aria-pressed={i === value}
            onClick={() => onChange(i)}
            className={cn(
              "focus-ring flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
              i === value
                ? "border-primary bg-brand-soft shadow-[0_0_0_1px_var(--primary)]"
                : "border-border bg-surface hover:border-border-strong dark:bg-surface-raised",
            )}
          >
            <span className="truncate text-sm font-medium">{o.name}</span>
            <span className="tnum truncate text-xs text-muted-foreground">
              {formatDuration(o.durationMinutes)} · {formatMoney(o.priceCents, "EUR")}
            </span>
          </button>
        ))}
      </div>
    </PickerBlock>
  );
}

/** The service's add-ons (nothing when it has none). */
export function AddonPicker({
  idPrefix,
  addons,
  value,
  onChange,
}: {
  idPrefix: string;
  addons: ExampleService["addons"];
  value: number[];
  onChange: (indexes: number[]) => void;
}) {
  if (!addons?.length) return null;
  return (
    <PickerBlock label="Extras">
      <div className="grid gap-3 rounded-xl border border-border-subtle p-3.5">
        {addons.map((a, i) => (
          <CheckboxItem
            key={a.name}
            id={`${idPrefix}-${i}`}
            label={
              <span className="tnum">
                {a.name}{" "}
                <span className="font-normal text-muted-foreground">
                  +{formatMoney(a.priceCents, "EUR")} · +{formatDuration(a.extraMinutes)}
                </span>
              </span>
            }
            description={a.description}
            checked={value.includes(i)}
            onCheckedChange={(c) =>
              onChange(c === true ? [...value, i].sort() : value.filter((x) => x !== i))
            }
          />
        ))}
      </div>
    </PickerBlock>
  );
}

/** "Any" plus each named resource (people get an avatar); nothing when there is no choice. */
export function ResourcePicker({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (choices.length === 0) return null;
  return (
    <PickerBlock label={label}>
      <SegmentedControl
        aria-label={label}
        size="sm"
        value={value}
        onValueChange={onChange}
        className="w-full [&>*]:min-w-0 [&>*]:flex-1"
        options={choices.map((r, i) => ({
          value: r,
          label: i === 0 ? "Any" : r,
          icon: i === 0 ? undefined : <Avatar name={r.replace(/^Dr /, "")} size="xs" />,
        }))}
      />
    </PickerBlock>
  );
}

/** Five open days (skeletons until mounted, since "today" differs from the prerendered page) and the day's times. */
export function DateTimePicker({
  label,
  days,
  dayIndex,
  onDayChange,
  slots,
  slot,
  onSlotChange,
}: {
  label: string;
  days: PlainDate[];
  dayIndex: number;
  onDayChange: (index: number) => void;
  slots: string[];
  slot: string | undefined;
  onSlotChange: (slot: string) => void;
}) {
  return (
    <PickerBlock label={label}>
      <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Date">
        {days.length
          ? days.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={i === dayIndex}
                onClick={() => onDayChange(i)}
                className={cn(
                  "focus-ring flex flex-col items-center rounded-lg border py-1.5 transition-colors",
                  i === dayIndex
                    ? "border-primary bg-primary text-primary-foreground shadow-button"
                    : "border-border bg-surface hover:border-brand dark:bg-surface-raised",
                )}
              >
                <span className={cn("text-2xs", i === dayIndex ? "opacity-80" : "text-muted-foreground")}>
                  {formatDate(d, "UTC", "weekday")}
                </span>
                <span className="tnum text-sm font-semibold">{Number(d.slice(8))}</span>
              </button>
            ))
          : Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Time">
        {slots.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={t === slot}
            onClick={() => onSlotChange(t)}
            className={cn(
              "tnum focus-ring h-9 rounded-lg border text-sm font-medium transition-colors",
              t === slot
                ? "border-primary bg-brand-soft text-brand-soft-foreground shadow-[0_0_0_1px_var(--primary)]"
                : "border-border bg-surface hover:border-brand hover:text-brand dark:bg-surface-raised",
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </PickerBlock>
  );
}

/** The booking form's questions (uncontrolled: the preview never submits them). */
export function PreviewQuestions({ questions }: { questions: PreviewQuestion[] }) {
  return (
    <div className="flex flex-col gap-4">
      {questions.map((q) => (
        <Field
          key={q.label}
          label={q.label}
          help={q.help}
          optional={q.optional}
          required={!q.optional}
          labelAction={
            q.sensitive ? (
              <Badge tone="warning" className="h-5 gap-1 px-1.5 text-2xs">
                <Lock /> Private
              </Badge>
            ) : undefined
          }
        >
          <QuestionControl question={q} />
        </Field>
      ))}
    </div>
  );
}

function QuestionControl({ question: q }: { question: PreviewQuestion }) {
  if (q.kind === "textarea") return <Textarea rows={2} placeholder={q.placeholder} />;
  if (q.kind === "text") return <Input placeholder={q.placeholder} />;
  return (
    <Select defaultValue={q.options?.[0]}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {q.options?.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
