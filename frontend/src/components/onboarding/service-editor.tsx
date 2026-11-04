"use client";

import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import type { PaymentMode } from "@/lib/api/types";
import { PAYMENT_MODE_COPY, PAYMENT_MODES } from "@/lib/catalog/services";
import { formatPrice } from "@/lib/format";
import type { SetupService } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CheckboxItem } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { AddonsEditor, OptionsEditor } from "./service-items-editors";
import { RequirementsEditor } from "./requirements-editor";
import { RowError, SubList, type EditorProps } from "./service-sublist";

/** Everything about one service: price and payment, options, add-ons, requirements, groups and more settings. */
export function ServiceEditor({
  setup,
  service: s,
  index,
  errors,
  dispatch,
  onRemoved,
}: EditorProps & { onRemoved: () => void }) {
  const p = `services[${index}].`;
  const update = (patch: Partial<SetupService>) => dispatch({ type: "updateService", index, patch });
  const currency = setup.currency;
  const hasOptions = s.options.length > 0;
  const moreErrors = [
    "capacity",
    "bufferBeforeMinutes",
    "bufferAfterMinutes",
    "slotIntervalMinutes",
    "description",
  ].some((k) => errors[`${p}${k}`]);
  const [moreOpen, setMoreOpen] = useState(moreErrors);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Name" required error={errors[`${p}name`]}>
          <Input value={s.name} maxLength={120} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label="Category" optional error={errors[`${p}category`]}>
          <Input
            value={s.category ?? ""}
            maxLength={60}
            onChange={(e) => update({ category: e.target.value })}
            placeholder="e.g. Treatments"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="How customers pay"
          error={errors[`${p}paymentMode`]}
          help={PAYMENT_MODE_COPY[s.paymentMode].help}
        >
          <Select
            value={s.paymentMode}
            onValueChange={(mode) => update({ paymentMode: mode as PaymentMode })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {PAYMENT_MODE_COPY[m].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Duration"
            error={errors[`${p}durationMinutes`]}
            help={hasOptions ? "Options set their own" : undefined}
          >
            <NumberInput
              value={s.durationMinutes}
              unit="min"
              onValueChange={(durationMinutes) => update({ durationMinutes: durationMinutes ?? 0 })}
            />
          </Field>
          {s.paymentMode !== "free" && (
            <Field
              label="Price"
              error={errors[`${p}priceCents`]}
              help={hasOptions ? "Options set their own" : undefined}
            >
              <MoneyInput
                value={s.priceCents}
                currency={currency}
                locale={setup.locale}
                onValueChange={(c) => update({ priceCents: c ?? 0 })}
              />
            </Field>
          )}
        </div>
        {s.paymentMode === "deposit" && (
          <Field
            label="Deposit"
            required
            error={errors[`${p}depositCents`]}
            help={`Paid online. The rest (${formatPrice(Math.max(0, s.priceCents - (s.depositCents ?? 0)), currency)}) is paid at the venue.`}
            className="sm:col-start-2"
          >
            <MoneyInput
              value={s.depositCents}
              currency={currency}
              locale={setup.locale}
              onValueChange={(depositCents) => update({ depositCents })}
            />
          </Field>
        )}
      </div>

      <Field
        orientation="horizontal"
        label="Approve each booking"
        help="Bookings wait for you to accept them before they're confirmed."
      >
        <Switch
          checked={s.requiresApproval}
          onCheckedChange={(requiresApproval) => update({ requiresApproval })}
        />
      </Field>

      <OptionsEditor setup={setup} service={s} index={index} errors={errors} dispatch={dispatch} />
      <AddonsEditor setup={setup} service={s} index={index} errors={errors} dispatch={dispatch} />
      <RequirementsEditor setup={setup} service={s} index={index} errors={errors} dispatch={dispatch} />

      {setup.customerGroups.length > 0 && (
        <SubList title="Who can book" description="Leave all unticked to let everyone book.">
          <div className="flex flex-col gap-2.5">
            {setup.customerGroups.map((g) => (
              <CheckboxItem
                key={g.key}
                id={`svc-${index}-group-${g.key}`}
                label={g.name || "Unnamed group"}
                checked={s.allowedGroupKeys.includes(g.key)}
                onCheckedChange={() =>
                  dispatch({ type: "toggleServiceGroup", serviceIndex: index, groupKey: g.key })
                }
              />
            ))}
          </div>
          {errors[`${p}allowedGroupKeys`] && <RowError>{errors[`${p}allowedGroupKeys`]}</RowError>}
        </SubList>
      )}

      <div className="rounded-lg border border-border-subtle">
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={`svc-${index}-more`}
          onClick={() => setMoreOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>
            More settings
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Description, group size, buffers
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn("size-4 text-subtle-foreground transition-transform", moreOpen && "rotate-180")}
          />
        </button>
        {moreOpen && (
          <div
            id={`svc-${index}-more`}
            className="grid animate-fade-in grid-cols-1 gap-4 border-t border-border-subtle px-3 pt-4 pb-3"
          >
            <Field label="Description" optional error={errors[`${p}description`]}>
              <Textarea
                value={s.description ?? ""}
                rows={2}
                maxLength={2000}
                onChange={(e) => update({ description: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Group size" error={errors[`${p}capacity`]} help="Per slot">
                <NumberInput
                  value={s.capacity}
                  onValueChange={(capacity) => update({ capacity: capacity ?? 0 })}
                />
              </Field>
              <Field label="Buffer before" error={errors[`${p}bufferBeforeMinutes`]}>
                <NumberInput
                  value={s.bufferBeforeMinutes}
                  unit="min"
                  onValueChange={(bufferBeforeMinutes) =>
                    update({ bufferBeforeMinutes: bufferBeforeMinutes ?? 0 })
                  }
                />
              </Field>
              <Field label="Buffer after" error={errors[`${p}bufferAfterMinutes`]}>
                <NumberInput
                  value={s.bufferAfterMinutes}
                  unit="min"
                  onValueChange={(bufferAfterMinutes) =>
                    update({ bufferAfterMinutes: bufferAfterMinutes ?? 0 })
                  }
                />
              </Field>
              <Field label="Start every" error={errors[`${p}slotIntervalMinutes`]} help="Blank = auto">
                <NumberInput
                  value={s.slotIntervalMinutes}
                  unit="min"
                  onValueChange={(n) => update({ slotIntervalMinutes: n || null })}
                />
              </Field>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end border-t border-border-subtle pt-3">
        <Button
          size="sm"
          variant="danger-ghost"
          onClick={() => {
            onRemoved();
            dispatch({ type: "removeService", index });
          }}
        >
          <Trash2 />
          Remove service
        </Button>
      </div>
    </div>
  );
}
