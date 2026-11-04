"use client";

import { CalendarDays, Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { Demo, Section } from "./section";

export function FeedbackSection() {
  return (
    <Section id="feedback" title="Feedback" description="Toasts (sonner), skeletons, spinner, empty states.">
      <div className="flex flex-col gap-6">
        <Demo label="Toasts">
          <Button
            variant="secondary"
            onClick={() =>
              toast.success("Booking confirmed", { description: "Alex Morgan · Thu 1 Oct, 09:00" })
            }
          >
            Success
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast.error("That slot was just taken", { description: "Please choose another time." })
            }
          >
            Error
          </Button>
          <Button variant="secondary" onClick={() => toast.warning("Payments aren't connected yet")}>
            Warning
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast("Invitation sent", { action: { label: "Undo", onClick: () => {} } })}
          >
            With action
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast.promise(new Promise((r) => setTimeout(r, 1200)), {
                loading: "Saving…",
                success: "Saved",
                error: "Failed",
              })
            }
          >
            Promise
          </Button>
        </Demo>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="gap-3 p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <SkeletonText lines={3} />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading availability…
            </div>
          </Card>
          <Card className="md:col-span-2">
            <EmptyState
              icon={<CalendarDays />}
              title="No bookings yet"
              description="Share your booking page and they'll show up here."
              action={
                <>
                  <Button variant="primary">
                    <Copy /> Copy link
                  </Button>
                  <Button variant="secondary">
                    <Plus /> Add booking
                  </Button>
                </>
              }
            />
          </Card>
        </div>
      </div>
    </Section>
  );
}
