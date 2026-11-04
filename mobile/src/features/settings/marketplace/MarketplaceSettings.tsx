import { router, type Href } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { CircleAlert, ExternalLink, Loader, MapPin, MapPinOff, Search } from "lucide-react-native";
import type { MarketplaceSettings as Settings } from "@shared/api/types";
import { isApiError } from "@shared/api/client";
import { useMarketplaceSettings, useUpdateMarketplaceSettings } from "@shared/api/hooks/use-marketplace";
import { useBusinessContext } from "@shared/business/business-context";
import { useRefetchOnFocus } from "~/api/use-refresh";
import { openWebsite } from "~/lib/links";
import { Banner, Button, ErrorState, Section, Select, Skeleton, Switch } from "~/ui";
import { useSaveFeedback } from "~/ui/form";
import { space } from "~/ui/tokens";
import { SettingsPage } from "../SettingsPage";
import { StatusLine } from "../StatusLine";

/**
 * Settings › Marketplace (the website's MarketplaceSettings): list the business on bookanything's marketplace, its
 * category, and whether its address puts it on the map.
 */
export function MarketplaceSettings() {
  const { business } = useBusinessContext();
  const settings = useMarketplaceSettings(business.id);
  useRefetchOnFocus(settings.refetch);
  return (
    <SettingsPage segment="marketplace">
      {settings.isError && !settings.data ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : settings.data ? (
        <MarketplaceForm settings={settings.data} />
      ) : (
        <View
          style={styles.gap}
          accessible
          accessibilityLabel="Loading marketplace settings"
          testID="marketplace-loading"
        >
          <Skeleton height={208} radius="2xl" />
          <Skeleton height={112} radius="2xl" />
        </View>
      )}
    </SettingsPage>
  );
}

function MarketplaceForm({ settings: s }: { settings: Settings }) {
  const { business } = useBusinessContext();
  const update = useUpdateMarketplaceSettings(business.id);
  const feedback = useSaveFeedback();
  // Unlisted businesses have no stored category: the choice is kept here and sent when listing.
  const [category, setCategory] = useState(s.category);
  const [planLimit, setPlanLimit] = useState(false);
  const eligible = s.eligible && !planLimit;

  const save = async (listed: boolean, nextCategory = category) => {
    try {
      await update.mutateAsync({ listed, category: nextCategory });
      feedback.saved(
        listed
          ? s.listed
            ? "Category saved"
            : `${business.name} is on the marketplace`
          : "Removed from the marketplace",
      );
    } catch (err) {
      if (isApiError(err) && err.code === "PLAN_LIMIT_REACHED") setPlanLimit(true);
      else feedback.failed(err);
    }
  };

  const onCategory = (key: string) => {
    setCategory(key);
    if (s.listed) void save(true, key);
  };

  return (
    <View style={styles.sections}>
      {eligible ? null : (
        // App Store 3.1.1 / Google Play payments policy: the website's "See plans" card sells an upgrade; the app
        // only says the listing isn't in the plan, with no price, button or pointer to buy elsewhere.
        <Banner tone="info" title="Not included in your plan" testID="marketplace-plan">
          Marketplace listing isn&apos;t part of this business&apos;s current plan.
        </Banner>
      )}
      <Section
        title="Marketplace listing"
        description="People searching bookanything.ie/explore by service, place and time can find you and book straight away."
      >
        <Switch
          testID="marketplace-listed"
          label="List on the bookanything marketplace"
          description={
            eligible
              ? "Commission-free: bookings from the marketplace cost you nothing extra."
              : "Not included in your current plan."
          }
          value={s.listed}
          disabled={!eligible || update.isPending}
          onValueChange={(on) => void save(on)}
        />
        <Select
          testID="marketplace-category"
          label="Category"
          placeholder="Choose a category"
          value={category || null}
          options={s.categories.map((c) => ({ value: c.key, label: c.label }))}
          onChange={onCategory}
        />
        <Button
          testID="marketplace-explore"
          variant="ghost"
          size="sm"
          icon={s.listed ? Search : ExternalLink}
          label={s.listed ? "Find yourself on the marketplace" : "Browse the marketplace"}
          accessibilityHint="Opens the marketplace in a browser"
          onPress={() =>
            void openWebsite(s.listed ? `/explore?q=${encodeURIComponent(business.name)}` : "/explore")
          }
        />
      </Section>
      <Section
        title="Location"
        description="Your address puts you on the map for “near me” and city searches."
      >
        <LocationStatus settings={s} slug={business.slug} />
      </Section>
    </View>
  );
}

const PRECISION: Record<string, string> = {
  address: "to your street address",
  postcode: "to your Eircode / postcode area",
  city: "to your town or city",
};

function LocationStatus({ settings: s, slug }: { settings: Settings; slug: string }) {
  const general = (
    <Button
      testID="marketplace-open-general"
      variant="secondary"
      size="sm"
      icon={MapPin}
      label="Open General settings"
      onPress={() => router.push(`/dashboard/${slug}/settings/general` as Href)}
    />
  );
  switch (s.locationStatus) {
    case "located":
      return (
        <StatusLine
          testID="marketplace-location"
          tone="success"
          icon={MapPin}
          title="You're on the map"
          text={`We found your address and placed you ${PRECISION[s.location?.precision ?? ""] ?? "on the map"}.`}
        />
      );
    case "pending":
      return (
        <StatusLine
          testID="marketplace-location"
          tone="info"
          icon={Loader}
          title="We're locating your address"
          text="This usually takes a minute or two. You can list now in the meantime."
        />
      );
    case "not_found":
      return (
        <>
          <StatusLine
            testID="marketplace-location"
            tone="warning"
            icon={CircleAlert}
            title="We couldn't find your address"
            text="Check it in General settings — a street and town (or Eircode) works best."
          />
          {general}
        </>
      );
    case "missing_address":
      return (
        <>
          <StatusLine
            testID="marketplace-location"
            tone="warning"
            icon={MapPinOff}
            title="Add your address"
            text="Without one you won't show up in location searches. Add it in General settings."
          />
          {general}
        </>
      );
  }
}

const styles = StyleSheet.create({
  gap: { gap: space[4] },
  sections: { gap: space[6] },
});
