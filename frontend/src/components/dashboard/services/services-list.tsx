"use client";

import { useMemo } from "react";
import { Eye, EyeOff, MoreHorizontal, Pencil, Plus, Power, Sparkles } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { useEditorDialog } from "@/components/ui/form-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { withToast } from "@/components/common/with-toast";
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
    <PageContainer size="wide">
      <PageHeader
        title="Services"
        description="What people can book, how long it takes and what it costs."
        actions={
          perms.manageServices && (
            <ActionButton
              variant="primary"
              onClick={() => open(null)}
              icon={<Plus />}
              label="New service"
              collapse={false}
            />
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
        <div>
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
              <ul className="flex flex-col divide-y divide-border-subtle border-y border-border">
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

/** Whichever states are out of the ordinary: a service that's public, on and instantly bookable says nothing. */
function ServiceStates({ service: s }: { service: Service }) {
  return (
    <>
      {!s.isActive && <Badge className="h-5">Off</Badge>}
      {s.isActive && !s.isPublic && <Badge className="h-5">Private</Badge>}
      {s.requiresApproval && (
        <Badge tone="info" className="h-5">
          Needs approval
        </Badge>
      )}
    </>
  );
}

/**
 * One service: the row opens the editor, the figures sit in columns, and only a state that's out of the ordinary shows.
 * Turning it off or making it private, the rare changes, are in the row's menu.
 */
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
  const payment = PAYMENT_MODE_SHORT[s.paymentMode];
  const extras = [
    s.capacity > 1 ? `${String(s.capacity)} seats` : null,
    s.options.length > 0
      ? `${String(s.options.length)} ${s.options.length === 1 ? "option" : "options"}`
      : null,
    s.addons.length > 0 ? `${String(s.addons.length)} ${s.addons.length === 1 ? "add-on" : "add-ons"}` : null,
  ].filter(Boolean);

  const toggle = async (patch: { isPublic?: boolean; isActive?: boolean }, message: string) => {
    await withToast(() => replace.mutateAsync({ id: s.id, input: serviceWith(s, patch) }), message);
  };

  return (
    <li className={cn("flex items-center transition-colors", canEdit && "hover:bg-accent/40")}>
      <button
        type="button"
        disabled={!canEdit}
        onClick={onEdit}
        aria-label={canEdit ? `Edit ${s.name}` : undefined}
        className="focus-ring flex min-w-0 flex-1 items-center gap-4 rounded-md py-3.5 pl-4 text-left disabled:cursor-default"
      >
        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn("min-w-0 truncate text-sm font-medium", !s.isActive && "text-muted-foreground")}
            >
              {s.name}
            </span>
            <ServiceStates service={s} />
          </span>
          <span className="tnum truncate text-xs text-muted-foreground">
            {/* The figures have their own columns from a small window up. */}
            <span className="sm:hidden">
              {[durText, priceText, payment !== priceText && payment].filter(Boolean).join(" · ")}
            </span>
            {extras.length > 0 && <span className="max-sm:before:content-['_·_']">{extras.join(" · ")}</span>}
          </span>
        </span>
        <span className="tnum hidden w-16 shrink-0 text-right text-sm text-muted-foreground sm:block">
          {durText}
        </span>
        <span className="hidden w-32 shrink-0 truncate text-sm text-muted-foreground lg:block">
          {/* A free service already reads "Free" from its price, so don't say it twice. */}
          {payment !== priceText && `${payment}${s.allowPayAtVenue ? " or at venue" : ""}`}
        </span>
        <span className="tnum hidden w-20 shrink-0 text-right text-sm font-medium sm:block">{priceText}</span>
      </button>
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label={`More for ${s.name}`} className="mx-2 shrink-0">
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={replace.isPending || !s.isActive}
              onSelect={() =>
                void toggle(
                  { isPublic: !s.isPublic },
                  s.isPublic ? `${s.name} is now private` : `${s.name} is on your page`,
                )
              }
            >
              {s.isPublic ? <EyeOff /> : <Eye />}
              {s.isPublic ? "Make private" : "Show on booking page"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={replace.isPending}
              onSelect={() =>
                void toggle(
                  { isActive: !s.isActive },
                  s.isActive ? `${s.name} deactivated` : `${s.name} activated`,
                )
              }
            >
              <Power />
              {s.isActive ? "Turn off" : "Turn on"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="w-4 shrink-0" />
      )}
    </li>
  );
}
