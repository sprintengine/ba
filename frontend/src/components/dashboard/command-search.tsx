"use client";

import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { useBookings, useCustomers } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useVocabulary } from "@/lib/vocabulary";
import { dashboardHref, settingsNavText, visibleSettings } from "@/components/shells/dashboard-nav";
import { Avatar } from "@/components/ui/avatar";
import { CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { BookingStatusBadge } from "@/components/ui/status-badge";
import { useBookingActions } from "./booking/booking-actions-provider";
import { useFmt } from "./common";

/**
 * ⌘K additions for a business: live search of customers and bookings (by
 * name, email, phone or reference) and every settings page.
 */
export function DashboardCommandSearch({ search, close }: { search: string; close: () => void }) {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const router = useRouter();
  const { openBooking } = useBookingActions();
  const q = useDebouncedValue(search.trim(), 200);
  const enabled = q.length >= 2;
  const customers = useCustomers(business.id, { q, limit: 5 }, { enabled });
  const bookings = useBookings(business.id, { q, limit: 5 }, { enabled });
  const loading = enabled && (customers.isFetching || bookings.isFetching);
  const hasResults =
    enabled && ((customers.data?.items.length ?? 0) > 0 || (bookings.data?.items.length ?? 0) > 0);

  const run = (fn: () => void) => {
    close();
    fn();
  };

  return (
    <>
      {enabled && (
        <>
          {(customers.data?.items.length ?? 0) > 0 && (
            <CommandGroup heading={v("customers", { title: true })} forceMount>
              {customers.data!.items.map((c) => (
                <CommandItem
                  key={c.id}
                  forceMount
                  value={`${search} customer-${c.id}`}
                  onSelect={() => run(() => router.push(dashboardHref(business.slug, `customers/${c.id}`)))}
                >
                  <Avatar name={c.name} size="xs" />
                  <span className="truncate">{c.name}</span>
                  <CommandShortcut className="truncate normal-case">
                    {c.email ?? c.phone ?? ""}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(bookings.data?.items.length ?? 0) > 0 && (
            <CommandGroup heading={v("bookings", { title: true })} forceMount>
              {bookings.data!.items.map((b) => (
                <CommandItem
                  key={b.id}
                  forceMount
                  value={`${search} booking-${b.id}`}
                  onSelect={() => run(() => openBooking(b.id))}
                >
                  {/* A fixed width, so the names line up down the list whatever the reference's glyphs. */}
                  <span className="w-18 shrink-0 truncate font-mono text-2xs whitespace-nowrap text-subtle-foreground">
                    {b.reference}
                  </span>
                  <span className="truncate">
                    {b.customer.name} · {b.service.name}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-subtle-foreground">
                    <span className="tnum">
                      {fmt.date(b.start, "short")}, {fmt.time(b.start)}
                    </span>
                    <BookingStatusBadge status={b.status} className="hidden sm:inline-flex" />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-subtle-foreground">
              <Spinner className="size-3.5" /> Searching…
            </div>
          )}
        </>
      )}
      {perms.manageSettings && search.trim().length > 0 && !hasResults && (
        <CommandGroup heading="Settings">
          {visibleSettings(business, perms.can).map((s) => {
            const { label, description } = settingsNavText(s, v);
            return (
              <CommandItem
                key={s.segment}
                value={`settings ${label} ${description}`}
                onSelect={() => run(() => router.push(dashboardHref(business.slug, `settings/${s.segment}`)))}
              >
                <Settings /> {label}
                <CommandShortcut className="hidden normal-case sm:inline">{description}</CommandShortcut>
              </CommandItem>
            );
          })}
        </CommandGroup>
      )}
    </>
  );
}
