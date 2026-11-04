import { Copy, Mail, Phone, User, DoorOpen, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

function Heading({ children }: { children: string }) {
  return <p className="text-xs font-medium tracking-wide text-subtle-foreground uppercase">{children}</p>;
}

/** The booking drawer for the appointment that just came in. */
export function BookingDrawer() {
  return (
    <>
      <div className="flex flex-col gap-1.5 border-b border-border-subtle px-5 py-4 pr-12">
        <div className="flex items-center gap-2.5">
          <Avatar name="Jordan Pike" size="md" />
          <p className="text-base font-semibold tracking-tight">Jordan Pike</p>
        </div>
        <p className="tnum text-sm font-medium">Thu 1 Oct · 15:30 – 16:10</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="success" dot>
            Confirmed
          </Badge>
          <Badge tone="success">Paid</Badge>
          <Badge className="font-mono text-2xs">
            BA-7KQ2MX <Copy />
          </Badge>
        </div>
        <X className="absolute top-5 right-5 size-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-7 px-5 py-6">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Heading>Client</Heading>
            <span className="text-xs font-medium text-brand">View profile</span>
          </div>
          <p className="text-sm font-medium">Jordan Pike</p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="size-4" /> jordan@example.com
          </p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="size-4" /> +353 87 555 0142
          </p>
        </section>
        <section className="flex flex-col gap-2">
          <Heading>Service</Heading>
          <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span className="size-2 rounded-full bg-[#6d5bd0]" /> Dry needling
              </span>
              <span className="text-muted-foreground">40 min</span>
            </div>
            <div className="flex gap-1.5 border-t border-border-subtle pt-3">
              <Badge>
                <User /> Sam Rivers
              </Badge>
              <Badge>
                <DoorOpen /> Treatment room 2
              </Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Booked online just now</p>
        </section>
        <section className="flex flex-col gap-2">
          <Heading>Payment</Heading>
          <div className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border px-4 text-sm">
            <span className="flex justify-between py-2.5">
              <span className="text-muted-foreground">Price</span> €55
            </span>
            <span className="flex justify-between py-2.5">
              <span className="text-muted-foreground">Paid</span> €55
            </span>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" /> Card · Apple Pay · succeeded
          </p>
        </section>
      </div>
    </>
  );
}
