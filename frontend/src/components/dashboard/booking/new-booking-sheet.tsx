"use client";

import { useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { CreatedBooking, FormQuestion, Resource, Service } from "@/lib/api/types";
import { errorMessage, newIdempotencyKey } from "@/lib/api/client";
import { useCreateBooking, useQuestions, useResources, useServices } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import {
  answerErrors,
  buildStaffBooking,
  createBookingFailure,
  newBookingDefaults,
  newBookingSchema,
  questionsFor,
  type NewBookingPrefill,
  type NewBookingValues as Values,
} from "@/lib/dashboard/new-booking";
import { todayInTz } from "@/lib/format/datetime";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState } from "@/components/common/feedback";
import { Button } from "@/components/ui/button";
import { applyApiErrors, Form, FormRootError } from "@/components/ui/form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useFmt } from "../common";
import { HeldForPayment } from "./held-for-payment";
import { CustomerFields } from "./new-booking-customer";
import { NewBookingMore } from "./new-booking-more";
import { ServiceFields } from "./new-booking-service";
import { Context, Summary } from "./new-booking-summary";
import { WhenFields } from "./new-booking-when";

type Held = { booking: CreatedBooking; checkoutUrl: string; emailed: boolean };

/** Staff "New booking" sheet: service, time and customer; the rest stays one line each until it's needed. */
export function NewBookingSheet({
  open,
  onOpenChange,
  prefill,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: NewBookingPrefill;
  onCreated?: (bookingId: string) => void;
}) {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const services = useServices(business.id, { enabled: open });
  const questions = useQuestions(business.id, { enabled: open });
  const resources = useResources(business.id, { enabled: open });
  // Without any of these the form would mislead ("Add a service first", no calendars, required questions skipped):
  // say what failed, with a retry, instead.
  const failed = [services, questions, resources].filter((q) => q.isError && !q.data);
  const today = todayInTz(business.timezone);
  /** A booking held for online payment: show its payment link instead of closing. */
  const [held, setHeld] = useState<Held | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(newBookingSchema),
    defaultValues: newBookingDefaults(prefill, today),
  });
  const activeServices = useMemo(() => (services.data ?? []).filter((s) => s.isActive), [services.data]);
  const serviceId = useWatch({ control: form.control, name: "serviceId" });
  const service = activeServices.find((s) => s.id === serviceId);
  const submit = useSubmitNewBooking({
    form,
    service,
    questions: questions.data ?? [],
    onHeld: setHeld,
    onOpenChange,
    onCreated,
  });

  if (held) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent size="lg" aria-describedby={undefined}>
          <HeldForPayment
            {...held}
            onView={
              onCreated
                ? () => {
                    onOpenChange(false);
                    onCreated(held.booking.id);
                  }
                : undefined
            }
            onDone={() => onOpenChange(false)}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[30rem]" aria-describedby={undefined}>
        <Form form={form} onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-0">
          <SheetHeader>
            <SheetTitle>New {v("booking")}</SheetTitle>
            <SheetDescription>
              <Context resources={resources.data ?? []} />
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {failed[0] ? (
              <ErrorState
                error={failed[0].error}
                onRetry={() => failed.forEach((q) => void q.refetch())}
                headingLevel={3}
              />
            ) : services.isPending ? (
              <div className="flex flex-col gap-4" aria-busy>
                <Skeleton className="h-9" />
                <Skeleton className="h-24" />
                <Skeleton className="h-40" />
              </div>
            ) : activeServices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add a service first. Every {v("booking")} is for a service.
              </p>
            ) : (
              <NewBookingSteps
                services={activeServices}
                questions={questions.data ?? []}
                resources={resources.data ?? []}
                service={service}
                prefill={prefill}
                today={today}
              />
            )}
          </div>
          <SheetFooter className="flex-wrap items-center justify-between max-sm:[&>span]:basis-full">
            <Summary service={service} />
            <div className="flex gap-2 max-sm:flex-1 max-sm:[&>button]:flex-1">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={form.formState.isSubmitting}
                disabled={!service || failed.length > 0}
              >
                Create {v("booking")}
              </Button>
            </div>
          </SheetFooter>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

