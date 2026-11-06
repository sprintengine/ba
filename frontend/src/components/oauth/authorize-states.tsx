"use client";

import { DeadEndMark } from "@/components/brand/logo";
import Link from "next/link";
import { LogoLoader } from "@/components/brand/logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** Matches the consent card's layout while the request is checked. */
export function ConsentSkeleton() {
  return (
    <Card
      variant="panel"
      className="rounded-2xl"
      role="status"
      aria-busy
      aria-label="Loading connection request"
    >
      <CardContent className="flex flex-col items-center gap-6 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <Skeleton className="size-14 rounded-[28%]" />
          <Skeleton className="size-4 rounded-full" />
          <Skeleton className="size-14 rounded-[28%]" />
        </div>
        <Skeleton className="h-7 w-4/5" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="flex w-full flex-col gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <SkeletonText lines={2} className="flex-1" />
            </div>
          ))}
        </div>
        <div className="flex w-full gap-2">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 flex-1" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Unknown app or unregistered redirect: explain and stop. Never redirects anywhere. */
export function InvalidAuthorizeRequest({ message }: { message: string }) {
  return (
    <div>
      <EmptyState
        size="lg"
        headingLevel={1}
        icon={<DeadEndMark />}
        title="This connection link isn't valid"
        description={
          <>
            <span className="block">{message}</span>
            <span className="mt-2 block">
              Nothing was shared. To try again, start from the app you came from.
            </span>
          </>
        }
        action={
          <Button asChild variant="primary">
            <Link href="/my/bookings">Go to my bookings</Link>
          </Button>
        }
      />
    </div>
  );
}

/**
 * A business-server connection for someone who belongs to no business: nothing to connect. Nothing was shared, and
 * the app gets nothing (the request isn't redirected back with a code).
 */
export function NoBusinessToConnect({ message }: { message: string }) {
  return (
    <div>
      <EmptyState
        size="lg"
        headingLevel={1}
        icon={<DeadEndMark />}
        title="There's no business to connect"
        description={message}
        action={
          <Button asChild variant="primary">
            <Link href="/onboarding">Set up your business</Link>
          </Button>
        }
      />
    </div>
  );
}

/** Shown briefly while the browser is sent back to the app. */
export function ReturningToApp() {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
      <LogoLoader className="h-8" />
      Returning you to the app…
    </div>
  );
}
