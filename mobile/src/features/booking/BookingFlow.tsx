import { router, Stack } from "expo-router";
import { useEffect, useRef, type ReactNode } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { ArrowRight, ChevronLeft, Lock, MapPin } from "lucide-react-native";
import type { PublicBusiness, PublicService } from "@shared/api/types";
import { shortAddress } from "@shared/booking/booking";
import { extrasStepDescription, submitLabel } from "@shared/booking/copy";
import { servicesForGroup } from "@shared/booking/services";
import { isStepComplete, nextStep } from "@shared/booking/steps";
import type { FlowState } from "@shared/booking/url";
import { formatDuration, toPlainDate, toTimeOfDay } from "@shared/format";
import { ManageBookingView } from "~/features/manage/ManageBookingView";
import { contextFromOutcome } from "~/features/manage/manage-context";
import { Button, Icon, IconButton, Text, useLayout, useTheme } from "~/ui";
import { layout, space } from "~/ui/tokens";
import { Callout } from "./Callout";
import { BusinessDeals } from "./BusinessDeals";
import { DetailsStep } from "./DetailsStep";
import { ReviewStep } from "./ReviewStep";
import { ExtrasStep, GroupStep, ResourceStep, ServiceStep, StepHeader, StepProgress } from "./steps";
import { BookingSummaryCard, SummaryBar, type SummaryProps } from "./Summary";
import { NextSlotPicker } from "./time/NextSlotPicker";
import { SlotPicker } from "./time/SlotPicker";
import { useBookingFlow, type BookingFlowModel } from "./use-booking-flow";

type StepView = { title: string; description?: string | null; content: ReactNode };

/**
 * The booking flow (`/[slug]/book`): group → service → extras → resource → time → details → review, with the steps
 * that apply. Phones: one column with the total and the step's action pinned to the bottom. Large screens: the steps
 * beside the summary. Once booked (or back from Checkout) the booking itself shows, as on the website's manage page.
 */
export function BookingFlow({
  business,
  services,
  initial,
}: {
  business: PublicBusiness;
  services: PublicService[];
  initial: FlowState;
}) {
  const flow = useBookingFlow(business, services, initial);
  const done = flow.submit.done;
  if (done) {
    return (
      <>
        <Stack.Screen
          options={{
            title: `Your ${flow.noun("booking")}`,
            headerBackVisible: false,
            gestureEnabled: false,
            headerLeft: () => (
              <Button
                testID="booking-done"
                variant="ghost"
                size="sm"
                label="Done"
                onPress={() => router.back()}
              />
            ),
          }}
        />
        <ManageBookingView token={done.token} context={contextFromOutcome(done.context)} />
      </>
    );
  }
  return <FlowSteps flow={flow} />;
}

function FlowSteps({ flow }: { flow: BookingFlowModel }) {
  const { isWide } = useLayout();
  const { colors } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const view = stepView(flow);
  const action = stepAction(flow);
  const back = flow.back;
  const goBack = back ? () => flow.goTo(back) : null;

  // A new step starts at the top, and screen readers hear its title.
  const shown = useRef(flow.step);
  useEffect(() => {
    if (shown.current === flow.step) return;
    shown.current = flow.step;
    scroll.current?.scrollTo({ y: 0, animated: false });
    AccessibilityInfo.announceForAccessibility(view.title);
  }, [flow.step, view.title]);

  // Android's back button goes to the previous step first.
  const goTo = flow.goTo;
  useEffect(() => {
    if (!back) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goTo(back);
      return true;
    });
    return () => sub.remove();
  }, [back, goTo]);

  const summary: SummaryProps = {
    business: flow.business,
    service: flow.service,
    selection: flow.sel,
    quote: flow.quote,
    steps: flow.steps,
    onEdit: flow.goTo,
    takesOnlinePayment: flow.services.some((s) => s.paymentMode === "full" || s.paymentMode === "deposit"),
    resourceNoun: flow.noun("resource"),
    bookingNoun: flow.noun("booking"),
  };

  const header = (
    <Stack.Screen
      options={{
        title: flow.business.name,
        // The header's back goes to the previous step; from the first step it leaves the flow.
        headerBackVisible: !goBack,
        gestureEnabled: !goBack,
        headerLeft: goBack
          ? () => (
              <IconButton
                testID="header-step-back"
                icon={ChevronLeft}
                accessibilityLabel="Back"
                onPress={goBack}
              />
            )
          : undefined,
      }}
    />
  );

  const steps = (
    <View style={styles.steps}>
      {flow.stepIndex === 0 || isWide ? (
        <BusinessIntro
          business={flow.business}
          services={flow.services}
          onBook={(id) => {
            const service = flow.services.find((s) => s.id === id);
            if (service) flow.choose({ type: "service", service }, true);
          }}
        />
      ) : null}
      <StepProgress index={flow.stepIndex} total={flow.stepTotal.total} />
      <StepHeader
        index={flow.stepIndex}
        total={flow.stepTotal.known ? flow.stepTotal.total : null}
        title={view.title}
        description={view.description}
        onBack={goBack}
      />
      <View key={flow.step}>{view.content}</View>
    </View>
  );

  if (isWide) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]} testID="booking-flow">
        {header}
        <View style={styles.wide}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
            <ScrollView
              ref={scroll}
              contentInsetAdjustmentBehavior="automatic"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.wideContent}
            >
              {steps}
            </ScrollView>
            {action ? (
              <View
                style={[
                  styles.wideAction,
                  { borderTopColor: colors.border, backgroundColor: colors.background },
                ]}
              >
                {action}
              </View>
            ) : null}
          </KeyboardAvoidingView>
          <ScrollView
            style={styles.aside}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.asideContent}
          >
            <BookingSummaryCard {...summary} />
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]} testID="booking-flow">
      {header}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.fill}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      >
        <ScrollView
          ref={scroll}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.phoneContent}
        >
          {steps}
        </ScrollView>
        <SummaryBar {...summary} action={action} actionOnly={flow.step === "review"} />
      </KeyboardAvoidingView>
    </View>
  );
}

