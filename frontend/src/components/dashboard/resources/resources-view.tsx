"use client";

import { useMemo, useState } from "react";
import { Boxes, CalendarOff, KeyRound, Link2, Pencil, Plus, Rows3 } from "lucide-react";
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
import { ResourceKindIcon, resourceTile } from "../common";
import { canEditAvailability } from "@/lib/business/permissions";
import { useUrlParams } from "@/lib/hooks/use-url-params";
import { TeamSection } from "../team/team-view";
import { CompareHours } from "./compare-hours";
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
  const wanted = params.get("r");
  // The page shows one thing at a time: someone's calendar, or something that's true of the whole business.
  const wholeBusiness: { id: string; label: string; icon: React.ReactNode }[] = [
    ...(list.length > 1 ? [{ id: "compare", label: "Compare hours", icon: <Rows3 /> }] : []),
    { id: "sign-in", label: "Who can sign in", icon: <KeyRound /> },
    ...(perms.manageClosures ? [{ id: "closures", label: "Closures", icon: <CalendarOff /> }] : []),
  ];
  const section = wholeBusiness.find((s) => s.id === wanted)?.id ?? null;
  const selected = section ? undefined : (list.find((r) => r.id === wanted) ?? list[0]);
  const myMemberId = team.data?.find((m) => m.userId === me.user.id)?.id ?? null;
  const memberName = (id: string | null) => {
    const m = team.data?.find((x) => x.id === id);
    return m ? m.name || m.email : null;
  };
  const select = (id: string) => setParams({ r: id });

  const addLabel = addResourceLabel(v("resource"));

  return (
    <PageContainer size="wide">
      <PageHeader
        title={v("resources", { title: true })}
        description={
          perms.manageResources
            ? "The people, rooms and equipment that get booked, when each one is available, and who can sign in."
            : "Your working hours and time off."
        }
        actions={
          perms.manageResources && (
            <ActionButton
              variant="primary"
              onClick={() => editor.open(null)}
              icon={<Plus />}
              label={addLabel}
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
        <div>
          <EmptyState
            headingLevel={2}
            icon={<Boxes />}
            title={perms.manageResources ? `No ${v("resources")} yet` : "You're not linked to a calendar"}
            description={
              perms.manageResources
                ? `Add who or what gets booked. Each ${v("resource")} has its own hours and calendar column.`
                : "Ask an admin to link you to your calendar on this page."
            }
            action={
              perms.manageResources && (
                <Button variant="primary" onClick={() => editor.open(null)}>
                  <Plus /> {addLabel}
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <nav
              aria-label={v("resources", { title: true })}
              className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5"
            >
              {list.map((r) => {
                const active = selected?.id === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => select(r.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring max-lg:flex-1 max-lg:basis-[calc(50%-0.375rem)] sm:max-lg:basis-0",
                      active ? "bg-accent" : "hover:bg-accent/60",
                      !r.isActive && "opacity-60",
                    )}
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                      style={resourceTile(r.color)}
                    >
                      <ResourceKindIcon kind={r.kind} className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{r.name}</span>
                      <span className="truncate text-xs text-muted-foreground max-lg:hidden">
                        {!r.isActive
                          ? "Inactive"
                          : r.kind === "person"
                            ? memberName(r.memberId)
                              ? `Signs in as ${memberName(r.memberId)}`
                              : "No sign-in"
                            : `${RESOURCE_KIND_LABEL[r.kind]}${r.capacity > 1 ? ` · ${r.capacity} places` : ""}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
            <nav aria-label="Whole business" className="flex flex-col gap-1.5 lg:gap-0.5">
              <h2 className="px-3 text-xs font-medium text-muted-foreground">Whole business</h2>
              <div className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
                {wholeBusiness.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => select(s.id)}
                    aria-current={section === s.id ? "true" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring max-lg:flex-1 max-lg:whitespace-nowrap pointer-coarse:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
                      section === s.id ? "bg-accent font-medium" : "hover:bg-accent/60",
                    )}
                  >
                    {s.icon}
                    {s.label}
                  </button>
                ))}
              </div>
            </nav>
          </div>
          <div className="min-w-0 lg:border-l lg:border-border lg:pl-6">
            {section === "compare" && <CompareHours resources={list} onSelect={select} />}
            {section === "sign-in" && <TeamSection />}
            {section === "closures" && <Closures editable />}
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

/** The default word doesn't stretch to rooms and equipment; a word the business chose stands. */
const addResourceLabel = (word: string) =>
  word.toLowerCase() === "staff member" ? "Add person or room" : `Add ${word}`;

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
    <div className="flex min-w-0 flex-col">
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
          <TabsTrigger value="exceptions">
            {resource.kind === "person" ? "Time off and extra hours" : "Closures and extra hours"}
          </TabsTrigger>
        </TabsList>
        {/* Kept mounted while hidden, so unsaved weekly hours survive a look at time off. */}
        <TabsContent value="hours" forceMount hidden={tab !== "hours"}>
          <WeeklyHours resource={resource} editable={editable} />
        </TabsContent>
        <TabsContent value="exceptions">
          <TimeOff resourceId={resource.id} editable={editable} person={resource.kind === "person"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
