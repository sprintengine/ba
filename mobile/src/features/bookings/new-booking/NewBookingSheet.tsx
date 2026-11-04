import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FormProvider, useForm, useFormState, useWatch, type UseFormReturn } from "react-hook-form";
import { errorMessage, newIdempotencyKey } from "@shared/api/client";
import { useCreateBooking } from "@shared/api/hooks/use-bookings";
import { useQuestions } from "@shared/api/hooks/use-business";
import { useResources } from "@shared/api/hooks/use-resources";
import { useServices } from "@shared/api/hooks/use-services";
import type { CreatedBooking, FormQuestion, Service } from "@shared/api/types";
import { quote } from "@shared/booking/quote";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import {
  answerErrors,
  buildStaffBooking,
  createBookingFailure,
  newBookingDefaults,
  newBookingSchema,
  questionsFor,
  type NewBookingPrefill,
  type NewBookingValues as Values,
} from "@shared/dashboard/new-booking";
import { formatDuration, todayInTz } from "@shared/format";
import { useVocabulary } from "@shared/vocabulary";
import { Button, ErrorState, Sheet, Skeleton, Text, useToast } from "~/ui";
import { space } from "~/ui/tokens";
import { FieldGroup } from "../fields";
import { useFmt } from "../fmt";
import { applyApiErrors } from "../form";
import { haptics } from "../haptics";
import { CustomerStep } from "./CustomerStep";
import { HeldForPayment } from "./HeldForPayment";
import { PaymentStep } from "./PaymentStep";
import { QuestionsStep } from "./QuestionsStep";
import { ServiceStep } from "./ServiceStep";
import { WhenStep } from "./WhenStep";

type Held = { booking: CreatedBooking; checkoutUrl: string; emailed: boolean };

export type NewBookingSheetProps = {
  visible: boolean;
  prefill: NewBookingPrefill;
  onClose: () => void;
  /** Open the booking (from the held-for-payment view). */
  onView: (bookingId: string) => void;
};

/**
 * The staff "New booking" form (the website's sheet): service → option/add-ons → time → customer → questions →
 * payment and notes, in a page sheet (a centred form sheet on iPad). Validated with the website's schema; a booking
 * held for online payment shows its link instead of closing.
 */
export function NewBookingSheet({ visible, prefill, onClose, onView }: NewBookingSheetProps) {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const services = useServices(business.id, { enabled: visible });
  const questions = useQuestions(business.id, { enabled: visible });
  const resources = useResources(business.id, { enabled: visible });
  const failed = [services, questions, resources].filter((q) => q.isError && !q.data);
  const today = todayInTz(business.timezone);
  const [held, setHeld] = useState<Held | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(newBookingSchema),
    defaultValues: newBookingDefaults(prefill, today),
  });
  const serviceId = useWatch({ control: form.control, name: "serviceId" });
  const active = (services.data ?? []).filter((s) => s.isActive);
  const service = active.find((s) => s.id === serviceId);
  const submit = useSubmit({ form, service, questions: questions.data ?? [], onHeld: setHeld, onClose });
  const title = held ? `${v("booking", { title: true })} held for payment` : `New ${v("booking")}`;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      testID="new-booking-sheet"
      footer={
        held ? undefined : (
          <Footer form={form} service={service} disabled={!service || failed.length > 0} onSubmit={submit} />
        )
      }
    >
      {held ? (
        <HeldForPayment
          {...held}
          onDone={onClose}
          onView={() => {
            onClose();
            onView(held.booking.id);
          }}
        />
      ) : failed[0] ? (
        <ErrorState error={failed[0].error} onRetry={() => failed.forEach((q) => void q.refetch())} />
      ) : services.isPending ? (
        <View style={styles.steps} accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
          <Skeleton height={56} radius="lg" />
          <Skeleton height={56} radius="lg" />
          <Skeleton height={160} radius="lg" />
        </View>
      ) : active.length === 0 ? (
        <Text tone="muted">Add a service first. Every {v("booking")} is for a service.</Text>
      ) : (
        <FormProvider {...form}>
          <Text variant="footnote" tone="subtle">
            Times are in {business.timezone.replace(/_/g, " ")}.
          </Text>
          <Steps
            services={active}
            questions={questions.data ?? []}
            resources={resources.data ?? []}
            service={service}
            prefill={prefill}
            today={today}
          />
        </FormProvider>
      )}
    </Sheet>
  );
}

