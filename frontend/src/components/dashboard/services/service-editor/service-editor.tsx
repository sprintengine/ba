"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import type { Service } from "@/lib/api/types";
import { useCreateService, useDeleteService, useReplaceService } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import {
  emptyServiceValues,
  formValuesToServiceInput,
  SERVICE_COLORS,
  serviceFormSchema,
  serviceToFormValues,
  type ServiceFormValues as V,
} from "@/lib/services/service-form";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { applyApiErrors, FormRootError } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { withToast } from "@/components/common/with-toast";
import { FormSheet } from "@/components/ui/form-dialog";
import { AddonsSection } from "./addons-section";
import { BasicsSection } from "./basics-section";
import { CustomerPreview } from "./customer-preview";
import { OptionsSection } from "./options-section";
import { PricingSection } from "./pricing-section";
import { QuestionsSection } from "./questions-section";
import { RequirementsSection } from "./requirements-section";
import { RulesSection } from "./rules-section";
import { TimingSection } from "./timing-section";

/** Create or edit a service: sheet with the full ServiceInput and a live customer preview. */
export function ServiceEditor({
  service,
  open,
  onOpenChange,
  categories,
  nextSortOrder,
  returnFocusTo,
}: {
  service: Service | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  nextSortOrder: number;
  returnFocusTo?: HTMLElement | null;
}) {
  const business = useCurrentBusiness();
  const create = useCreateService(business.id);
  const replace = useReplaceService(business.id);
  const remove = useDeleteService(business.id);
  const form = useForm<V>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: service
      ? serviceToFormValues(service)
      : emptyServiceValues(nextSortOrder, SERVICE_COLORS[nextSortOrder % SERVICE_COLORS.length]),
  });

  const submit = async (values: V) => {
    const input = formValuesToServiceInput(values);
    try {
      if (service) {
        await replace.mutateAsync({ id: service.id, input });
        toast.success(`${input.name} saved`);
      } else {
        await create.mutateAsync(input);
        toast.success(`${input.name} created`);
      }
      onOpenChange(false);
    } catch (err) {
      applyApiErrors(form, err);
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
      title={service ? `Edit ${service.name}` : "New service"}
      submitLabel={service ? "Save changes" : "Create service"}
      footerStart={
        service ? (
          <ConfirmDialog
            trigger={
              <Button variant="danger-ghost">
                <Trash2 /> Delete
              </Button>
            }
            title={`Delete ${service.name}?`}
            description="If it has ever been booked it is deactivated instead, so history and reports stay intact."
            confirmLabel="Delete service"
            destructive
            onConfirm={async () => {
              if (await withToast(() => remove.mutateAsync(service.id), `${service.name} removed`))
                onOpenChange(false);
            }}
          />
        ) : null
      }
    >
      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_20rem] lg:overflow-hidden">
        <div className="flex flex-col gap-9 px-5 py-6 lg:overflow-y-auto">
          <BasicsSection categories={categories} />
          <TimingSection serviceId={service?.id ?? null} />
          <PricingSection />
          <RulesSection />
          <OptionsSection />
          <AddonsSection />
          <RequirementsSection />
          {service && <QuestionsSection serviceId={service.id} />}
          <FormRootError />
        </div>
        <aside
          aria-label="Customer preview"
          className="hidden border-l border-border-subtle bg-surface-sunken/60 px-5 py-6 lg:block lg:overflow-y-auto"
        >
          <CustomerPreview />
        </aside>
      </div>
    </FormSheet>
  );
}
