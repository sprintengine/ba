/** The service editor's lists (the website's options, add-ons and requirements sections). */
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react-native";
import { useResources } from "@shared/api/hooks/use-resources";
import { useBusinessContext } from "@shared/business/business-context";
import type { ServiceFormValues as V } from "@shared/services/service-form";
import { SERVICE_LIMITS } from "@shared/validation/limits";
import { useVocabulary } from "@shared/vocabulary";
import { Banner, Button, IconButton, Section, Text } from "~/ui";
import { FormChipGroup, FormMoneyField, FormNumberField, FormSwitch, FormTextField } from "~/ui/form";
import { chooseHint, resourceChipLabel, resourceChoices } from "./editor";
import { FieldError, FieldRow, ItemCard, ItemHeader } from "./editor-fields";

export function OptionsSection() {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const { control, getValues } = useFormContext<V>();
  const { fields, append, remove } = useFieldArray({ control, name: "options" });
  return (
    <Section
      title="Options"
      description={`Versions with their own length and price, such as car size or lesson length. The ${v("customer")} picks one.`}
      testID="service-options"
      footer={
        <Button
          size="sm"
          variant="secondary"
          icon={Plus}
          label="Add option"
          testID="service-add-option"
          disabled={fields.length >= SERVICE_LIMITS.options}
          onPress={() =>
            append({
              name: "",
              description: "",
              durationMinutes: getValues("durationMinutes") ?? 30,
              priceCents: getValues("priceCents") ?? 0,
            })
          }
        />
      }
    >
      {fields.length === 0 ? (
        <Text variant="callout" tone="subtle">
          No options: everyone books the same thing.
        </Text>
      ) : (
        fields.map((f, i) => (
          <ItemCard key={f.id} testID={`service-option-${i}`}>
            <ItemHeader
              title={`Option ${i + 1}`}
              action={
                <IconButton
                  icon={Trash2}
                  color="danger"
                  accessibilityLabel={`Remove option ${i + 1}`}
                  onPress={() => remove(i)}
                  testID={`service-option-${i}-remove`}
                />
              }
            />
            <FormTextField
              control={control}
              name={`options.${i}.name`}
              label="Name"
              placeholder="Option name"
              accessibilityLabel={`Option ${i + 1} name`}
              testID={`service-option-${i}-name`}
            />
            <FieldRow>
              <FormNumberField
                control={control}
                name={`options.${i}.durationMinutes`}
                label="Duration"
                unit="min"
                unitLabel="minutes"
                testID={`service-option-${i}-duration`}
              />
              <FormMoneyField
                control={control}
                name={`options.${i}.priceCents`}
                label="Price"
                currency={business.currency}
                locale={business.locale}
                testID={`service-option-${i}-price`}
              />
            </FieldRow>
          </ItemCard>
        ))
      )}
    </Section>
  );
}

export function AddonsSection() {
  const { business } = useBusinessContext();
  const { control } = useFormContext<V>();
  const { fields, append, remove } = useFieldArray({ control, name: "addons" });
  return (
    <Section
      title="Add-ons"
      description="Optional extras that add time and cost."
      testID="service-addons"
      footer={
        <Button
          size="sm"
          variant="secondary"
          icon={Plus}
          label="Add add-on"
          testID="service-add-addon"
          disabled={fields.length >= SERVICE_LIMITS.addons}
          onPress={() => append({ name: "", description: "", extraMinutes: 0, priceCents: 0 })}
        />
      }
    >
      {fields.length === 0 ? (
        <Text variant="callout" tone="subtle">
          No add-ons.
        </Text>
      ) : (
        fields.map((f, i) => (
          <ItemCard key={f.id} testID={`service-addon-${i}`}>
            <ItemHeader
              title={`Add-on ${i + 1}`}
              action={
                <IconButton
                  icon={Trash2}
                  color="danger"
                  accessibilityLabel={`Remove add-on ${i + 1}`}
                  onPress={() => remove(i)}
                  testID={`service-addon-${i}-remove`}
                />
              }
            />
            <FormTextField
              control={control}
              name={`addons.${i}.name`}
              label="Name"
              placeholder="Add-on name"
              accessibilityLabel={`Add-on ${i + 1} name`}
              testID={`service-addon-${i}-name`}
            />
            <FieldRow>
              <FormNumberField
                control={control}
                name={`addons.${i}.extraMinutes`}
                label="Extra time"
                unit="+min"
                unitLabel="extra minutes"
                testID={`service-addon-${i}-minutes`}
              />
              <FormMoneyField
                control={control}
                name={`addons.${i}.priceCents`}
                label="Price"
                currency={business.currency}
                locale={business.locale}
                testID={`service-addon-${i}-price`}
              />
            </FieldRow>
          </ItemCard>
        ))
      )}
    </Section>
  );
}

export function RequirementsSection() {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const resources = useResources(business.id);
  const { control } = useFormContext<V>();
  const { fields, append, remove } = useFieldArray({ control, name: "requirements" });
  const values = useWatch({ control, name: "requirements" });
  return (
    <Section
      title="Who and what it needs"
      description={`Each requirement is filled by one (or more) of the ${v("resources")} you pick, e.g. 1 therapist and 1 room.`}
      testID="service-requirements"
      footer={
        <Button
          size="sm"
          variant="secondary"
          icon={Plus}
          label="Add requirement"
          testID="service-add-requirement"
          disabled={fields.length >= SERVICE_LIMITS.requirements}
          onPress={() => append({ label: "", quantity: 1, customerSelectable: false, resourceIds: [] })}
        />
      }
    >
      {fields.length === 0 ? (
        <Banner tone="warning" testID="service-no-requirements">
          Without a requirement nobody can be booked for this service.
        </Banner>
      ) : null}
      {fields.map((f, i) => {
        const r = values[i];
        const choices = resourceChoices(resources.data, r?.resourceIds ?? []);
        return (
          <ItemCard key={f.id} testID={`service-requirement-${i}`}>
            <ItemHeader
              title={`Requirement ${i + 1}`}
              action={
                <IconButton
                  icon={Trash2}
                  color="danger"
                  accessibilityLabel={`Remove requirement ${i + 1}`}
                  onPress={() => remove(i)}
                  testID={`service-requirement-${i}-remove`}
                />
              }
            />
            <FieldRow>
              <FormTextField
                control={control}
                name={`requirements.${i}.label`}
                label="Label"
                placeholder={`e.g. ${v("resource", { title: true })}`}
                testID={`service-requirement-${i}-label`}
              />
              <FormNumberField
                control={control}
                name={`requirements.${i}.quantity`}
                label="How many"
                testID={`service-requirement-${i}-quantity`}
              />
            </FieldRow>
            {choices.length > 0 ? (
              <FormChipGroup
                control={control}
                name={`requirements.${i}.resourceIds`}
                label="Can be done by"
                chips={choices.map((res) => ({ value: res.id, label: resourceChipLabel(res) }))}
                testID={`service-requirement-${i}-resources`}
              />
            ) : (
              <>
                <Text variant="callout" tone="subtle">
                  Add {v("resources")} first.
                </Text>
                <FieldError control={control} name={`requirements.${i}.resourceIds`} />
              </>
            )}
            <FormSwitch
              control={control}
              name={`requirements.${i}.customerSelectable`}
              label={`Let the ${v("customer")} choose`}
              description={chooseHint(r?.label)}
              testID={`service-requirement-${i}-selectable`}
            />
            <FieldError control={control} name={`requirements.${i}.customerSelectable`} />
          </ItemCard>
        );
      })}
    </Section>
  );
}
