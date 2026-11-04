"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Download, Mail, MoreHorizontal, Phone, ShieldAlert, Trash2 } from "lucide-react";
import { useCustomer, useCustomerGroups, useUpdateCustomer } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState } from "@/components/common/feedback";
import { PageContainer } from "@/components/ui/page-container";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const update = useUpdateCustomer(business.id);
  const exportData = useCustomerExport(customer.data);
  const [eraseOpen, setEraseOpen] = useState(false);
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
  const upcoming = c.bookings.filter((b) => new Date(b.start) > new Date() && b.status !== "cancelled");

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
            {c.hasAccount && <Badge>Has an account</Badge>}
          </span>
        }
        actions={
          <>
            {perms.manageCustomerData && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton variant="secondary" size="md" label="More actions">
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
              <CalendarPlus /> New {v("booking")}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <MiniStat label={v("bookings", { title: true })} value={String(c.bookingCount)} />
            <MiniStat label="Upcoming" value={String(upcoming.length)} />
            <MiniStat
              label={`${v("customer", { title: true })} since`}
              value={fmt.date(c.createdAt, "monthYear")}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle headingLevel={2}>History</CardTitle>
              <CardDescription>Newest first. Select one to open it.</CardDescription>
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
              <HistoryList bookings={c.bookings} onOpen={openBooking} />
            ) : (
              <HistoryTable bookings={c.bookings} onOpen={openBooking} />
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle headingLevel={2}>Details</CardTitle>
              <CardDescription>Contact details, group and private notes.</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerForm
                key={c.id + c.name + (c.email ?? "")}
                initial={c}
                submitLabel="Save changes"
                onSubmit={async (input) => {
                  await update.mutateAsync({ id: c.id, input });
                  toast.success("Saved");
                }}
              />
            </CardContent>
          </Card>
          {perms.manageCustomerData && (
            <Card>
              <CardHeader>
                <CardTitle headingLevel={2}>Privacy</CardTitle>
                <CardDescription>Respond to data requests under GDPR.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button
                  variant="secondary"
                  onClick={exportData.download}
                  loading={exportData.isPending}
                  className="justify-start"
                >
                  <Download /> Download their data
                </Button>
                <Button variant="danger-soft" onClick={() => setEraseOpen(true)} className="justify-start">
                  <Trash2 /> Erase personal data
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <EraseDialog
        customer={c}
        open={eraseOpen}
        onOpenChange={setEraseOpen}
        onErased={() => router.replace(back.href)}
      />
    </PageContainer>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-3 shadow-xs sm:px-4">
      <span className="text-xs leading-4 text-muted-foreground">{label}</span>
      <span className="tnum text-base font-semibold tracking-tight sm:text-lg">{value}</span>
    </div>
  );
}