/** The form: what, when and who first; the rest folds to a line each, so a usual booking is a short one. */
function NewBookingSteps({
  services,
  questions,
  resources,
  service,
  prefill,
  today,
}: {
  services: Service[];
  questions: FormQuestion[];
  resources: Resource[];
  service: Service | undefined;
  prefill: NewBookingPrefill;
  today: string;
}) {
  const asked = service ? questionsFor(questions, service.id) : [];
  return (
    <div className="flex flex-col gap-5">
      <ServiceFields services={services} service={service} />
      {service ? (
        <WhenFields service={service} resources={resources} today={today} />
      ) : (
        <p className="text-sm text-subtle-foreground">Choose a service to see free times.</p>
      )}
      <CustomerFields prefill={prefill.customer} />
      <NewBookingMore service={service} questions={asked} />
      <FormRootError />
    </div>
  );
}

/**
 * Create the booking (one idempotency key per submit intent, renewed after success). A booking held for online
 * payment shows its link; otherwise toast and close. Taken times, plan limits and unconnected payments are answered
 * on the form.
 */
function useSubmitNewBooking({
  form,
  service,
  questions,
  onHeld,
  onOpenChange,
  onCreated,
}: {
  form: ReturnType<typeof useForm<Values>>;
  service: Service | undefined;
  questions: FormQuestion[];
  onHeld: (held: Held) => void;
  onOpenChange: (open: boolean) => void;
  onCreated?: (bookingId: string) => void;
}) {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const create = useCreateBooking(business.id);
  const idempotencyKey = useRef(newIdempotencyKey());

  const created = (booking: CreatedBooking, values: Values) => {
    if (booking.status === "held" && booking.checkoutUrl) {
      onHeld({
        booking,
        checkoutUrl: booking.checkoutUrl,
        emailed: values.notifyCustomer && !!booking.customer.email,
      });
      return;
    }
    toast.success(`${v("booking", { title: true })} created`, {
      description:
        booking.status === "held"
          ? `Held for ${business.policies.holdMinutes} min while the ${v("customer")} pays.`
          : `${fmt.date(booking.start, "dayMonth")}, ${fmt.time(booking.start)} · ${booking.customer.name}`,
      action: onCreated ? { label: "View", onClick: () => onCreated(booking.id) } : undefined,
    });
    onOpenChange(false);
  };

  const failed = (err: unknown) => {
    const failure = createBookingFailure(err, v("bookings"));
    switch (failure.kind) {
      case "slot_taken":
        form.setValue("slotStart", null);
        form.setError("slotStart", { message: "That time was just taken. Pick another one." });
        toast.error("That time is no longer free.");
        return;
      case "plan_limit":
        form.setError("root", { message: failure.message });
        return;
      case "payments_not_configured":
        form.setError("paymentMode", {
          message: "Online payments aren't set up yet. Choose “At venue” or connect payments in Settings.",
        });
        return;
      case "other":
        applyApiErrors(form, err);
        toast.error(errorMessage(err));
    }
  };

  return async (values: Values) => {
    if (!service) return;
    if (service.options.length > 0 && !values.optionId) {
      form.setError("optionId", { message: "Choose an option" });
      return;
    }
    const answerProblems = Object.entries(answerErrors(values, service.id, questions));
    for (const [i, [id, message]] of answerProblems.entries()) {
      form.setError(`answers.${id}`, { message }, { shouldFocus: i === 0 });
    }
    if (answerProblems.length > 0) return;
    const input = buildStaffBooking(values, service, {
      timeZone: business.timezone,
      bookAnyCalendar: perms.bookAnyCalendar,
      questions,
    });
    try {
      const booking = await create.mutateAsync({ input, idempotencyKey: idempotencyKey.current });
      idempotencyKey.current = newIdempotencyKey();
      created(booking, values);
    } catch (err) {
      failed(err);
    }
  };
}
