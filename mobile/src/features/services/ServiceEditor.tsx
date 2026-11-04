import { zodResolver } from "@hookform/resolvers/zod";
import { Stack } from "expo-router";
import { FormProvider, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import type { Service } from "@shared/api/types";
import { useCreateService, useDeleteService, useReplaceService } from "@shared/api/hooks/use-services";
import { useBusinessContext } from "@shared/business/business-context";
import {
  formValuesToServiceInput,
  serviceFormSchema,
  serviceToFormValues,
  type ServiceFormValues as V,
} from "@shared/services/service-form";
import { Button, Section, Text, useToast } from "~/ui";
import {
  applyApiErrors,
  confirmAction,
  FormRootError,
  FormScroll,
  hapticError,
  HeaderButton,
  SaveBar,
  useSaveFeedback,
  useUnsavedChangesGuard,
} from "~/ui/form";
import { space } from "~/ui/tokens";
import { categoriesOf } from "./services";
import { newServiceValues } from "./editor";
import { AddonsSection, OptionsSection, RequirementsSection } from "./EditorLists";
import {
  BasicsSection,
  PricingSection,
  QuestionsSection,
  RulesSection,
  TimingSection,
} from "./EditorSections";

export type ServiceEditorProps = {
  /** The service to edit; null creates one. */
  service: Service | null;
  /** Every service: the category suggestions and a new service's place at the end. */
  services: readonly Service[];
  /**
   * Beside the list on iPad: the page titles itself and has its own Save. On phones (its own pushed screen) the
   * native header carries the title and Save.
   */
  embedded?: boolean;
  /** After saving (phones go back; iPad keeps the saved service open). */
  onSaved: (service: Service) => void;
  /** After deleting (or deactivating) it. */
  onDeleted: () => void;
};

/**
 * Create or edit a service (the website's ServiceEditor): basics, timing, price and payment, booking rules, options,
 * add-ons, who and what it needs, and the questions asked. The website's live customer preview is left out: the
 * booking page itself is a tap away on the phone.
 */
export function ServiceEditor({ service, services, embedded, onSaved, onDeleted }: ServiceEditorProps) {
  const { business } = useBusinessContext();
  const create = useCreateService(business.id);
  const replace = useReplaceService(business.id);
  const remove = useDeleteService(business.id);
  const feedback = useSaveFeedback();
  const toast = useToast();
  const defaults = () => (service ? serviceToFormValues(service) : newServiceValues(services));
  const form = useForm<V>({ resolver: zodResolver(serviceFormSchema), defaultValues: defaults() });
  const { isDirty, isSubmitting } = form.formState;
  const { leave } = useUnsavedChangesGuard(isDirty);
  const title = service ? `Edit ${service.name}` : "New service";
  const saveLabel = service ? "Save" : "Create";

  const submit = form.handleSubmit(
    async (values) => {
      const input = formValuesToServiceInput(values);
      try {
        const result = service
          ? await replace.mutateAsync({ id: service.id, input })
          : await create.mutateAsync(input);
        feedback.saved(service ? `${input.name} saved` : `${input.name} created`);
        form.reset(serviceToFormValues(result));
        leave(() => onSaved(result));
      } catch (err) {
        hapticError();
        applyApiErrors(form, err);
      }
    },
    () => {
      hapticError();
      toast.show("Check the highlighted fields", "danger");
    },
  );

  const deleteService = async () => {
    if (!service) return;
    const ok = await confirmAction({
      title: `Delete ${service.name}?`,
      message: "If it has ever been booked it is deactivated instead, so history and reports stay intact.",
      confirmLabel: "Delete service",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(service.id);
      feedback.saved(`${service.name} removed`);
      leave(onDeleted);
    } catch (err) {
      feedback.failed(err);
    }
  };

  const save = (
    <HeaderButton
      label={saveLabel}
      primary
      testID="service-save"
      disabled={!isDirty && !!service}
      loading={isSubmitting}
      onPress={() => void submit()}
    />
  );

  return (
    <FormProvider {...form}>
      {embedded ? null : (
        <Stack.Screen options={{ title, headerLargeTitle: false, headerRight: () => save }} />
      )}
      <FormScroll width="content" testID="service-editor">
        {embedded ? (
          <View style={styles.titleRow}>
            <Text variant="title2" style={styles.title}>
              {title}
            </Text>
            {save}
          </View>
        ) : null}
        <Text variant="callout" tone="muted">
          What people book, how long it takes, what it costs and who does it.
        </Text>
        <BasicsSection categories={categoriesOf(services)} />
        <TimingSection serviceId={service?.id ?? null} />
        <PricingSection />
        <RulesSection />
        <OptionsSection />
        <AddonsSection />
        <RequirementsSection />
        {service ? <QuestionsSection serviceId={service.id} /> : null}
        <FormRootError control={form.control} />
        <SaveBar
          dirty={isDirty}
          saving={isSubmitting}
          saveLabel={service ? "Save changes" : "Create service"}
          onSave={() => void submit()}
          onDiscard={() => form.reset(defaults())}
        />
        {service ? (
          <Section
            title="Delete service"
            description="If it has ever been booked it is deactivated instead, so history and reports stay intact."
          >
            <Button
              testID="service-delete"
              variant="destructive"
              icon={Trash2}
              label={`Delete ${service.name}`}
              loading={remove.isPending}
              onPress={() => void deleteService()}
            />
          </Section>
        ) : null}
      </FormScroll>
    </FormProvider>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  title: { flex: 1 },
});
