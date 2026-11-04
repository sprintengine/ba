import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { useUpdateBusiness } from "@shared/api/hooks/use-business";
import { useBusinessContext } from "@shared/business/business-context";
import { flattenFieldErrors } from "@shared/settings/api-fields";
import {
  brandingSchema,
  brandingValuesToUpdate,
  businessToBrandingValues,
  type BrandingValues as V,
} from "@shared/settings/branding-form";
import { SITE_THEME_KEYS, SITE_THEMES } from "@shared/site/themes";
import { BRAND_SWATCHES } from "@shared/theme/color";
import { Section } from "~/ui";
import {
  applyApiErrors,
  FormColorField,
  FormRadioGroup,
  FormRootError,
  FormTextField,
  HeaderButton,
  SaveBar,
  useSaveFeedback,
  useUnsavedChangesGuard,
} from "~/ui/form";
import { space } from "~/ui/tokens";
import { SettingsPage } from "../SettingsPage";
import { ImageField } from "./ImageField";
import { BrandingPreview } from "./Preview";

const WORDS = [
  ["booking", "What's booked (one)"],
  ["bookings", "What's booked (many)"],
  ["customer", "Who books (one)"],
  ["customers", "Who books (many)"],
  ["resource", "Who or what is booked (one)"],
  ["resources", "Who or what is booked (many)"],
] as const;

/**
 * Settings › Branding (the website's BrandingSettings): a live preview, the brand colour, logo and cover (uploaded
 * from the photo library or by address), the booking page style (without a site) and the words people see.
 */
export function BrandingSettings() {
  const { business } = useBusinessContext();
  const update = useUpdateBusiness(business.id);
  const feedback = useSaveFeedback();
  const form = useForm<V>({
    resolver: zodResolver(brandingSchema),
    defaultValues: businessToBrandingValues(business),
  });
  const { isDirty, isSubmitting } = form.formState;
  useUnsavedChangesGuard(isDirty);

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync(brandingValuesToUpdate(values));
      form.reset(businessToBrandingValues(saved));
      feedback.saved("Branding saved");
    } catch (err) {
      applyApiErrors(form, flattenFieldErrors(err, ["branding", "vocabulary"]));
    }
  });

  return (
    <SettingsPage
      segment="branding"
      headerRight={() => (
        <HeaderButton
          label="Save"
          primary
          testID="settings-save"
          disabled={!isDirty}
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      )}
    >
      <Section title="Preview" description="Your booking page header, live as you edit.">
        <BrandingPreview control={form.control} />
      </Section>

      <Section
        title="Colour and images"
        description="Buttons, selected dates and links use your colour. We adjust it automatically so text stays readable in light and dark mode."
      >
        <FormColorField
          control={form.control}
          name="primaryColor"
          label="Brand colour"
          testID="branding-color"
          swatches={BRAND_SWATCHES}
          custom
        />
        <ImageField
          control={form.control}
          name="logoUrl"
          businessId={business.id}
          label="Logo"
          help="A square image works best. Choose one from your photos, or paste an image address."
          shape="square"
          testID="branding-logo"
        />
        <ImageField
          control={form.control}
          name="coverImageUrl"
          businessId={business.id}
          label="Cover image"
          help={
            business.sitesEnabled
              ? "Wide photo (3:1) used when your site has no hero image of its own."
              : "Wide photo (3:1) shown at the top of your booking page."
          }
          shape="wide"
          testID="branding-cover"
        />
      </Section>

      {/* With a site, the booking pages wear the site's theme (chosen in the site editor) instead. */}
      {business.sitesEnabled ? null : (
        <Section
          title="Booking page style"
          description="Fonts, corners and surfaces for your booking page. Your colour, logo and cover go on top."
        >
          <FormRadioGroup
            control={form.control}
            name="portalStyle"
            label="Style"
            hideLabel
            testID="branding-style"
            options={SITE_THEME_KEYS.map((key) => ({
              value: key,
              label: SITE_THEMES[key].name,
              description: SITE_THEMES[key].description,
            }))}
          />
        </Section>
      )}

      <Section
        title="Wording"
        description="Use the words your customers use — a physio has patients and appointments, a school has students and lessons."
      >
        <View style={styles.words}>
          {WORDS.map(([key, label]) => (
            <FormTextField
              key={key}
              control={form.control}
              name={key}
              label={label}
              testID={`branding-word-${key}`}
              autoCorrect={false}
              autoComplete="off"
            />
          ))}
        </View>
      </Section>

      <FormRootError control={form.control} />
      <SaveBar
        dirty={isDirty}
        saving={isSubmitting}
        onSave={() => void submit()}
        onDiscard={() => form.reset(businessToBrandingValues(business))}
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({ words: { gap: space[4] } });
