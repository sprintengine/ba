"use client";

import { useMemo } from "react";
import { BadgePercent, Clock3, Hourglass, Plus, Sparkles } from "lucide-react";
import type { Offer } from "@/lib/api/types";
import { useOffers, useServices } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { todayInTz } from "@/lib/format";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState, NoAccess } from "@/components/common/feedback";
import { PageContainer } from "@/components/ui/page-container";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { useEditorDialog } from "@/components/ui/form-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { OfferCard } from "./offer-card";
import { OfferEditor } from "./offer-editor";

/** /dashboard/[slug]/offers: deals that discount quiet times (owner/admin). */
export function OffersPage({ previewDelay }: { previewDelay?: number } = {}) {
  const { business } = useBusinessContext();
  const { manageOffers } = usePermissions();
  if (!manageOffers) {
    return (
      <NoAccess
        title="Offers are for admins"
        description="Ask an owner or admin of this business to set up deals."
        backHref={dashboardHref(business.slug)}
        backLabel="Back to Today"
      />
    );
  }
  return <OffersView previewDelay={previewDelay} />;
}

function OffersView({ previewDelay }: { previewDelay?: number }) {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const offers = useOffers(business.id);
  const services = useServices(business.id);
  // The editor's focus goes back to the control that opened it on close.
  const editor = useEditorDialog<Offer>();
  const open = editor.open;
  const editing = editor.current;
  const today = todayInTz(business.timezone);
  const list = useMemo(
    () =>
      [...(offers.data ?? [])].sort(
        (a, b) =>
          Number(a.status === "paused") - Number(b.status === "paused") || a.name.localeCompare(b.name),
      ),
    [offers.data],
  );
  const allServices = services.data ?? [];
  const editorServices = allServices.filter((s) => s.isActive || editing?.item?.serviceIds.includes(s.id));
  const newButton = (
    <Button variant="primary" onClick={() => open(null)} disabled={services.isPending}>
      <Plus /> New offer
    </Button>
  );

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Offers"
        description="Deals that fill quiet times. They're applied automatically when people book online — never more than one per booking."
        actions={
          list.length > 0 && (
            <ActionButton
              variant="primary"
              onClick={() => open(null)}
              disabled={services.isPending}
              icon={<Plus />}
              label="New offer"
              collapse={false}
            />
          )
        }
      />
      {offers.isError ? (
        <ErrorState error={offers.error} onRetry={() => offers.refetch()} />
      ) : offers.isPending ? (
        <div className="flex flex-col gap-2" role="status" aria-busy aria-label="Loading offers">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col gap-6">
          <EmptyState
            headingLevel={2}
            icon={<BadgePercent />}
            title="No offers yet"
            description={`Turn empty slots into ${v("bookings")}.`}
            action={newButton}
          />
          <ul className="grid gap-3 border-t border-border-subtle px-5 py-5 sm:grid-cols-3">
            <Idea icon={<Clock3 />} title="Off-peak" text="e.g. 20% off Tuesday and Wednesday afternoons." />
            <Idea
              icon={<Hourglass />}
              title="Last-minute"
              text="e.g. €10 off times starting within 3 hours."
            />
            <Idea
              icon={<Sparkles />}
              title="Launch"
              text="e.g. 15% off everything until the end of the month."
            />
          </ul>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle border-y border-border">
          {list.map((o) => (
            <OfferCard key={o.id} offer={o} services={allServices} today={today} onEdit={() => open(o)} />
          ))}
        </ul>
      )}
      {editing && (
        <OfferEditor
          key={editing.key}
          offer={editing.item}
          services={editorServices}
          {...editor.dialogProps}
          previewDelay={previewDelay}
        />
      )}
    </PageContainer>
  );
}

function Idea({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-foreground [&_svg]:size-4"
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{text}</span>
      </span>
    </li>
  );
}
