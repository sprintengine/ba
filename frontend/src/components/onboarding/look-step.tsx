"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useBusiness, useUpdateBusiness } from "@/lib/api/hooks";
import type { Business, SiteThemeKey } from "@/lib/api/types";
import { ErrorState } from "@/components/common/feedback";
import { PortalStylePicker } from "@/components/booking/portal-style-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { CreatedBusiness } from "./draft-storage";
import { SiteStep } from "./site-step";
import { PUBLIC_HOST } from "./slug-field";

/**
 * "Look" (after the business is created): the booking page's style, or, where business websites are on
 * (`Business.sitesEnabled`), the site step. Skippable either way.
 */
export function LookStep({ created, onDone }: { created: CreatedBusiness; onDone: () => void }) {
  const business = useBusiness(created.id);
  if (business.isError) return <ErrorState error={business.error} onRetry={() => business.refetch()} />;
  if (!business.data) return <LookStepSkeleton />;
  if (business.data.sitesEnabled) return <SiteStep created={created} onDone={onDone} />;
  return <PortalLookStep business={business.data} onDone={onDone} />;
}

function PortalLookStep({ business, onDone }: { business: Business; onDone: () => void }) {
  const update = useUpdateBusiness(business.id);
  const [style, setStyle] = useState<SiteThemeKey>(business.branding.portalStyle ?? "minimal");

  const save = async () => {
    try {
      await update.mutateAsync({ branding: { ...business.branding, portalStyle: style } });
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl animate-rise flex-col gap-8">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">Your booking page</h1>
        <p className="mx-auto max-w-xl text-pretty text-muted-foreground">
          Customers book at{" "}
          <span className="font-mono text-foreground">
            {PUBLIC_HOST}/{business.slug}
          </span>
          . Pick a style for it. You can change it, with your colour and logo, in Branding.
        </p>
      </header>
      <PortalStylePicker
        value={style}
        onChange={setStyle}
        primaryColor={business.branding.primaryColor}
        businessName={business.name}
        disabled={update.isPending}
      />
      <div className="flex flex-col-reverse items-center justify-center gap-3 sm:flex-row">
        <Button variant="ghost" disabled={update.isPending} onClick={onDone}>
          Skip for now
        </Button>
        <Button variant="primary" size="lg" loading={update.isPending} onClick={() => void save()}>
          Use this style <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function LookStepSkeleton() {
  return (
    <div
      role="status"
      aria-busy
      aria-label="Loading"
      className="mx-auto flex w-full max-w-3xl flex-col gap-8"
    >
      <Skeleton className="mx-auto h-9 w-64" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
