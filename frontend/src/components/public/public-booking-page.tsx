"use client";

import { Suspense } from "react";
import { MapPin } from "lucide-react";
import { usePublicBusiness, usePublicServices } from "@/lib/api/hooks";
import type { PublicBusiness, PublicOffer, PublicService } from "@/lib/api/types";
import { shortAddress } from "@/lib/booking/booking";
import { ErrorState } from "@/components/common/feedback";
import { PublicBookingShell } from "@/components/shells/public-booking-shell";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { BookingFlow } from "@/components/booking/booking-flow";
import { PortalDeals } from "@/components/offers/portal-deals";
import { PublicAccountLink, PublicBusinessError, useRefreshWhenSignedIn } from "./public-common";

export function PublicBookingPage({
  slug,
  initialBusiness,
  initialServices = null,
  initialOffers = null,
}: {
  slug: string;
  /** From the server render (metadata fetch); null when the server couldn't load it. */
  initialBusiness: PublicBusiness | null;
  /** From the server render too, so the first step is in the HTML rather than fetched after hydration. */
  initialServices?: PublicService[] | null;
  /** The deals shown above the flow (when there's no site), server-rendered so they don't push the page down. */
  initialOffers?: PublicOffer[] | null;
}) {
  const business = usePublicBusiness(slug, {
    initialData: initialBusiness ?? undefined,
    staleTime: 60_000,
  });
  const services = usePublicServices(slug, { initialData: initialServices ?? undefined, staleTime: 60_000 });
  useRefreshWhenSignedIn(business.refetch, services.refetch);
  const headerAction = <PublicAccountLink returnPath={`/${slug}/book`} />;

  if (business.isError && !business.data) {
    return (
      <PublicBusinessError
        slug={slug}
        error={business.error}
        onRetry={() => business.refetch()}
        headerAction={headerAction}
      />
    );
  }

  if (!business.data) {
    return (
      <PublicBookingShell business={null} loading headerAction={headerAction} width="wide">
        <FlowSkeleton />
      </PublicBookingShell>
    );
  }

  const b = business.data;
  return (
    <PublicBookingShell business={b} headerAction={headerAction} width="wide" className="pt-6 sm:pt-10">
      {services.isError ? (
        <ErrorState
          className="py-24"
          error={services.error}
          onRetry={() => services.refetch()}
          title="We couldn't load the services"
          headingLevel={1}
        />
      ) : !services.data ? (
        <>
          <BusinessIntro business={b} />
          <FlowSkeleton withIntro={false} />
        </>
      ) : (
        <Suspense fallback={<FlowSkeleton withIntro={false} />}>
          <BookingFlow
            business={b}
            services={services.data}
            intro={
              <BusinessIntro business={b}>
                {/* A site shows its deals itself; the portal is the only page without one. */}
                {!b.site && (
                  <PortalDeals
                    business={b}
                    services={services.data}
                    initialOffers={initialOffers}
                    className="mt-4"
                  />
                )}
              </BusinessIntro>
            }
          />
        </Suspense>
      )}
    </PublicBookingShell>
  );
}

function BusinessIntro({ business: b, children }: { business: PublicBusiness; children?: React.ReactNode }) {
  const place = shortAddress(b.address);
  return (
    <div className="mb-8 flex flex-col gap-2 sm:mb-10">
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{b.name}</h1>
      {b.description && <p className="max-w-2xl text-pretty text-muted-foreground">{b.description}</p>}
      {place && (
        <p className="flex items-center gap-1.5 text-sm text-subtle-foreground">
          <MapPin className="size-3.5" aria-hidden /> {place}
        </p>
      )}
      {children}
    </div>
  );
}

function FlowSkeleton({ withIntro = true }: { withIntro?: boolean }) {
  return (
    <div className="@container flex flex-col gap-8" role="status" aria-busy aria-label="Loading">
      {withIntro && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-2/3 max-w-sm" />
          <SkeletonText lines={2} className="max-w-xl" />
        </div>
      )}
      <div className="grid gap-8 @2xl:grid-cols-[minmax(0,1fr)_16rem] @2xl:gap-6 @4xl:grid-cols-[minmax(0,1fr)_21rem] @4xl:gap-12">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-1 w-full rounded-full" />
          <Skeleton className="h-7 w-48" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="hidden h-64 rounded-2xl @2xl:block" />
      </div>
    </div>
  );
}
