"use client";

import { useMemo } from "react";
import { Pencil, Plus, Sparkles } from "lucide-react";
import type { Service } from "@/lib/api/types";
import { useReplaceService, useServices } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { nextSortOrder } from "@/lib/dashboard/sort-order";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/common/feedback";
import { PageContainer } from "@/components/ui/page-container";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { useEditorDialog } from "@/components/ui/form-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { withToast } from "@/components/common/with-toast";
import { Tooltip } from "@/components/ui/tooltip";
import { useFmt } from "../common";
import { durationLabel, priceLabel } from "@/lib/booking/quote";
import { PAYMENT_MODE_SHORT, serviceWith } from "@/lib/services/service-form";
import { ServiceEditor } from "./service-editor/service-editor";

export function ServicesList() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const services = useServices(business.id);
  const editor = useEditorDialog<Service>();
  const all = useMemo(
    () =>
      [...(services.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [services.data],
  );
  const groups = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const s of all.filter((s) => s.isActive)) {
      const key = s.category?.trim() || "Other";
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    const inactive = all.filter((s) => !s.isActive);
    const entries = [...map.entries()];
    const only = entries.length === 1 ? entries[0] : undefined;
    if (only?.[0] === "Other") only[0] = "";
    return { entries, inactive };
  }, [all]);
  const categories = useMemo(
    () => [...new Set(all.map((s) => s.category?.trim()).filter((c): c is string => !!c))],
    [all],
  );
  const open = editor.open;

  return (
    <PageContainer size="default">
      <PageHeader
        title="Services"
        description="What people can book, how long it takes and what it costs."
        actions={
          perms.manageServices && (
            <ActionButton variant="primary" onClick={() => open(null)} icon={<Plus />} label="New service" />
          )
        }
      />
      {services.isError ? (
        <ErrorState error={services.error} onRetry={() => services.refetch()} headingLevel={2} />
      ) : services.isPending ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading services">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-18 rounded-xl" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface shadow-xs">
          <EmptyState
            headingLevel={2}
            icon={<Sparkles />}
            title="No services yet"
            description="Services you add show on your booking page. Add your first one with its length and price."
            action={
              perms.manageServices && (
                <Button variant="primary" onClick={() => open(null)}>
                  <Plus /> New service
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.entries.map(([cat, list]) => (
            <section key={cat || "all"} className="flex flex-col gap-2">
              {cat && <h2 className="px-1 text-sm font-medium text-muted-foreground">{cat}</h2>}
              <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
                {list.map((s) => (
                  <ServiceRow key={s.id} service={s} canEdit={perms.manageServices} onEdit={() => open(s)} />
                ))}
              </ul>
            </section>
          ))}
          {groups.inactive.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="px-1 text-sm font-medium text-muted-foreground">Inactive</h2>
              <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-xl border border-dashed border-border-strong bg-surface-sunken/50">
                {groups.inactive.map((s) => (
                  <ServiceRow key={s.id} service={s} canEdit={perms.manageServices} onEdit={() => open(s)} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {editor.current && (
        <ServiceEditor
          key={editor.current.key}
          service={editor.current.item}
          {...editor.dialogProps}
          categories={categories}
          nextSortOrder={nextSortOrder(all)}
        />
      )}
    </PageContainer>
  );
}

function ServiceRow({
  service: s,
  canEdit,
  onEdit,
}: {
  service: Service;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const { business } = useBusinessContext();
  const fmt = useFmt();
  const replace = useReplaceService(business.id);
  const priceText = priceLabel(s, fmt.currency, { locale: fmt.locale });
  const durText = durationLabel(s);

  const toggle = async (patch: { isPublic?: boolean; isActive?: boolean }, message: string) => {
    await withToast(() => replace.mutateAsync({ id: s.id, input: serviceWith(s, patch) }), message);
  };

  return (
    <li
      className={cn(
        "group flex items-center gap-4 px-4 py-3.5 transition-colors",
        canEdit && "hover:bg-accent/40",
        !s.isActive && "opacity-70",
      )}
    >
      <span aria-hidden className="h-10 w-1 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
      <button
        type="button"
        disabled={!canEdit}
        onClick={onEdit}
        className="flex min-w-0 flex-1 flex-col gap-1 text-left disabled:cursor-default"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{s.name}</span>
          {!s.isPublic && <Badge className="h-5">Private</Badge>}
          {s.requiresApproval && (
            <Badge tone="info" className="h-5">
              Approval
            </Badge>
          )}
          {s.capacity > 1 && <Badge className="h-5">{s.capacity} seats</Badge>}
        </span>
        <span className="tnum flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{durText}</span>
          <span aria-hidden>·</span>
          <span className="font-medium text-foreground">{priceText}</span>
          {/* A free service already reads "Free" from its price, so don't say it twice. */}
          {PAYMENT_MODE_SHORT[s.paymentMode] !== priceText && (
            <>
              <span aria-hidden>·</span>
              <span>
                {PAYMENT_MODE_SHORT[s.paymentMode]}
                {s.allowPayAtVenue && " or at venue"}
              </span>
            </>
          )}
          {s.options.length > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>
                {s.options.length} {s.options.length === 1 ? "option" : "options"}
              </span>
            </>
          )}
          {s.addons.length > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>
                {s.addons.length} {s.addons.length === 1 ? "add-on" : "add-ons"}
              </span>
            </>
          )}
        </span>
      </button>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-4">
          <Tooltip content={s.isPublic ? "Shown on your booking page" : "Hidden from your booking page"}>
            <label className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              Public
              <Switch
                size="sm"
                aria-label={`Public: ${s.name}`}
                checked={s.isPublic}
                disabled={replace.isPending || !s.isActive}
                onCheckedChange={(c) =>
                  toggle({ isPublic: c }, c ? `${s.name} is on your page` : `${s.name} is now private`)
                }
              />
            </label>
          </Tooltip>
          <Tooltip content={s.isActive ? "Bookable" : "Can't be booked"}>
            {/* On phones the word sits under the switch, so it's never an unexplained toggle. */}
            <label className="flex flex-col-reverse items-center gap-0.5 text-[0.625rem] leading-3 text-muted-foreground sm:flex-row sm:gap-2 sm:text-xs">
              <span>Active</span>
              <Switch
                size="sm"
                aria-label={`Active: ${s.name}`}
                checked={s.isActive}
                disabled={replace.isPending}
                onCheckedChange={(c) =>
                  toggle({ isActive: c }, c ? `${s.name} activated` : `${s.name} deactivated`)
                }
              />
            </label>
          </Tooltip>
          <IconButton label={`Edit ${s.name}`} onClick={onEdit}>
            <Pencil />
          </IconButton>
        </div>
      )}
    </li>
  );
}
