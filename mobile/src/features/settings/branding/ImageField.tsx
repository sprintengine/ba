import { Image } from "expo-image";
import { useController, type Control } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { ImageUp, X } from "lucide-react-native";
import type { BrandingValues } from "@shared/settings/branding-form";
import { Banner, Button, Text, TextField, useTheme } from "~/ui";
import { radius, space } from "~/ui/tokens";
import { useImageUpload } from "./upload";

export const isImageUrl = (url: string | null | undefined): url is string =>
  !!url && /^https?:\/\//.test(url);

/**
 * The logo or cover image (the website's upload dropzone + address input): a preview, "Choose a photo" (photo
 * library → upload, its address goes in the field), "Remove", and the address itself for an image hosted elsewhere.
 */
export function ImageField({
  control,
  name,
  businessId,
  label,
  help,
  shape,
  testID,
}: {
  control: Control<BrandingValues>;
  name: "logoUrl" | "coverImageUrl";
  businessId: string;
  label: string;
  help: string;
  /** A square logo (cropped square when picked) or a 3:1 cover. */
  shape: "square" | "wide";
  testID: string;
}) {
  const { colors } = useTheme();
  const {
    field: { ref, value: url, onChange, onBlur },
    fieldState,
  } = useController({ control, name });
  const upload = useImageUpload(businessId);

  const choose = async () => {
    const stored = await upload.choose(shape === "square" ? "square" : "none");
    if (stored) onChange(stored.url);
  };

  return (
    <View style={styles.root} testID={testID}>
      <Text variant="callout" weight="medium">
        {label} <Text tone="subtle">(optional)</Text>
      </Text>
      {isImageUrl(url) ? (
        <Image
          testID={`${testID}-preview`}
          source={{ uri: url }}
          style={[
            shape === "square" ? styles.square : styles.wide,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
          contentFit="cover"
          transition={120}
          accessibilityLabel={`Current ${label.toLowerCase()}`}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View style={styles.actions}>
        <Button
          testID={`${testID}-choose`}
          variant="secondary"
          size="sm"
          icon={ImageUp}
          label={upload.busy ? "Uploading…" : url ? "Choose another photo" : "Choose a photo"}
          accessibilityLabel={`Choose a ${label.toLowerCase()} from your photos`}
          loading={upload.busy}
          onPress={() => void choose()}
        />
        {url ? (
          <Button
            testID={`${testID}-remove`}
            variant="ghost"
            size="sm"
            icon={X}
            label="Remove"
            accessibilityLabel={`Remove the ${label.toLowerCase()}`}
            onPress={() => {
              upload.clearError();
              onChange("");
            }}
          />
        ) : null}
      </View>
      {upload.error ? (
        <Banner tone="danger" testID={`${testID}-error`}>
          {upload.error}
        </Banner>
      ) : null}
      <TextField
        ref={ref}
        testID={`${testID}-url`}
        label={`${label} image address`}
        value={url}
        onChangeText={onChange}
        onBlur={onBlur}
        placeholder={shape === "square" ? "https://…/logo.png" : "https://…/cover.jpg"}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="URL"
        hint={help}
        error={fieldState.error?.message}
      />
    </View>
  );
}

const LOGO = space[16];

const styles = StyleSheet.create({
  root: { gap: space[2] },
  square: { width: LOGO, height: LOGO, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  wide: { width: "100%", aspectRatio: 3, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
