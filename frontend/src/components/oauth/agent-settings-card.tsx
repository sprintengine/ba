"use client";

import Link from "next/link";
import { errorMessage } from "@/lib/api/client";
import { useMyAgentSettings, useUpdateMyAgentSettings } from "@/lib/api/hooks";
import type { CustomerAutoApprove } from "@/lib/api/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxItem } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { MY_APPROVALS_PATH } from "./customer-approvals";

const KINDS: { value: CustomerAutoApprove; label: string; description: string }[] = [
  {
    value: "bookings",
    label: "Booking and moving",
    description: "New bookings, and moving one to another time.",
  },
  {
    value: "cancellations",
    label: "Cancelling",
    description: "Cancelling a booking, with the refund the business's policy gives.",
  },
];

/**
 * On the connected apps page (§20.8): what the customer's AI apps may do once the customer says yes in the app,
 * without approving it here too. Nothing by default.
 */
export function AgentSettingsCard() {
  const settings = useMyAgentSettings();
  const update = useUpdateMyAgentSettings();
  const on = new Set(settings.data?.autoApprove ?? []);

  const toggle = (kind: CustomerAutoApprove, checked: boolean) => {
    const next = KINDS.map((k) => k.value).filter((k) => (k === kind ? checked : on.has(k)));
    update.mutate(next, {
      onSuccess: () => toast.success("Saved"),
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approving what your AI apps do</CardTitle>
        <CardDescription>
          An AI app can only prepare a booking, a move or a cancellation. It goes ahead once you approve it on
          bookanything: the app gives you a link, and it&rsquo;s under{" "}
          <Link href={MY_APPROVALS_PATH} className="font-medium underline underline-offset-2">
            Approvals
          </Link>
          . Tick what an app may do once you say yes in the app instead.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!settings.data ? (
          <Skeleton className="h-16" />
        ) : (
          <fieldset className="flex flex-col gap-3" disabled={update.isPending}>
            <legend className="sr-only">What doesn&rsquo;t need your approval here</legend>
            {KINDS.map((k) => (
              <CheckboxItem
                key={k.value}
                label={k.label}
                description={k.description}
                checked={on.has(k.value)}
                onCheckedChange={(checked) => toggle(k.value, checked === true)}
              />
            ))}
          </fieldset>
        )}
      </CardContent>
    </Card>
  );
}
