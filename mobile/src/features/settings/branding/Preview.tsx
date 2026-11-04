import { Image } from "expo-image";
import { useWatch, type Control } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import { useBusinessContext } from "@shared/business/business-context";
import type { BrandingValues } from "@shared/settings/branding-form";
import { HEX_COLOR } from "@shared/theme/color";
import { vocab } from "@shared/vocabulary";
import { BrandScope, BusinessAvatar, Icon, Text, useTheme } from "~/ui";
import { borderWidth, radius, space } from "~/ui/tokens";
import { isImageUrl } from "./ImageField";

const TIMES = ["09:00", "09:45", "10:30", "11:15"];

/**
 * The website's branding preview: a mini booking page header and a sample service, in the (unsaved) colour, logo,
 * cover and words. A picture to screen readers (one element named for what it shows); nothing in it is a control.
 */
export function BrandingPreview({ control }: { control: Control<BrandingValues> }) {
  const { business } = useBusinessContext();
  const v = useWatch({ control }) as BrandingValues;
  const color = HEX_COLOR.test(v.primaryColor) ? v.primaryColor : business.branding.primaryColor;
  return (
    <BrandScope color={color}>
      <PreviewBody
        name={business.name}
        color={color}
        logo={isImageUrl(v.logoUrl) ? v.logoUrl : null}
        cover={isImageUrl(v.coverImageUrl) ? v.coverImageUrl : null}
        booking={vocab(v, "booking")}
        bookings={vocab(v, "bookings")}
      />
    </BrandScope>
  );
}

function PreviewBody({
  name,
  color,
  logo,
  cover,
  booking,
  bookings,
}: {
  name: string;
  color: string;
  logo: string | null;
  cover: string | null;
  booking: string;
  bookings: string;
}) {
  const { colors } = useTheme();
  const article = /^[aeiou]/i.test(booking) ? "an" : "a";
  return (
    <View
      testID="branding-preview"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Booking page preview: ${name}, in your colour${logo ? ", with your logo" : ""}${cover ? " and cover image" : ""}.`}
      style={[styles.frame, { backgroundColor: colors.background, borderColor: colors.border }]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BusinessAvatar name={name} logoUrl={logo} color={color} size={32} />
        <Text weight="semibold" numberOfLines={1} style={styles.flex}>
          {name}
        </Text>
        <Text variant="caption" tone="muted">
          My {bookings}
        </Text>
      </View>
      {cover ? (
        <View style={styles.coverBox}>
          <Image
            source={{ uri: cover }}
            style={[styles.cover, { backgroundColor: colors.muted }]}
            contentFit="cover"
            transition={120}
            accessible={false}
          />
        </View>
      ) : null}
      <View style={styles.body}>
        <Text variant="headline">
          Book {article} {booking}
        </Text>
        <View
          style={[styles.service, { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder }]}
        >
          <Icon icon={CalendarDays} size={16} color="brand" />
          <Text variant="callout" weight="medium" style={styles.flex}>
            Initial consultation
          </Text>
          <Text variant="caption" tone="muted">
            45 min
          </Text>
        </View>
        <View style={styles.times}>
          {TIMES.map((t, i) => (
            <View
              key={t}
              style={[
                styles.time,
                i === 1
                  ? { backgroundColor: colors.brand, borderColor: colors.brand }
                  : { borderColor: colors.border },
              ]}
            >
              <Text variant="caption" numeric tone={i === 1 ? "brandForeground" : "default"}>
                {t}
              </Text>
            </View>
          ))}
        </View>
        <View style={[styles.button, { backgroundColor: colors.brand }]}>
          <Text variant="callout" weight="semibold" tone="brandForeground">
            Continue
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.xl, borderWidth: borderWidth.hairline, overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
  coverBox: { paddingHorizontal: space[4], paddingTop: space[4] },
  cover: { width: "100%", aspectRatio: 3, borderRadius: radius.lg },
  body: { gap: space[3], padding: space[4] },
  service: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2.5],
    borderRadius: radius.lg,
    borderWidth: borderWidth.hairline,
  },
  times: { flexDirection: "row", flexWrap: "wrap", gap: space[1.5] },
  time: {
    paddingHorizontal: space[2.5],
    paddingVertical: space[1],
    borderRadius: radius.sm,
    borderWidth: borderWidth.hairline,
  },
  button: {
    alignSelf: "flex-start",
    paddingHorizontal: space[3],
    paddingVertical: space[1.5],
    borderRadius: radius.button,
  },
});
