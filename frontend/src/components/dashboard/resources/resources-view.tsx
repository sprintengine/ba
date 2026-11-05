"use client";

import { useMemo, useState } from "react";
import { Boxes, Link2, Pencil, Plus } from "lucide-react";
import type { Resource } from "@/lib/api/types";
import { useResources, useTeam } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { nextSortOrder } from "@/lib/dashboard/sort-order";
import { RESOURCE_KIND_LABEL } from "@/lib/catalog/resources";
import { cn } from "@/lib/utils";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState } from "@/components/common/feedback";
import { PageContainer } from "@/components/ui/page-container";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { useEditorDialog } from "@/components/ui/form-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResourceKindIcon } from "../common";
import { canEditAvailability } from "@/lib/business/permissions";
import { useUrlParams } from "@/lib/hooks/use-url-params";
import { ResourceDialog } from "./resource-dialog";
import { Closures, TimeOff } from "./time-off";
import { WeeklyHours } from "./weekly-hours/weekly-hours";

/** Resources (in the business's words) with weekly hours, time off and business closures. */
export function ResourcesView() {
  const { business, role, me } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const { params, setParams } = useUrlParams();
  const resources = useResources(business.id);
  const team = useTeam(business.id);
  const editor = useEditorDialog<Resource>();
  const list = useMemo(
    () =>
      [...(resources.data ?? [])].sort(
        (a, b) =>
          Number(b.isActive) - Number(a.isActive) ||
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name),
      ),
    [resources.data],
  );
  const selected = list.find((r) => r.id === params.get("r")) ?? list[0];
  const myMemberId = team.data?.find((m) => m.userId === me.user.id)?.id ?? null;
  const memberName = (id: string | null) => {
    const m = team.data?.find((x) => x.id === id);
    return m ? m.name || m.email : null;
  };
  const select = (id: string) => setParams({ r: id });

  return (
    <PageContainer size="wide">
      <PageHeader
        title={v("resources", { title: true })}
        description={
          perms.manageResources
            ? "The people, rooms and equipment that get booked, and when each one is available."
            : "Your working hours and time off."
        }
        actions={
          perms.manageResources && (
            <ActionButton
              variant="primary"
              onClick={() => editor.open(null)}
              icon={<Plus />}
              label={`Add ${v("resource")}`}
              collapse={false}
            />
          )
        }
      />
      {resources.isError ? (
        <ErrorState error={resources.error} onRetry={() => resources.refetch()} headingLevel={2} />
      ) : resources.isPending ? (
        <div
          role="status"
          aria-label={`Loading ${v("resources")}`}
          className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]"
        >
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-[28rem] rounded-xl" />
        </div>
      ) : list.length === 0 ? (
        <div className="border-y border-border">
          <EmptyState
            headingLevel={2}
            icon={<Boxes />}
            title={perms.manageResources ? `No ${v("resources")} yet` : "You're not linked to a calendar"}
            description={
              perms.manageResources
                ? `Add who or what gets booked. Each ${v("resource")} has its own hours and calendar column.`
                : "Ask an admin to link you to your calendar in Team settings."
            }
            action={
              perms.manageResources && (
                <Button variant="primary" onClick={() => editor.open(null)}>
                  <Plus /> Add {v("resource")}
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <nav
              aria-label={v("resources", { title: true })}
              className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
            >
              {list.map((r) => {
                const active = selected?.id === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => select(r.id)}
                    aria-current={active ? "true" : undefined}
                    // On phones this is a sideways strip: the one on show stays in view.
                    ref={
                      active ? (el) => el?.scrollIntoView({ block: "nearest", inline: "start" }) : undefined
                    }
                    className={cn(
                      "flex min-w-52 snap-start items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-w-0",
                      active ? "border-transparent bg-accent" : "border-transparent hover:bg-accent/60",
                      !r.isActive && "opacity-60",
                    )}
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: r.color }}
                    >
                      <ResourceKindIcon kind={r.kind} className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{r.name}</span>
                      {/* On a phone the row is a strip of names: a second line would be cut anyway. */}
                      <span className="truncate text-xs text-muted-foreground max-sm:hidden">
                        {!r.isActive
                          ? "Inactive"
                          : r.kind === "person"
                            ? memberName(r.memberId)
                              ? `Linked to ${memberName(r.memberId)}`
                              : "Not linked"
                            : `${RESOURCE_KIND_LABEL[r.kind]}${r.capacity > 1 ? ` · ${r.capacity} places` : ""}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
            {selected && (
              <ResourcePanel
                key={selected.id}
                resource={selected}
                editable={canEditAvailability(role, selected, myMemberId)}
                canEditDetails={perms.manageResources}
                linkedTo={memberName(selected.memberId)}
                onEdit={() => editor.open(selected)}
              />
            )}
          </div>
          {perms.manageClosures && <Closures editable />}
        </div>
      )}
      {editor.current && (
        <ResourceDialog
          key={editor.current.key}
          resource={editor.current.item}
          {...editor.dialogProps}
          team={team.data ?? []}
          nextSortOrder={nextSortOrder(list)}
          onSaved={(r) => select(r.id)}
        />
      )}
    </PageContainer>
  );
}

function ResourcePanel({
  resource,
  editable,
  canEditDetails,
  linkedTo,
  onEdit,
}: {
  resource: Resource;
  editable: boolean;
  canEditDetails: boolean;
  linkedTo: string | null;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState("hours");
  return (
    <div className="flex min-w-0 flex-col lg:border-l lg:border-border lg:pl-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            {resource.name}
            {!resource.isActive && <Badge>Inactive</Badge>}
          </h2>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>{RESOURCE_KIND_LABEL[resource.kind]}</span>
            {linkedTo && (
              <span className="flex items-center gap-1">
                · <Link2 className="size-3.5" /> {linkedTo}
              </span>
            )}
            {resource.description && <span className="basis-full truncate">{resource.description}</span>}
          </p>
        </div>
        {canEditDetails && (
          <Button size="sm" variant="secondary" onClick={onEdit}>
            <Pencil /> Edit
          </Button>
        )}
      </div>
      {!editable && (
        <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
          View only — you can edit hours for your own calendar.
        </p>
      )}
      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList>
          <TabsTrigger value="hours">Weekly hours</TabsTrigger>
          <TabsTrigger value="exceptions">Time off and extra hours</TabsTrigger>
        </TabsList>
        {/* Kept mounted while hidden, so unsaved weekly hours survive a look at time off. */}
        <TabsContent value="hours" forceMount hidden={tab !== "hours"}>
          <WeeklyHours resource={resource} editable={editable} />
        </TabsContent>
        <TabsContent value="exceptions">
          <TimeOff resourceId={resource.id} editable={editable} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
