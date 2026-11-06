"use client";

import { useMemo, useState } from "react";
import { Clock3, Hourglass, Plus, Sparkles } from "lucide-react";
import type { Offer } from "@/lib/api/types";
import { useOffers, useServices } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { addDaysToPlainDate, addMonths, todayInTz, type PlainDate } from "@/lib/format";
import type { OfferFormValues } from "@/lib/offers/offer-form";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState, NoAccess } from "@/components/common/feedback";
import { PageContainer } from "@/components/ui/page-container";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { useEditorDialog } from "@/components/ui/form-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { OfferCard } from "./offer-card";
import { OfferEditor } from "./offer-editor";

/** Common first offers: each opens the editor filled in, for the owner to name, change and create. */
function starterOffers(today: PlainDate) {
  const monthEnd = addDaysToPlainDate(`${addMonths(today.slice(0, 7), 1)}-01`, -1);
  return [
    {
      title: "Off-peak",
      text: "e.g. 20% off Tuesday and Wednesday afternoons.",
      icon: <Clock3 />,
      values: {
        name: "Off-peak afternoons",
        discount: { type: "percent", percent: 20 },
        schedule: {
          daysOfWeek: [2, 3],
          timeWindows: [{ start: "13:00", end: "17:00" }],
          lastMinuteHours: 3,
        },
      },
    },
    {
      title: "Last-minute",
      text: "e.g. €10 off times starting within 3 hours.",
      icon: <Hourglass />,
      values: {
        name: "Last-minute",
        discount: { type: "fixed", amountCents: 1000 },
        lastMinute: true,
        schedule: { daysOfWeek: [], timeWindows: [], lastMinuteHours: 3 },
      },
    },
    {
      title: "Launch",
      text: "e.g. 15% off everything until the end of the month.",
      icon: <Sparkles />,
      values: { name: "Launch offer", discount: { type: "percent", percent: 15 }, validUntil: monthEnd },
    },
  ] satisfies { title: string; text: string; icon: React.ReactNode; values: Partial<OfferFormValues> }[];
}

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
  const [starter, setStarter] = useState<Partial<OfferFormValues> | undefined>();
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
    <Button
      variant="primary"
      onClick={() => {
        setStarter(undefined);
        open(null);
      }}
      disabled={services.isPending}
    >
      <Plus /> New offer
    </Button>
  );

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Offers"
        description="Deals that fill quiet times. They're applied automatically when people book online, never more than one per booking."
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
        <div className="flex flex-col gap-5 pt-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight">No offers yet</h2>
            <p className="text-sm text-muted-foreground">
              Turn empty slots into {v("bookings")}. Start from one of these, or from blank.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {starterOffers(today).map((s) => (
              <li key={s.title}>
                <button
                  type="button"
                  disabled={services.isPending}
                  onClick={() => {
                    setStarter(s.values);
                    open(null);
                  }}
                  className="focus-ring flex h-full w-full flex-col gap-1 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong hover:bg-accent/40"
                >
                  <span className="flex items-center gap-2 text-sm font-medium [&_svg]:size-4 [&_svg]:text-subtle-foreground">
                    {s.icon} {s.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{s.text}</span>
                </button>
              </li>
            ))}
          </ul>
          <div>{newButton}</div>
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
          starter={editing.item ? undefined : starter}
          services={editorServices}
          {...editor.dialogProps}
          previewDelay={previewDelay}
        />
      )}
    </PageContainer>
  );
}
