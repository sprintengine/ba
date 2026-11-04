import { zodResolver } from "@hookform/resolvers/zod";
import { Stack } from "expo-router";
import { useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import type { Offer, Service } from "@shared/api/types";
import { useCreateOffer, useUpdateOffer } from "@shared/api/hooks/use-offers";
import { useBusinessContext } from "@shared/business/business-context";
import {
  defaultOfferForm,
  formToInput,
  offerFormSchema,
  offerToForm,
  withOfferFormPaths,
  type OfferFormValues,
} from "@shared/offers/offer-form";
import { useVocabulary } from "@shared/vocabulary";
import { Button, Text } from "~/ui";
import {
  applyApiErrors,
  FormRootError,
  FormScroll,
  HeaderButton,
  useSaveFeedback,
  useUnsavedChangesGuard,
} from "~/ui/form";
import { space } from "~/ui/tokens";
import { AffectedSlotsPreview } from "./AffectedSlotsPreview";
import {
  BasicsSection,
  DiscountSection,
  LimitsSection,
  ScheduleSection,
  ServicesSection,
} from "./OfferFields";

export type OfferEditorProps = {
  /** The deal to edit; null creates one. */
  offer: Offer | null;
  /** Services the deal can apply to (active ones, plus any it already covers). */
  services: Service[];
  /**
   * `screen`: its own screen on phones (title and Save in the native header). `pane`: beside the list on iPad
   * (title and Save at the top of the pane).
   */
  variant: "screen" | "pane";
  /** After a save; `created` for a new deal. */
  onSaved: (offer: Offer, created: boolean) => void;
  /** Debounce for the affected-times preview (tests use 0). */
  previewDelay?: number;
};

/**
 * Create or edit a deal (the website's OfferEditor): basics, services, discount, when it applies, dates and limits,
 * the live "Affected times" before saving. Unsaved changes ask before they're lost.
 */
export function OfferEditor({ offer, services, variant, onSaved, previewDelay }: OfferEditorProps) {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const create = useCreateOffer(business.id);
  const update = useUpdateOffer(business.id);
  const feedback = useSaveFeedback();
  const form = useForm<OfferFormValues>({
    resolver: zodResolver(offerFormSchema),
    defaultValues: offer ? offerToForm(offer) : defaultOfferForm(services.map((s) => s.id)),
  });
  const { isDirty, isSubmitting } = form.formState;
  const { leave } = useUnsavedChangesGuard(isDirty);
  const title = offer ? `Edit ${offer.name}` : "New offer";
  const saveLabel = offer ? "Save changes" : "Create offer";

  const submit = form.handleSubmit(async (values) => {
    const input = formToInput(values);
    try {
      const saved = offer
        ? await update.mutateAsync({ id: offer.id, input })
        : await create.mutateAsync(input);
      form.reset(offerToForm(saved));
      feedback.saved(offer ? `${input.name} saved` : `${input.name} created`);
      leave(() => onSaved(saved, !offer));
    } catch (err) {
      applyApiErrors(form, withOfferFormPaths(err));
    }
  });

  return (
    <>
      {variant === "screen" ? (
        <Stack.Screen
          options={{
            title,
            headerLargeTitle: false,
            headerRight: () => (
              <HeaderButton
                label={offer ? "Save" : "Create"}
                primary
                testID="offer-header-save"
                disabled={!!offer && !isDirty}
                loading={isSubmitting}
                onPress={() => void submit()}
              />
            ),
          }}
        />
      ) : null}
      <FormScroll width="content" testID="offer-editor">
        <View style={styles.intro}>
          {variant === "pane" ? <Text variant="title2">{title}</Text> : null}
          <Text variant="callout" tone="muted">
            Discount quiet times automatically. {v("customers", { title: true })} see the deal when they pick
            a time.
          </Text>
        </View>
        <BasicsSection form={form} />
        <ServicesSection form={form} services={services} />
        <DiscountSection form={form} />
        <ScheduleSection form={form} />
        <LimitsSection form={form} />
        <AffectedSlotsPreview control={form.control} delay={previewDelay} />
        <FormRootError control={form.control} />
        <Button
          testID="offer-save"
          label={saveLabel}
          loading={isSubmitting}
          disabled={!!offer && !isDirty}
          onPress={() => void submit()}
          fullWidth
        />
      </FormScroll>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space[1] },
});
