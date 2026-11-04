import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Linking, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarPlus, Globe, Info, Mail, MapPin, Phone, Share2 } from "lucide-react-native";
import { usePublicBusiness, usePublicServices } from "@shared/api/hooks/use-public";
import type { PublicBusiness, PublicService } from "@shared/api/types";
import { formatAddress } from "@shared/booking/booking";
import { groupByCategory } from "@shared/booking/services";
import { formatDuration, formatMoney, formatPrice } from "@shared/format";
import { callNumber, openMaps, sendEmail, websiteUrl } from "~/lib/links";
import { logError } from "~/lib/logger";
import {
  BrandScope,
  BusinessAvatar,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  Screen,
  ScreenScroll,
  Skeleton,
  Text,
  useLayout,
  useTheme,
} from "~/ui";
import { layout, radius, space } from "~/ui/tokens";
import { usePullToRefresh, useRefetchOnFocus } from "~/api/use-refresh";
import { BusinessFailed } from "./BookScreen";
import { BusinessDeals } from "./BusinessDeals";
import { policyLines, websiteHost } from "./business-page";
import { ServiceCard } from "./ServiceCard";

/**
 * `/[slug]`: a business's page in the app (the website shows its site, or goes straight to booking): who they are,
 * their services with prices, lengths, options and extras, deals, policies and how to reach them, and Book.
 */
export function BusinessScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const business = usePublicBusiness(slug, { staleTime: 60_000 });
  const services = usePublicServices(slug, { staleTime: 60_000 });
  const refetch = async () => {
    await Promise.all([business.refetch(), services.refetch()]);
  };
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  useRefetchOnFocus(refetch);

  if (business.isError && !business.data) {
    return <BusinessFailed slug={slug} error={business.error} onRetry={() => void business.refetch()} />;
  }
  if (!business.data) return <PageSkeleton />;
  const b = business.data;
  return (
    <BrandScope color={b.branding.primaryColor}>
      <Screen testID="business-page">
        <Stack.Screen
          options={{
            title: b.name,
            headerRight: () => (
              <IconButton
                icon={Share2}
                accessibilityLabel={`Share ${b.name}`}
                onPress={() =>
                  void Share.share({
                    message: websiteUrl(`/${b.slug}`),
                    url: websiteUrl(`/${b.slug}`),
                  }).catch((e: unknown) => logError(e, { feature: "share" }))
                }
              />
            ),
          }}
        />
        <ScreenScroll refreshing={refreshing} onRefresh={() => void onRefresh()}>
          <Header business={b} />
          <BusinessDeals business={b} services={services.data ?? []} />
          {services.isError && !services.data ? (
            <ErrorState
              error={services.error}
              title="We couldn't load the services"
              onRetry={() => void services.refetch()}
            />
          ) : services.data ? (
            <Services business={b} services={services.data} />
          ) : (
            <View
              style={styles.list}
              accessible
              accessibilityLabel="Loading services"
              accessibilityRole="progressbar"
            >
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={96} radius="xl" />
              ))}
            </View>
          )}
          {services.data ? <Policies business={b} services={services.data} /> : null}
          <Contact business={b} />
          <View style={styles.bottomSpace} />
        </ScreenScroll>
        <BookBar business={b} />
      </Screen>
    </BrandScope>
  );
}

function Header({ business: b }: { business: PublicBusiness }) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      {b.branding.coverImageUrl ? (
        <Image
          source={{ uri: b.branding.coverImageUrl }}
          style={[styles.cover, { backgroundColor: colors.muted }]}
          contentFit="cover"
          transition={150}
          accessible={false}
        />
      ) : null}
      <View style={styles.identity}>
        <BusinessAvatar
          name={b.name}
          logoUrl={b.branding.logoUrl}
          color={b.branding.primaryColor}
          size={56}
        />
        <View style={styles.flex}>
          <Text variant="title2">{b.name}</Text>
          {b.address.city ? (
            <Text variant="callout" tone="muted">
              {b.address.city}
            </Text>
          ) : null}
        </View>
      </View>
      {b.description ? (
        <Text variant="body" tone="muted">
          {b.description}
        </Text>
      ) : null}
    </View>
  );
}