/** The business's name, description and place above the first step, with its deals. */
function BusinessIntro({
  business,
  services,
  onBook,
}: {
  business: PublicBusiness;
  services: PublicService[];
  onBook: (serviceId: string) => void;
}) {
  const place = shortAddress(business.address);
  return (
    <View style={styles.intro}>
      <Text variant="title1">{business.name}</Text>
      {business.description ? (
        <Text variant="body" tone="muted">
          {business.description}
        </Text>
      ) : null}
      {place ? (
        <View style={styles.place}>
          <Icon icon={MapPin} size={14} color="subtleForeground" />
          <Text variant="callout" tone="subtle">
            {place}
          </Text>
        </View>
      ) : null}
      <BusinessDeals business={business} services={services} compact onBook={onBook} />
    </View>
  );
}

function stepView(flow: BookingFlowModel): StepView {
  const { business, sel, service, quote } = flow;
  switch (flow.step) {
    case "group":
      return {
        title: "Which best describes you?",
        description: "We'll show you the options and times that apply.",
        content: (
          <GroupStep
            groups={business.customerGroups}
            value={sel.groupId}
            onSelect={(groupId) => flow.choose({ type: "group", groupId }, true)}
          />
        ),
      };
    case "service":
      return serviceView(flow);
    default:
      // Every later step has a service (the flow never resolves past "service" without one).
      if (!service || !quote) return serviceView(flow);
  }
  switch (flow.step) {
    case "extras":
      return {
        title: service.name,
        description: extrasStepDescription(service),
        content: (
          <ExtrasStep
            service={service}
            currency={business.currency}
            locale={business.locale}
            optionId={sel.optionId}
            addonIds={sel.addonIds}
            onOption={(optionId) => flow.choose({ type: "option", optionId }, false)}
            onToggleAddon={(addonId) => flow.choose({ type: "toggleAddon", addonId }, false)}
          />
        ),
      };
    case "resource": {
      const requirement = service.selectableRequirement;
      const noun = requirement?.label.trim() || capitalise(flow.noun("resource"));
      return {
        title: `Choose your ${noun.toLowerCase()}`,
        description: business.policies.nextAvailableOnly
          ? "Or choose “Any” for the earliest time with anyone."
          : "Or choose “Any” to see every available time.",
        content: requirement ? (
          <ResourceStep
            requirement={requirement}
            noun={noun}
            value={sel.resource}
            onSelect={(resource) => flow.choose({ type: "resource", resource }, true)}
          />
        ) : null,
      };
    }
    case "time":
      return {
        title: "Pick a time",
        description: `${service.name} · ${formatDuration(quote.durationMinutes)}`,
        content: <TimeStep flow={flow} />,
      };
    case "details":
      return {
        title: "Your details",
        description: `So ${business.name} knows who's coming.`,
        content: <DetailsStep details={flow.details} businessName={business.name} />,
      };
    default:
      return {
        title: service.requiresApproval ? "Review your request" : "Review and confirm",
        content: (
          <ReviewStep
            business={business}
            service={service}
            selection={sel}
            quote={quote}
            payment={flow.payment}
            details={flow.details.form.getValues()}
            questions={flow.details.questions}
            onEdit={flow.goTo}
            alert={flow.submit.alert}
            resourceNoun={flow.noun("resource")}
            bookingNoun={flow.noun("booking")}
          />
        ),
      };
  }
}

