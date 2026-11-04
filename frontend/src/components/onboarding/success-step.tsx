"use client";

import { copyText } from "@/lib/utils";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, CreditCard, ExternalLink, Info } from "lucide-react";
import { useConnectPayments, usePaymentsStatus } from "@/lib/api/hooks";
import { errorMessage, isApiError } from "@/lib/api/client";
import { BusinessTile } from "@/components/shells/business-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { CreatedBusiness } from "./draft-storage";
import { PUBLIC_HOST } from "./slug-field";

export function SuccessStep({ business, onLeave }: { business: CreatedBusiness; onLeave: () => void }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const href = `${origin}/${business.slug}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyText(href)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl animate-rise flex-col items-stretch gap-8">
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="relative flex size-16 items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-success/20 [animation-duration:2s] [animation-iteration-count:2] motion-safe:animate-ping"
          />
          <span
            aria-hidden
            className="absolute -inset-3 rounded-full border border-success-border opacity-60"
          />
          <span className="relative flex size-16 items-center justify-center rounded-full bg-success text-success-foreground shadow-button">
            <Check aria-hidden className="size-7 motion-safe:animate-pop-in" strokeWidth={2.5} />
          </span>
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{business.name} is live</h1>
          <p className="text-base text-pretty text-muted-foreground">
            Your booking page is ready. Share the link and customers can book straight away.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-3">
          <BusinessTile name={business.name} color={business.primaryColor} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">Your booking page</p>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="block truncate font-mono text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {PUBLIC_HOST}/{business.slug}
            </a>
          </div>
          <IconButton label={copied ? "Copied" : "Copy link"} variant="secondary" size="md" onClick={copy}>
            {copied ? <Check className="text-success" /> : <Copy />}
          </IconButton>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button asChild variant="secondary" block>
            <a href={href} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open booking page
            </a>
          </Button>
          <Button variant="secondary" block onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Link copied" : "Copy link"}
          </Button>
        </div>
        <span aria-live="polite" className="sr-only">
          {copied ? "Link copied to clipboard" : ""}
        </span>
      </div>

      <PaymentsCard business={business} onLeave={onLeave} />

      <div className="flex flex-col items-center gap-3">
        <Button asChild variant="primary" size="lg" className="w-full sm:w-auto">
          <Link href={`/dashboard/${business.slug}`} onClick={onLeave}>
            Go to dashboard
            <ArrowRight />
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          Invite your team, fine-tune hours and add closures from there.
        </p>
      </div>
    </div>
  );
}

function PaymentsCard({ business, onLeave }: { business: CreatedBusiness; onLeave: () => void }) {
  const status = usePaymentsStatus(business.id, { retry: false });
  const connect = useConnectPayments(business.id);
  const [notConfigured, setNotConfigured] = useState(false);

  async function start() {
    const returnUrl = `${window.location.origin}/dashboard/${business.slug}/settings/payments`;
    try {
      const { url } = await connect.mutateAsync({ returnUrl });
      // Stripe returns to the dashboard; a saved onboarding would reopen this screen on the next visit.
      onLeave();
      window.location.assign(url);
    } catch (err) {
      if (isApiError(err) && err.code === "PAYMENTS_NOT_CONFIGURED") setNotConfigured(true);
      else toast.error(errorMessage(err));
    }
  }

  const provider = notConfigured ? "none" : status.data?.provider;
  const ready = status.data?.chargesEnabled;

  let body: React.ReactNode;
  if (status.isPending && !notConfigured) {
    body = (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3.5 w-full" />
      </div>
    );
  } else if (provider === "none") {
    body = (
      <>
        <CardText title="Online payments aren't available here">
          Online payments aren&rsquo;t configured on this server; paid services stay hidden until they are.
          {business.hasPaidServices ? " Free and pay-at-venue services work as normal." : ""}
        </CardText>
      </>
    );
  } else if (ready) {
    const dev = provider === "dev";
    body = (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CardText
          title="Payments are ready"
          badge={<Badge tone={dev ? "info" : "success"}>{dev ? "Development mode" : "Connected"}</Badge>}
        >
          {dev
            ? "Development payments are on, so you don't need a Stripe account locally. Checkouts use a test page."
            : "Customers can pay online when they book."}
        </CardText>
        <Button variant="secondary" onClick={start} loading={connect.isPending} className="shrink-0">
          Payment settings
          <ArrowRight />
        </Button>
      </div>
    );
  } else {
    const dev = provider === "dev";
    body = (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CardText
          title="Take payments and deposits online"
          badge={
            business.hasPaidServices ? <Badge tone="warning">Needed for paid services</Badge> : undefined
          }
        >
          {dev
            ? "Development payments are on, so you don't need a Stripe account locally."
            : "Connect a Stripe account so customers can pay when they book. It takes about five minutes, and the money goes straight to you."}
        </CardText>
        <Button
          variant={business.hasPaidServices ? "brand" : "secondary"}
          onClick={start}
          loading={connect.isPending}
          className="shrink-0"
        >
          Set up payments
          <ArrowRight />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {provider === "none" ? (
          <Info aria-hidden className="size-4" />
        ) : (
          <CreditCard aria-hidden className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">{body}</div>
    </div>
  );
}

function CardText({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {title}
        {badge}
      </p>
      <p className="text-sm text-pretty text-muted-foreground">{children}</p>
    </div>
  );
}
