"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Mail, MoreHorizontal, Pencil, Phone, Plus, ShieldAlert, Trash2 } from "lucide-react";
import type { CustomerDetail } from "@/lib/api/types";
import { useCustomer, useCustomerGroups, useUpdateCustomer } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState } from "@/components/common/feedback";
import { PageContainer } from "@/components/ui/page-container";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/ui/page-header";
import { NotSet, PropertyList, PropertyRow } from "@/components/ui/property-list";
import { toast } from "@/components/ui/toast";
import { useBookingActions } from "../booking/booking-actions-provider";
import { useFmt } from "../common";
import { useIsMobile } from "../lib/hooks";
import { CustomerDetailSkeleton } from "./customer-detail-skeleton";
import { CustomerForm } from "./customer-form";
import { HistoryList, HistoryTable } from "./customer-history-list";
import { EraseDialog } from "./erase-dialog";
import { useCustomerExport } from "./use-customer-export";

export function CustomerDetailView({ customerId }: { customerId: string }) {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const mobile = useIsMobile();
  const router = useRouter();
  const { openBooking, openNewBooking } = useBookingActions();
  const customer = useCustomer(business.id, customerId);
  const groups = useCustomerGroups(business.id);
  const exportData = useCustomerExport(customer.data);
  const [eraseOpen, setEraseOpen] = useState(false);
  // Opened from a menu that has closed: focus comes back to the menu's button.
  const [moreButton, setMoreButton] = useState<HTMLButtonElement | null>(null);
  const back = { href: dashboardHref(business.slug, "customers"), label: v("customers", { title: true }) };

  // A failed refresh keeps showing the customer already loaded; the error is for when there is none.
  if (customer.isError && !customer.data) {
    if (customer.error.isNotFound || customer.error.isForbidden) {
      return (
        <PageContainer>
          <PageHeader back={back} title={`${v("customer", { title: true })} not found`} />
          <EmptyState
            headingLevel={2}
            icon={<ShieldAlert />}
            title={`This ${v("customer")} isn't available`}
            description={`They may have been erased, or they only have ${v("bookings")} on calendars you can't see.`}
          />
        </PageContainer>
      );
    }
    return (
      <PageContainer>
        <PageHeader back={back} title={v("customer", { title: true })} />
        <ErrorState headingLevel={2} error={customer.error} onRetry={() => customer.refetch()} />
      </PageContainer>
    );
  }
  if (!customer.data) return <CustomerDetailSkeleton back={back} />;
  const c = customer.data;
  const group = groups.data?.find((g) => g.id === c.groupId);
  const upcoming = c.bookings
    .filter((b) => new Date(b.start) > new Date() && b.status !== "cancelled")
    .sort((a, b) => a.start.localeCompare(b.start));
  const coming = new Set(upcoming.map((b) => b.id));
  const history = [...upcoming, ...c.bookings.filter((b) => !coming.has(b.id))];
  const story = [
    `${c.bookingCount} ${v("booking", { count: c.bookingCount })}, ${upcoming.length} upcoming.`,
    upcoming[0] && `Next ${fmt.dateTime(upcoming[0].start)}.`,
    `${v("customer", { title: true })} since ${fmt.date(c.createdAt, "monthYear")}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <PageContainer size="wide">
      <PageHeader
        back={back}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={c.name} size="lg" />
            <span className="min-w-0 truncate">{c.name}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
            {c.email && (
              <a
                href={`mailto:${c.email}`}
                className="flex items-center gap-1.5 hover:text-foreground pointer-coarse:min-h-11"
              >
                <Mail className="size-3.5" /> {c.email}
              </a>
            )}
            {c.phone && (
              <a
                href={`tel:${c.phone}`}
                className="tnum flex items-center gap-1.5 hover:text-foreground pointer-coarse:min-h-11"
              >
                <Phone className="size-3.5" /> {c.phone}
              </a>
            )}
            {group && <Badge tone="brand">{group.name}</Badge>}
            {c.hasAccount && <Badge tone="brand">Account</Badge>}
          </span>
        }
        actions={
          <>
            {perms.manageCustomerData && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton ref={setMoreButton} variant="secondary" size="md" label="More actions">
                    <MoreHorizontal />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={exportData.download}>
                    <Download /> Export data (JSON)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => setEraseOpen(true)}>
                    <Trash2 /> Erase {v("customer")}…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="primary"
              onClick={() =>
                openNewBooking({ customer: { id: c.id, name: c.name, email: c.email, phone: c.phone } })
              }
            >
              <Plus /> New {v("booking")}
            </Button>
          </>
        }
      >
        <p className="tnum text-sm">{story}</p>
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle headingLevel={2}>{v("bookings", { title: true })}</CardTitle>
            </CardHeader>
            {c.bookings.length === 0 ? (
              <CardContent>
                <EmptyState
                  headingLevel={3}
                  size="sm"
                  title={`No ${v("bookings")} yet`}
                  description={`Book something for ${c.name.split(" ")[0]}.`}
                />
              </CardContent>
            ) : mobile ? (
              <HistoryList bookings={history} onOpen={openBooking} />
            ) : (
              <HistoryTable bookings={history} onOpen={openBooking} />
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <DetailsCard customer={c} groupName={group?.name} hasGroups={(groups.data?.length ?? 0) > 0} />
        </div>
      </div>

      <EraseDialog
        customer={c}
        open={eraseOpen}
        onOpenChange={setEraseOpen}
        returnFocusTo={moreButton}
        onErased={() => router.replace(back.href)}
      />
    </PageContainer>
  );
}

/** Their details as values to read; Edit details opens the form, and saving goes back to reading. */
function DetailsCard({
  customer: c,
  groupName,
  hasGroups,
}: {
  customer: CustomerDetail;
  groupName?: string;
  hasGroups: boolean;
}) {
  const { business } = useBusinessContext();
  const update = useUpdateCustomer(business.id);
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle headingLevel={2}>Details</CardTitle>
        {!editing && (
          <CardAction>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil /> Edit details
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <CustomerForm
            key={c.id + c.name + (c.email ?? "")}
            initial={c}
            submitLabel="Save changes"
            footer={
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            }
            onSubmit={async (input) => {
              await update.mutateAsync({ id: c.id, input });
              toast.success("Saved");
              setEditing(false);
            }}
          />
        ) : (
          <PropertyList>
            {/* Set, they're under the name already, as links. */}
            {!c.email && (
              <PropertyRow label="Email">
                <NotSet />
              </PropertyRow>
            )}
            {!c.phone && (
              <PropertyRow label="Phone">
                <NotSet />
              </PropertyRow>
            )}
            {(groupName || hasGroups) && (
              <PropertyRow label="Group">{groupName ?? <NotSet>No group</NotSet>}</PropertyRow>
            )}
            <PropertyRow label="Notes">
              {c.notes ? <span className="whitespace-pre-wrap">{c.notes}</span> : <NotSet />}
            </PropertyRow>
          </PropertyList>
        )}
      </CardContent>
    </Card>
  );
}
