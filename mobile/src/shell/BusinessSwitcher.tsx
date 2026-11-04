import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check, ChevronsUpDown, Plus, UserRound } from "lucide-react-native";
import { BusinessAvatar, Icon, ListRow, Sheet, Text, useTheme } from "~/ui";
import { MIN_TOUCH, radius, space } from "~/ui/tokens";
import { rememberVisit, useSignedInMe } from "./session";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", staff: "Staff" } as const;

/**
 * Switches between the businesses someone belongs to and their own bookings (the website's business switcher).
 * `current` is the open business's slug, or null on the customer side. Renders nothing for people without
 * memberships.
 */
export function BusinessSwitcher({
  current,
  compact = false,
}: {
  current: string | null;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const me = useSignedInMe();
  const [open, setOpen] = useState(false);
  const memberships = me.data?.memberships ?? [];
  if (memberships.length === 0) return null;
  const active = memberships.find((m) => m.slug === current);
  const label = active?.name ?? "My bookings";

  const choose = (slug: string | null) => {
    setOpen(false);
    if (slug) {
      rememberVisit("business", slug);
      router.navigate(`/dashboard/${slug}`);
    } else {
      rememberVisit("customer");
      router.navigate("/my/bookings");
    }
  };

  return (
    <>
      <Pressable
        testID="business-switcher"
        accessibilityRole="button"
        accessibilityLabel={`${label}. Switch business`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          compact ? styles.compact : styles.full,
          !compact && {
            borderColor: colors.border,
            backgroundColor: pressed ? colors.muted : colors.surface,
          },
        ]}
      >
        {active ? (
          <BusinessAvatar
            name={active.name}
            logoUrl={active.branding.logoUrl}
            color={active.branding.primaryColor}
            size={28}
          />
        ) : (
          <Icon icon={UserRound} color="mutedForeground" />
        )}
        {compact ? null : (
          <>
            <Text weight="semibold" numberOfLines={1} style={styles.name}>
              {label}
            </Text>
            <Icon icon={ChevronsUpDown} size={16} color="subtleForeground" />
          </>
        )}
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Switch to" testID="business-switcher-sheet">
        <Text variant="caption" tone="subtle">
          YOUR BUSINESSES
        </Text>
        <View>
          {memberships.map((m) => (
            <ListRow
              key={m.businessId}
              testID={`switch-to-${m.slug}`}
              leading={
                <BusinessAvatar name={m.name} logoUrl={m.branding.logoUrl} color={m.branding.primaryColor} />
              }
              title={m.name}
              subtitle={ROLE_LABEL[m.role]}
              selected={m.slug === current}
              chevron={false}
              trailing={m.slug === current ? <Icon icon={Check} color="brand" /> : undefined}
              onPress={() => choose(m.slug)}
            />
          ))}
          <ListRow
            testID="switch-new-business"
            icon={Plus}
            title="Set up a new business"
            chevron={false}
            onPress={() => {
              setOpen(false);
              router.push("/onboarding");
            }}
          />
        </View>
        <Text variant="caption" tone="subtle">
          AS A CUSTOMER
        </Text>
        <ListRow
          testID="switch-to-customer"
          icon={UserRound}
          title="My bookings"
          subtitle="What you've booked, anywhere on bookanything"
          selected={current === null}
          chevron={false}
          trailing={current === null ? <Icon icon={Check} color="brand" /> : undefined}
          onPress={() => choose(null)}
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  full: {
    minHeight: MIN_TOUCH + space[1],
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[2],
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  compact: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
  name: { flex: 1 },
});