function Steps({
  services,
  questions,
  resources,
  service,
  prefill,
  today,
}: {
  services: Service[];
  questions: FormQuestion[];
  resources: NonNullable<ReturnType<typeof useResources>["data"]>;
  service: Service | undefined;
  prefill: NewBookingPrefill;
  today: string;
}) {
  const { v } = useVocabulary();
  const asked = service ? questionsFor(questions, service.id) : [];
  return (
    <View style={styles.steps}>
      <FieldGroup step={1} title="Service">
        <ServiceStep services={services} service={service} />
      </FieldGroup>
      <FieldGroup step={2} title="When">
        {service ? (
          <WhenStep service={service} resources={resources} today={today} />
        ) : (
          <Text variant="callout" tone="subtle">
            Choose a service to see free times.
          </Text>
        )}
      </FieldGroup>
      <FieldGroup step={3} title={v("customer", { title: true })}>
        <CustomerStep prefill={prefill.customer} />
      </FieldGroup>
      {asked.length > 0 ? (
        <FieldGroup step={4} title="Questions">
          <QuestionsStep questions={asked} />
        </FieldGroup>
      ) : null}
      <FieldGroup step={asked.length > 0 ? 5 : 4} title="Payment and notes">
        <PaymentStep service={service} />
      </FieldGroup>
      <RootError />
    </View>
  );
}

function RootError() {
  const { errors } = useFormState<Values>();
  if (!errors.root?.message) return null;
  return (
    <Text tone="danger" accessibilityLiveRegion="polite" accessibilityRole="alert">
      {errors.root.message}
    </Text>
  );
}

/** When, how long and the price, then Create. */
function Footer({
  form,
  service,
  disabled,
  onSubmit,
}: {
  form: UseFormReturn<Values>;
  service: Service | undefined;
  disabled: boolean;
  onSubmit: (values: Values) => Promise<void>;
}) {
  const { v } = useVocabulary();
  const fmt = useFmt();
  const [optionId, addonIds, timeMode, slotStart, slotOffer, date, exactTime] = useWatch({
    control: form.control,
    name: ["optionId", "addonIds", "timeMode", "slotStart", "slotOffer", "date", "exactTime"],
  });
  const { isSubmitting } = useFormState({ control: form.control });
  let summary = "Nothing selected yet";
  if (service) {
    const q = quote(service, optionId, addonIds);
    const deal = timeMode === "slots" && slotStart ? slotOffer : null;
    const when =
      timeMode === "slots"
        ? slotStart
          ? `${fmt.date(slotStart, "dayMonth")}, ${fmt.time(slotStart)}`
          : "No time yet"
        : exactTime
          ? `${fmt.date(date, "dayMonth")}, ${exactTime}`
          : "No time yet";
    summary = `${when} · ${formatDuration(q.durationMinutes)} · ${fmt.price(deal ? deal.priceCents : q.totalCents)}`;
  }
  return (
    <View style={styles.footer}>
      <Text variant="callout" tone="muted" numeric numberOfLines={2} testID="new-booking-summary">
        {summary}
      </Text>
      <Button
        testID="create-booking"
        label={`Create ${v("booking")}`}
        fullWidth
        loading={isSubmitting}
        disabled={disabled}
        onPress={() => void form.handleSubmit(onSubmit, () => haptics.error())()}
      />
    </View>
  );
}

/**
 * Create the booking (one idempotency key per submit intent, renewed after success). Held for online payment: show
 * its link; otherwise toast and close. Taken times, plan limits and unconnected payments are answered on the form.
 */
function useSubmit({
  form,
  service,
  questions,
  onHeld,
  onClose,
}: {
  form: UseFormReturn<Values>;
  service: Service | undefined;
  questions: FormQuestion[];
  onHeld: (held: Held) => void;
  onClose: () => void;
}) {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const toast = useToast();
  const create = useCreateBooking(business.id);
  const key = useRef<string | null>(null);

  return async (values: Values) => {
    if (!service) return;
    if (service.options.length > 0 && !values.optionId) {
      form.setError("optionId", { message: "Choose an option" });
      return;
    }
    const problems = Object.entries(answerErrors(values, service.id, questions));
    for (const [id, message] of problems) form.setError(`answers.${id}`, { message });
    if (problems.length > 0) return;
    const input = buildStaffBooking(values, service, {
      timeZone: business.timezone,
      bookAnyCalendar: perms.bookAnyCalendar,
      questions,
    });
    key.current ??= newIdempotencyKey();
    try {
      const booking = await create.mutateAsync({ input, idempotencyKey: key.current });
      key.current = null;
      haptics.success();
      if (booking.status === "held" && booking.checkoutUrl) {
        onHeld({
          booking,
          checkoutUrl: booking.checkoutUrl,
          emailed: values.notifyCustomer && !!booking.customer.email,
        });
        return;
      }
      toast.show(
        booking.status === "held"
          ? `${v("booking", { title: true })} created. Held for ${business.policies.holdMinutes} min while the ${v("customer")} pays.`
          : `${v("booking", { title: true })} created: ${fmt.date(booking.start, "dayMonth")}, ${fmt.time(booking.start)} · ${booking.customer.name}`,
      );
      onClose();
    } catch (err) {
      haptics.error();
      const failure = createBookingFailure(err, v("bookings"));
      switch (failure.kind) {
        case "slot_taken":
          form.setValue("slotStart", null);
          form.setError("slotStart", { message: "That time was just taken. Pick another one." });
          toast.show("That time is no longer free.", "danger");
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
          toast.show(errorMessage(err), "danger");
      }
    }
  };
}

const styles = StyleSheet.create({
  steps: { gap: space[8], paddingTop: space[2] },
  footer: { gap: space[2] },
});
