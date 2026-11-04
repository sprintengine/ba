"use client";

import { useRef } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";
import { Coins, Percent } from "lucide-react";
import type { Service } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { switchDiscountType, type OfferFormDiscount, type OfferFormValues } from "@/lib/offers/offer-form";
import { Button } from "@/components/ui/button";
import { CheckboxItem } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { FieldGroup, FormSection } from "./offer-form-parts";

type V = OfferFormValues;

export function BasicsFields() {
  const { v } = useVocabulary();
  return (
    <FormSection title="Basics">
      <FormField<V, "name">
        name="name"
        label="Name"
        required
        help={`${v("customers", { title: true })} see this name when they book.`}
      >
        {(field) => (
          <Input {...field} placeholder="e.g. Off-peak afternoons" autoComplete="off" maxLength={80} />
        )}
      </FormField>
      <FormField<V, "description"> name="description" label="Description" optional>
        {(field) => (
          <Textarea
            {...field}
            rows={2}
            maxLength={300}
            placeholder={`Anything ${v("customers")} should know`}
          />
        )}
      </FormField>
    </FormSection>
  );
}

export function ServicesField({ services }: { services: Service[] }) {
  const { field, fieldState } = useController<V, "serviceIds">({ name: "serviceIds" });
  const selected = field.value;
  const allIds = services.map((s) => s.id);
  const allOn = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  const toggle = (id: string, on: boolean) =>
    field.onChange(on ? [...selected.filter((x) => x !== id), id] : selected.filter((x) => x !== id));
  return (
    <FormSection
      title="Services"
      description="The deal applies to these services, including their options and add-ons."
    >
      <FieldGroup
        legend="Applies to"
        error={fieldState.error?.message}
        action={
          services.length > 1 && (
            <Button size="xs" variant="ghost" onClick={() => field.onChange(allOn ? [] : allIds)}>
              {allOn ? "Clear all" : "Select all"}
            </Button>
          )
        }
      >
        {services.length === 0 ? (
          <p className="text-sm text-subtle-foreground">Add a service first — deals discount services.</p>
        ) : (
          <div className="grid gap-2.5 rounded-xl border border-border p-3 sm:grid-cols-2">
            {services.map((s) => (
              <CheckboxItem
                key={s.id}
                id={`offer-service-${s.id}`}
                label={s.name}
                description={!s.isPublic ? "Private — not on your booking page" : undefined}
                checked={selected.includes(s.id)}
                onCheckedChange={(c) => toggle(s.id, c === true)}
                onBlur={field.onBlur}
              />
            ))}
          </div>
        )}
      </FieldGroup>
    </FormSection>
  );
}

export function DiscountFields() {
  const business = useCurrentBusiness();
  const form = useFormContext<V>();
  const discount = useWatch<V, "discount">({ name: "discount" });
  // The other type's last value, so switching back and forth doesn't lose it.
  const remembered = useRef({
    percent: discount.type === "percent" ? discount.percent : 20,
    amountCents: discount.type === "fixed" ? discount.amountCents : null,
  });
  const setType = (type: OfferFormDiscount["type"]) => {
    const current = form.getValues("discount");
    if (current.type === "percent") remembered.current.percent = current.percent;
    else remembered.current.amountCents = current.amountCents;
    form.setValue("discount", switchDiscountType(current, type, remembered.current), {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    });
  };
  return (
    <FormSection title="Discount" description="Taken off the full price of the booking.">
      <SegmentedControl
        aria-label="Discount type"
        className="self-start"
        value={discount.type}
        onValueChange={setType}
        options={[
          { value: "percent", label: "Percentage", icon: <Percent /> },
          { value: "fixed", label: "Fixed amount", icon: <Coins /> },
        ]}
      />
      {discount.type === "percent" ? (
        <FormField<V, "discount.percent">
          key="percent"
          name="discount.percent"
          label="Percentage off"
          required
          className="sm:w-48"
        >
          {(field) => (
            <NumberInput
              mode="decimal"
              value={field.value ?? null}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              min={1}
              max={100}
              unit="%"
            />
          )}
        </FormField>
      ) : (
        <FormField<V, "discount.amountCents">
          key="fixed"
          name="discount.amountCents"
          label="Amount off"
          required
          className="sm:w-48"
        >
          {(field) => (
            <MoneyInput
              value={field.value ?? null}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              currency={business.currency}
              locale={business.locale}
            />
          )}
        </FormField>
      )}
    </FormSection>
  );
}