function Services({ business: b, services }: { business: PublicBusiness; services: PublicService[] }) {
  if (services.length === 0) {
    return (
      <EmptyState
        icon={Info}
        title="Nothing to book online just yet"
        description="This business hasn't published any services for online booking. Please get in touch with them directly."
      />
    );
  }
  const book = (s: PublicService) =>
    router.push({ pathname: "/[slug]/book", params: { slug: b.slug, service: s.id } });
  return (
    <View style={styles.sections} testID="business-services">
      <Text variant="title3">Services</Text>
      {groupByCategory(services).map((g) => (
        <View key={g.category ?? "all"} style={styles.list}>
          {g.category ? (
            <Text variant="caption" tone="subtle" accessibilityRole="header">
              {g.category.toUpperCase()}
            </Text>
          ) : null}
          {g.services.map((s) => (
            <View key={s.id} style={styles.service}>
              <ServiceCard service={s} currency={b.currency} locale={b.locale} onSelect={book} />
              <Extras service={s} business={b} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** A service's options and add-ons with their prices and lengths, under its card. */
function Extras({ service: s, business: b }: { service: PublicService; business: PublicBusiness }) {
  if (s.options.length < 2 && s.addons.length === 0) return null;
  const options = s.options.length > 1 ? [...s.options].sort((a, c) => a.sortOrder - c.sortOrder) : [];
  const addons = [...s.addons].sort((a, c) => a.sortOrder - c.sortOrder);
  return (
    <View style={styles.extras} testID={`service-extras-${s.id}`}>
      {options.map((o) => (
        <View key={o.id} style={styles.extra} accessible>
          <Text variant="callout" style={styles.flex}>
            {o.name}
            <Text variant="callout" tone="muted">
              {" "}
              · {formatDuration(o.durationMinutes)}
            </Text>
          </Text>
          <Text variant="callout" numeric>
            {formatPrice(o.priceCents, b.currency, { locale: b.locale })}
          </Text>
        </View>
      ))}
      {addons.map((a) => (
        <View key={a.id} style={styles.extra} accessible>
          <Text variant="callout" tone="muted" style={styles.flex}>
            + {a.name}
            {a.extraMinutes > 0 ? ` · +${formatDuration(a.extraMinutes)}` : ""}
          </Text>
          <Text variant="callout" tone="muted" numeric>
            {a.priceCents > 0
              ? formatMoney(a.priceCents, b.currency, { locale: b.locale, signed: true })
              : "Free"}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Policies({ business, services }: { business: PublicBusiness; services: PublicService[] }) {
  return (
    <Card testID="business-policies">
      <Text variant="headline">Good to know</Text>
      <View style={styles.policies}>
        {policyLines(business, services).map((line) => (
          <Text key={line} variant="callout" tone="muted">
            {line}
          </Text>
        ))}
      </View>
    </Card>
  );
}

function Contact({ business: b }: { business: PublicBusiness }) {
  const address = formatAddress(b.address);
  const site = websiteHost(b.websiteUrl);
  const rows = [
    address ? (
      <ListRow
        key="address"
        icon={MapPin}
        title={address}
        subtitle="Directions"
        accessibilityHint="Opens maps"
        onPress={() => void openMaps(`${b.name}, ${address}`)}
      />
    ) : null,
    b.contactPhone ? (
      <ListRow
        key="phone"
        icon={Phone}
        title={b.contactPhone}
        subtitle={`Call ${b.name}`}
        onPress={() => void callNumber(b.contactPhone ?? "")}
      />
    ) : null,
    b.contactEmail ? (
      <ListRow
        key="email"
        icon={Mail}
        title={b.contactEmail}
        subtitle="Email"
        onPress={() => void sendEmail(b.contactEmail ?? "")}
      />
    ) : null,
    site && b.websiteUrl ? (
      <ListRow
        key="web"
        icon={Globe}
        title={site}
        subtitle="Website"
        onPress={() =>
          void Linking.openURL(b.websiteUrl ?? "").catch((e: unknown) => logError(e, { link: "web" }))
        }
      />
    ) : null,
  ].filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <View style={styles.list} testID="business-contact">
      <Text variant="title3">Contact</Text>
      <Card padding={0}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <Divider inset={space[12]} /> : null}
            {row}
          </View>
        ))}
      </Card>
    </View>
  );
}

/** Book, pinned to the bottom of the page. */
function BookBar({ business: b }: { business: PublicBusiness }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide } = useLayout();
  return (
    <View
      style={[
        styles.bookBar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, space[3]),
        },
      ]}
    >
      <View style={[styles.bookInner, isWide ? styles.bookWide : null]}>
        <Button
          testID="business-book"
          variant="brand"
          size="lg"
          fullWidth
          icon={CalendarPlus}
          label={`Book with ${b.name}`}
          onPress={() => router.push({ pathname: "/[slug]/book", params: { slug: b.slug } })}
        />
      </View>
    </View>
  );
}

function PageSkeleton() {
  return (
    <Screen>
      <Stack.Screen options={{ title: "" }} />
      <ScreenScroll>
        <View
          style={styles.list}
          accessible
          accessibilityLabel="Loading business"
          accessibilityRole="progressbar"
        >
          <Skeleton height={140} radius="2xl" />
          <Skeleton height={28} width="60%" />
          <Skeleton height={16} width="85%" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={96} radius="xl" />
          ))}
        </View>
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: space[3] },
  cover: { width: "100%", aspectRatio: 2.4, borderRadius: radius["2xl"] },
  identity: { flexDirection: "row", alignItems: "center", gap: space[3] },
  sections: { gap: space[5] },
  list: { gap: space[2.5] },
  service: { gap: space[1.5] },
  extras: { gap: space[1], paddingHorizontal: space[4] },
  extra: { flexDirection: "row", gap: space[3], alignItems: "baseline" },
  policies: { gap: space[1.5], marginTop: space[2] },
  bottomSpace: { height: space[16] },
  bookBar: { paddingHorizontal: space[4], paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth },
  bookInner: { width: "100%", alignSelf: "center" },
  bookWide: { maxWidth: layout.formWidth },
});
