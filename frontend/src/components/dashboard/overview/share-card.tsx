"use client";

import Link from "next/link";
import { Copy, ExternalLink, Globe } from "lucide-react";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { copyText } from "@/lib/utils";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { toast } from "@/components/ui/toast";

/** The public booking page's link (copy, open) and whether it is live. */
export function ShareCard() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const url = `${origin}/${business.slug}`;
  const display = url.replace(/^https?:\/\//, "");
  const draft = business.status !== "active";
  return (
    <Card>
      <CardHeader>
        <CardTitle headingLevel={2} className="flex items-center gap-2">
          Booking page
          {draft ? (
            <Badge tone="warning">Draft</Badge>
          ) : (
            <Badge tone="success" dot>
              Live
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {draft
            ? "Only your team can see it until you publish."
            : "Add the link to your website, Instagram or Google profile."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-sunken py-1 pr-1 pl-3">
          <Globe className="size-4 shrink-0 text-subtle-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{display}</span>
          <IconButton
            label="Copy link"
            size="sm"
            onClick={() => {
              void copyText(url);
              toast.success("Link copied");
            }}
          >
            <Copy />
          </IconButton>
          <IconButton
            label="Open booking page"
            size="sm"
            onClick={() => window.open(`/${business.slug}`, "_blank", "noopener")}
          >
            <ExternalLink />
          </IconButton>
        </div>
        {draft && perms.manageSettings && (
          <Button asChild size="sm" variant="secondary" className="self-start">
            <Link href={dashboardHref(business.slug, "settings/general")}>Publish settings</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
