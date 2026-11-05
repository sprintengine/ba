"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleAlert, Loader, MapPin, MapPinOff, Search } from "lucide-react";
import type { MarketplaceSettings as Settings } from "@/lib/api/types";
import { errorMessage, isApiError } from "@/lib/api/client";
import { useMarketplaceSettings, useUpdateMarketplaceSettings } from "@/lib/api/hooks";
import { useBusinessContext } from "@/lib/business/business-context";
import { ErrorState } from "@/components/common/feedback";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { SettingsCard, SettingsHeader, StatusLine } from "./settings-common";

/** Settings → Marketplace: list the business on bookanything.ie/explore (Pro and Business plans). */
export function MarketplaceSettings() {
  const { business } = useBusinessContext();
  const settings = useMarketplaceSettings(business.id);
  return (
    <>
      <SettingsHeader segment="marketplace" />
      {settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
      ) : settings.isPending ? (
        <div className="flex flex-col gap-4" aria-busy aria-label="Loading marketplace settings">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
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
    <div className="flex flex-col gap-6">
      {!eligible && <UpgradeNote message={planLimit} />}
      <SettingsCard
        title="Marketplace listing"
        description="People searching bookanything.ie/explore by service, place and time can find you and book straight away."
      >
        <Field
          orientation="horizontal"
          label="List on the bookanything marketplace"
          help={
            eligible ? "Commission-free: bookings from the marketplace cost you nothing extra." : undefined
          }
        >
          <Switch
            checked={s.listed}
            disabled={!eligible || update.isPending}
            onCheckedChange={(on) => save(on)}
          />
        </Field>
        <Field
          label="Category"
          help={
            eligible
              ? "The main thing people book with you. It decides where you appear in search."
              : "You can choose this once your plan includes the marketplace."
          }
          className="sm:max-w-xs"
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
        </Field>
        <Button asChild variant="link" className="self-start px-0">
          <Link
            href={s.listed ? `/explore?q=${encodeURIComponent(business.name)}` : "/explore"}
            target="_blank"
          >
            <Search /> {s.listed ? "Find yourself on the marketplace" : "Browse the marketplace"}{" "}
            <ArrowUpRight />
          </Link>
        </Button>
      </SettingsCard>
      <SettingsCard
        title="Location"
        description="Your address puts you on the map for “near me” and city searches."
      >
        <LocationStatus settings={s} slug={business.slug} />
      </SettingsCard>
    </div>
  );
}

function UpgradeNote({ message }: { message: string | null }) {
  const { business } = useBusinessContext();
  return (
    <p role={message ? "alert" : undefined} className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Included in the Pro and Business plans.</span>{" "}
      {message ?? "We don't take a cut of the bookings it brings in."}{" "}
      <Link
        href={dashboardHref(business.slug, "settings/billing")}
        className="font-medium text-foreground underline underline-offset-2"
      >
        See plans
      </Link>
    </p>
  );
}

const PRECISION: Record<string, string> = {
  address: "to your street address",
  postcode: "to your Eircode / postcode area",
  city: "to your town or city",
};

function LocationStatus({ settings: s, slug }: { settings: Settings; slug: string }) {
  const general = (
    <Button asChild variant="secondary" size="sm" className="self-start">
      <Link href={dashboardHref(slug, "settings/general")}>
        <MapPin /> Open General settings
      </Link>
    </Button>
  );
  switch (s.locationStatus) {
    case "located":
      return (
        <StatusLine
          tone="success"
          icon={<MapPin />}
          title="You're on the map"
          text={`We found your address and placed you ${PRECISION[s.location?.precision ?? ""] ?? "on the map"}.`}
        />
      );
    case "pending":
      return (
        <StatusLine
          tone="info"
          icon={<Loader />}
          title="We're locating your address"
          text="This usually takes a minute or two. You can list now in the meantime."
        />
      );
    case "not_found":
      return (
        <>
          <StatusLine
            tone="warning"
            icon={<CircleAlert />}
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
            tone="warning"
            icon={<MapPinOff />}
            title="Add your address"
            text="Without one you won't show up in location searches. Add it in General settings."
          />
          {general}
        </>
      );
  }
}