function serviceView(flow: BookingFlowModel): StepView {
  return {
    title: "Choose a service",
    content: (
      <ServiceStep
        services={servicesForGroup(flow.services, flow.sel.groupId)}
        currency={flow.business.currency}
        locale={flow.business.locale}
        value={flow.sel.serviceId}
        onSelect={(service) => flow.choose({ type: "service", service }, true)}
      />
    ),
  };
}

function TimeStep({ flow }: { flow: BookingFlowModel }) {
  const { business, time } = flow;
  const tz = business.timezone;
  const notice = time.conflict ? (
    <Callout tone="warning" alert testID="time-conflict">
      {time.conflict}
    </Callout>
  ) : null;
  const pick = (date: string, at: string) => {
    time.setConflict(null);
    flow.choose({ type: "time", date, time: at }, true);
  };
  if (time.nextOnly) {
    return (
      <NextSlotPicker
        timeZone={tz}
        locale={business.locale}
        currency={business.currency}
        next={time.next}
        stepped={time.after.value !== null}
        selected={!!time.chosenSlot}
        chooseLabel={time.chosenSlot ? "Continue with this time" : "Book this time"}
        onChoose={(slot) => pick(toPlainDate(slot.start, tz), toTimeOfDay(slot.start, tz))}
        onLater={(slot) => {
          time.setConflict(null);
          time.after.later(slot);
        }}
        onEarliest={time.after.earliest}
        notice={notice}
      />
    );
  }
  return (
    <SlotPicker
      timeZone={tz}
      locale={business.locale}
      currency={business.currency}
      min={time.today}
      max={time.maxDate}
      month={time.month}
      onMonthChange={time.setMonth}
      date={flow.sel.date}
      onDateChange={time.onDateChange}
      onWeekChange={time.onWeekChange}
      selectedTime={flow.sel.time}
      onSelectSlot={(_slot, date, at) => pick(date, at)}
      availability={time.availability}
      notice={notice}
    />
  );
}

/** The step's primary action (pinned to the bottom); null when the step has none. */
function stepAction(flow: BookingFlowModel): ReactNode {
  const { step, steps } = flow;
  if (step === "extras") {
    return (
      <Button
        testID="step-continue"
        variant="primary"
        size="lg"
        icon={ArrowRight}
        label="Continue"
        disabled={!isStepComplete(step, flow.sel, flow.ctx)}
        onPress={() => flow.goTo(nextStep(step, steps))}
      />
    );
  }
  if (step === "details") {
    return (
      <Button
        testID="details-review"
        variant="primary"
        size="lg"
        icon={ArrowRight}
        label="Review"
        onPress={() =>
          void flow.details.form.handleSubmit(() => {
            flow.details.setComplete(true);
            flow.goTo("review");
          })()
        }
      />
    );
  }
  if (step === "review") {
    if (!flow.service || !flow.quote) return null;
    const paid = flow.quote.mode === "full" || flow.quote.mode === "deposit";
    return (
      <Button
        testID="booking-submit"
        variant="brand"
        size="lg"
        fullWidth
        icon={paid ? Lock : undefined}
        loading={flow.submit.pending}
        label={submitLabel(
          flow.service,
          flow.quote,
          flow.business.currency,
          flow.business.locale,
          flow.noun("booking"),
        )}
        onPress={() => void flow.submit.submit()}
      />
    );
  }
  if (step === "time" || !isStepComplete(step, flow.sel, flow.ctx)) return null;
  return (
    <Button
      testID="step-continue"
      variant="secondary"
      size="lg"
      icon={ArrowRight}
      label="Continue"
      onPress={() => flow.goTo(nextStep(step, steps))}
    />
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  steps: { gap: space[5] },
  phoneContent: { padding: space[4], paddingBottom: space[8] },
  wide: { flex: 1, flexDirection: "row" },
  wideContent: {
    padding: space[6],
    paddingBottom: space[10],
    maxWidth: layout.maxContentWidth,
    width: "100%",
    alignSelf: "center",
  },
  wideAction: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: space[6],
    paddingVertical: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  aside: { width: layout.splitListWidth - space[10], flexGrow: 0 },
  asideContent: { paddingVertical: space[6], paddingRight: space[6] },
  intro: { gap: space[2] },
  place: { flexDirection: "row", alignItems: "center", gap: space[1.5] },
});
