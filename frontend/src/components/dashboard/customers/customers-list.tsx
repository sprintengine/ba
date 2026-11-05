"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, UserPlus, Users } from "lucide-react";
import type { Customer } from "@/lib/api/types";
import { useCreateCustomer, useCustomerGroups, useInfiniteCustomers } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { ErrorState } from "@/components/common/feedback";
import { PageContainer } from "@/components/ui/page-container";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { InfiniteFooter } from "@/components/ui/infinite-footer";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput, useDebouncedSearch } from "@/components/ui/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { useFmt } from "../common";
import { CustomerForm } from "./customer-form";

const NO_CUSTOMERS: Customer[] = [];

export function CustomersList() {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const fmt = useFmt();
  const router = useRouter();
  const search = useDebouncedSearch();
  const q = search.query;
  const customers = useInfiniteCustomers(business.id, { q: q || undefined, limit: 50 });
  const groups = useCustomerGroups(business.id);
  const groupName = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g.name])), [groups.data]);
  const items = customers.data ?? NO_CUSTOMERS;
  // A column of dashes says nothing: it appears once someone is in a group.
  const showGroup = items.some((c) => c.groupId && groupName.has(c.groupId));
  const [adding, setAdding] = useState(false);
  const create = useCreateCustomer(business.id);

  const href = (c: Customer) => dashboardHref(business.slug, `customers/${c.id}`);

  return (
    <PageContainer size="wide">
      <PageHeader
        title={v("customers", { title: true })}
        description={`Everyone who has booked with ${business.name}.`}
        actions={
          <ActionButton
            variant="primary"
            onClick={() => setAdding(true)}
            icon={<UserPlus />}
            label={`Add ${v("customer")}`}
            collapse={false}
          />
        }
      />
      <div className="pb-4">
        <SearchInput
          placeholder="Search by name, email or phone"
          value={search.text}
          onValueChange={search.setText}
          className="sm:w-80"
          aria-label={`Search ${v("customers")}`}
        />
      </div>

      {customers.isError ? (
        <ErrorState headingLevel={2} error={customers.error} onRetry={() => customers.refetch()} />
      ) : !customers.isPending && items.length === 0 ? (
        <div className="border-y border-border">
          {q ? (
            <EmptyState
              headingLevel={2}
              icon={<Search />}
              title={`No ${v("customers")} match “${q}”`}
              description="Check the spelling, or search by email or phone instead."
              action={
                <Button variant="secondary" onClick={() => search.setText("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <EmptyState
              headingLevel={2}
              icon={<Users />}
              title={`No ${v("customers")} yet`}
              description={`${v("customers", { title: true })} appear here after their first ${v("booking")}. You can also add them yourself.`}
              action={
                <Button variant="primary" onClick={() => setAdding(true)}>
                  <UserPlus /> Add {v("customer")}
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <div className="border-y border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                {showGroup && <TableHead className="hidden lg:table-cell">Group</TableHead>}
                <TableHead align="right">{v("bookings", { title: true })}</TableHead>
                <TableHead className="hidden sm:table-cell">Last visit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.isPending
                ? Array.from({ length: 8 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Skeleton className="size-8 rounded-full" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Skeleton className="h-4 w-44" />
                      </TableCell>
                      {showGroup && (
                        <TableCell className="hidden lg:table-cell">
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      )}
                      <TableCell align="right">
                        <Skeleton className="ml-auto h-4 w-6" />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    </TableRow>
                  ))
                : items.map((c) => (
                    <TableRow key={c.id} interactive onClick={() => router.push(href(c))}>
                      {/* Phones: the name column takes what's left and truncates, so a long email can't push
                          the count off the edge. */}
                      <TableCell className="max-md:w-full max-md:max-w-0">
                        <Link
                          href={href(c)}
                          className="flex min-w-0 items-center gap-2.5 focus-visible:outline-none pointer-coarse:min-h-11"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Avatar name={c.name} size="md" />
                          <span className="flex min-w-0 flex-col">
                            <span className="flex min-w-0 items-center gap-2 font-medium">
                              <span className="truncate">{c.name}</span>
                              {c.hasAccount && (
                                <Badge tone="brand" className="h-5 shrink-0 max-sm:hidden">
                                  Account
                                </Badge>
                              )}
                            </span>
                            <span className="truncate text-xs text-muted-foreground md:hidden">
                              {c.email ?? c.phone ?? ""}
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-col text-sm">
                          <span className="max-w-64 truncate">
                            {c.email ?? <span className="text-subtle-foreground">No email</span>}
                          </span>
                          {c.phone && <span className="tnum text-xs text-muted-foreground">{c.phone}</span>}
                        </div>
                      </TableCell>
                      {showGroup && (
                        <TableCell className="hidden lg:table-cell">
                          {c.groupId && groupName.get(c.groupId) ? (
                            <Badge>{groupName.get(c.groupId)}</Badge>
                          ) : (
                            <span className="text-subtle-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell align="right">{c.bookingCount}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {c.lastBookingAt ? fmt.date(c.lastBookingAt, "medium") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
          <InfiniteFooter
            paging={customers}
            rootMargin="300px"
            endLabel={
              items.length > 0 ? `${items.length} ${v("customer", { count: items.length })}` : undefined
            }
            className="h-10 border-t border-border-subtle"
          />
        </div>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Add a {v("customer")}</DialogTitle>
            <DialogDescription>For people who book by phone or in person.</DialogDescription>
          </DialogHeader>
          <DialogBody className="pb-5">
            {adding && (
              <CustomerForm
                submitLabel={`Add ${v("customer")}`}
                footer={
                  <Button variant="secondary" onClick={() => setAdding(false)}>
                    Cancel
                  </Button>
                }
                onSubmit={async (input) => {
                  const c = await create.mutateAsync(input);
                  toast.success(`${c.name} added`);
                  setAdding(false);
                  router.push(href(c));
                }}
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
