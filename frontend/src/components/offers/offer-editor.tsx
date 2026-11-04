"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Offer, Service } from "@/lib/api/types";
import { useCreateOffer, useUpdateOffer } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import {
  defaultOfferForm,
  formToInput,
  offerFormSchema,
  offerToForm,
  withOfferFormPaths,
  type OfferFormValues,
} from "@/lib/offers/offer-form";
import { applyApiErrors, FormRootError } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { FormSheet } from "@/components/ui/form-dialog";
import { AffectedSlotsPreview } from "./affected-slots-preview";
import { BasicsFields, DiscountFields, ServicesField } from "./offer-basics-fields";
import { LimitsFields, ScheduleFields } from "./offer-schedule-fields";

/**
 * Create or edit a deal: a side sheet (full screen on mobile) with the form and, beside it
 * (below on small screens), the live "Affected times" preview.
 */
export function OfferEditor({
  offer,
  services,
  open,
  onOpenChange,
  returnFocusTo,
  previewDelay,
}: {
  offer: Offer | null;
  /** Services the deal can apply to (the business's active services). */
  services: Service[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes when the sheet closes (it has no trigger of its own to return to). */
  returnFocusTo?: HTMLElement | null;
  /** Debounce for the preview (tests use 0). */
  previewDelay?: number;
}) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const create = useCreateOffer(business.id);
  const update = useUpdateOffer(business.id);
  const form = useForm<OfferFormValues>({
    resolver: zodResolver(offerFormSchema),
    defaultValues: offer ? offerToForm(offer) : defaultOfferForm(services.map((s) => s.id)),
  });

  const submit = async (values: OfferFormValues) => {
    const input = formToInput(values);
    try {
      if (offer) {
        await update.mutateAsync({ id: offer.id, input });
        toast.success(`${input.name} saved`);
      } else {
        await create.mutateAsync(input);
        toast.success(`${input.name} created`);
      }
      onOpenChange(false);
    } catch (err) {
      applyApiErrors(form, withOfferFormPaths(err));
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      form={form}
      onSubmit={submit}
      size="xl"
      className="sm:max-w-5xl"
      title={offer ? `Edit ${offer.name}` : "New offer"}
      description={`Discount quiet times automatically. ${v("customers", { title: true })} see the deal when they pick a time.`}
      submitLabel={offer ? "Save changes" : "Create offer"}
    >
      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_22rem] lg:overflow-hidden">
        <div className="flex flex-col gap-9 px-5 py-6 lg:overflow-y-auto">
          <BasicsFields />
          <ServicesField services={services} />
          <DiscountFields />
          <ScheduleFields />
          <LimitsFields />
          <FormRootError />
        </div>
        <aside className="border-t border-border-subtle bg-surface-sunken/60 px-5 py-6 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <AffectedSlotsPreview delay={previewDelay} />
        </aside>
      </div>
    </FormSheet>
  );
}
