"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth/context";
import { usePublicBusiness, usePublicServices, useSiteState } from "@/lib/api/hooks";
import type { PublicBusiness, PublicOffer, PublicService, SitePlan } from "@/lib/api/types";
import { ErrorState } from "@/components/common/feedback";
import { SiteDeals } from "@/components/offers/deals-strip";
import { PublicBookingShell } from "@/components/shells/public-booking-shell";
import { SiteRenderer } from "@/components/site/site-renderer";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { PublicAccountLink, PublicBusinessError, useRefreshWhenSignedIn } from "./public-common";

/**
 * A backend without sites (older API) still gets a working page: the booking flow. It is loaded only then,
 * so the site's bundle doesn't carry the whole booking flow.
 */
const PublicBookingPage = dynamic(() => import("./public-booking-page").then((m) => m.PublicBookingPage), {
  loading: () => <SiteSkeleton />,
});

/**
 * `/[slug]`: the business's site. Server-rendered from `initialBusiness`/`initialServices`, and
 * refreshed on mount for signed-in visitors so an owner's just-published site shows immediately. Owners
 * can view their draft with `?site=draft`.
 */
export function PublicSitePage({
  slug,
  initialBusiness,
  initialServices,
  initialOffers = null,
  showDraft = false,
}: {
  slug: string;
  initialBusiness: PublicBusiness | null;
  initialServices: PublicService[] | null;
  /** The deals under the hero, server-rendered so they don't push the page down after it appears. */
  initialOffers?: PublicOffer[] | null;
  showDraft?: boolean;
}) {
  // Fresh from the server render, like the booking page: no refetch right after hydration.
  const business = usePublicBusiness(slug, { initialData: initialBusiness ?? undefined, staleTime: 60_000 });
  const services = usePublicServices(slug, { initialData: initialServices ?? undefined, staleTime: 60_000 });
  useRefreshWhenSignedIn(business.refetch, services.refetch);
  const draftPlan = useDraftPlan(business.data?.id ?? "", showDraft);
  const returnPath = `/${slug}`;

  if (business.isError && !business.data) {
    return (
      <PublicBusinessError
        slug={slug}
        error={business.error}
        onRetry={() => business.refetch()}
        headerAction={<PublicAccountLink returnPath={returnPath} />}
      />
    );
  }
  if (!business.data) return <SiteSkeleton />;

  const b = business.data;
  // A backend without sites (older API) still gets a working page: the booking flow.
  if (!b.site) return <PublicBookingPage slug={slug} initialBusiness={b} />;
  if (!services.data) {
    if (!services.isError) return <SiteSkeleton />;
    return (
      <PublicBookingShell business={b} headerAction={<PublicAccountLink returnPath={returnPath} />}>
        <ErrorState
          className="py-24"
          error={services.error}
          onRetry={() => services.refetch()}
          title="We couldn't load this page"
          headingLevel={1}
        />
      </PublicBookingShell>
    );
  }

  return (
    <SiteRenderer
      plan={draftPlan ?? b.site.plan}
      business={b}
      services={services.data}
      context={b.site.context}
      headerAction={<PublicAccountLink returnPath={returnPath} />}
      afterHero={<SiteDeals slug={slug} initialOffers={initialOffers} />}
      className="min-h-dvh"
    />
  );
}

/** The owner's draft plan when `?site=draft` and the visitor may edit the site. */
function useDraftPlan(businessId: string, enabled: boolean): SitePlan | null {
  const { isSignedIn } = useAuth();
  const state = useSiteState(businessId, { enabled: enabled && isSignedIn, retry: false });
  return enabled ? (state.data?.draft ?? null) : null;
}

function SiteSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col" role="status" aria-busy aria-label="Loading">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-5">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="ml-auto h-9 w-28 rounded-lg" />
      </div>
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <Skeleton className="h-14 w-4/5" />
          <SkeletonText lines={3} />
          <Skeleton className="h-12 w-40 rounded-lg" />
        </div>
        <Skeleton className="aspect-[4/3] rounded-2xl" />
      </div>
    </div>
  );
}
