"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import type { MarketplaceSettings as Settings } from "@/lib/api/types";
import { errorMessage, isApiError } from "@/lib/api/client";
import { useMarketplaceSettings, useUpdateMarketplaceSettings } from "@/lib/api/hooks";
import { useBusinessContext } from "@/lib/business/business-context";
import { ErrorState } from "@/components/common/feedback";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import {
  SettingFieldRow,
  SettingGroup,
  SettingLink,
  SettingRow,
  SettingsHeader,
  settingsStack,
} from "./settings-common";

/** Settings → Marketplace: list the business on bookanything.ie/explore (Pro and Business plans). */
export function MarketplaceSettings() {
  const { business } = useBusinessContext();
  const settings = useMarketplaceSettings(business.id);
  return (
    <>
      <SettingsHeader segment="marketplace" lede />
      {settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
      ) : settings.isPending ? (
        <div className={settingsStack} aria-busy aria-label="Loading marketplace settings">
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : (
        <MarketplaceForm settings={settings.data} />
      )}
    </>
  );
}

function MarketplaceForm({ settings: s }: { settings: Settings }) {
  const { business } = useBusinessContext();
  const update = useUpdateMarketplaceSettings(business.id);
  // Unlisted businesses have no stored category: the choice is kept here and sent when listing.
  const [category, setCategory] = useState(s.category);
  const [planLimit, setPlanLimit] = useState<string | null>(null);
  const eligible = s.eligible && !planLimit;

  const save = async (listed: boolean, nextCategory = category) => {
    try {
      await update.mutateAsync({ listed, category: nextCategory });
      toast.success(
        listed
          ? s.listed
            ? "Category saved"
            : `${business.name} is on the marketplace`
          : "Removed from the marketplace",
      );
    } catch (err) {
      if (isApiError(err) && err.code === "PLAN_LIMIT_REACHED") setPlanLimit(err.message);
      else toast.error(errorMessage(err));
    }
  };

  const onCategory = (key: string) => {
    setCategory(key);
    if (s.listed) void save(true, key);
  };

  return (
    <div className={settingsStack}>
      <SettingGroup
        title="Listing"
        description="People searching by service, place and time can find you and book straight away."
      >
        {!eligible && <UpgradeNote message={planLimit} />}
        <SettingFieldRow
          fit
          label="List on the bookanything marketplace"
          help={
            eligible ? "Commission-free: bookings from the marketplace cost you nothing extra." : undefined
          }
        >
          <div className="flex items-center gap-2.5">
            <Badge tone={s.listed ? "success" : "neutral"} dot>
              {s.listed ? "Listed" : "Not listed"}
            </Badge>
            <Switch
              checked={s.listed}
              disabled={!eligible || update.isPending}
              onCheckedChange={(on) => save(on)}
            />
          </div>
        </SettingFieldRow>
        <SettingFieldRow
          label="Category"
          help={
            eligible
              ? "The main thing people book with you. It decides where you appear in search."
              : "You can choose this once your plan includes the marketplace."
          }
        >
          <Select value={category} onValueChange={onCategory} disabled={!eligible || update.isPending}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {s.categories.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingFieldRow>
        <SettingLink
          external
          href={s.listed ? `/explore?q=${encodeURIComponent(business.name)}` : "/explore"}
          label={s.listed ? "Find yourself on the marketplace" : "Browse the marketplace"}
        />
      </SettingGroup>
      <SettingGroup
        title="Location"
        description="Your address puts you on the map for “near me” and city searches."
      >
        <LocationStatus settings={s} slug={business.slug} />
      </SettingGroup>
    </div>
  );
}

function UpgradeNote({ message }: { message: string | null }) {
  const { business } = useBusinessContext();
  return (
    <div role={message ? "alert" : undefined}>
      <SettingRow
        action
        label="Included in the Pro and Business plans"
        help={message ?? "We don't take a cut of the bookings it brings in."}
      >
        <Button asChild variant="secondary" size="sm">
          <Link href={dashboardHref(business.slug, "settings/billing")}>See plans</Link>
        </Button>
      </SettingRow>
    </div>
  );
}

const PRECISION: Record<string, string> = {
  address: "to your street address",
  postcode: "to your Eircode / postcode area",
  city: "to your town or city",
};

function LocationStatus({ settings: s, slug }: { settings: Settings; slug: string }) {
  const general = (
    <Button asChild variant="secondary" size="sm">
      <Link href={dashboardHref(slug, "settings/general")}>
        <MapPin /> Open General settings
      </Link>
    </Button>
  );
  switch (s.locationStatus) {
    case "located":
      return (
        <SettingRow
          action
          label="You're on the map"
          help={`We found your address and placed you ${PRECISION[s.location?.precision ?? ""] ?? "on the map"}.`}
        >
          <Badge tone="success" dot>
            Located
          </Badge>
        </SettingRow>
      );
    case "pending":
      return (
        <SettingRow
          action
          label="We're locating your address"
          help="This usually takes a minute or two. You can list now in the meantime."
        >
          <Badge tone="info" dot>
            Checking
          </Badge>
        </SettingRow>
      );
    case "not_found":
      return (
        <SettingRow
          action
          label="We couldn't find your address"
          help="Check it in General settings: a street and town (or Eircode) works best."
        >
          {general}
        </SettingRow>
      );
    case "missing_address":
      return (
        <SettingRow
          action
          label="Add your address"
          help="Without one you won't show up in location searches. Add it in General settings."
        >
          {general}
        </SettingRow>
      );
  }
}
