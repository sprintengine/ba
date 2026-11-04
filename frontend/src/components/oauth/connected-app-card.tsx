"use client";

import { CornerDownLeft, Globe, Unplug } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useRevokeConnectedApp } from "@/lib/api/hooks";
import type { ConnectedApp } from "@/lib/api/types";
import { urlHost } from "@/lib/oauth/app-url";
import { formatConnectedAt, formatLastUsed } from "@/lib/oauth/format";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { scopeIcon } from "./scope-list";

/** One connected app: who it is, what it may do, when it was used, and Disconnect. */
export function ConnectedAppCard({ app, timeZone }: { app: ConnectedApp; timeZone: string }) {
  const revoke = useRevokeConnectedApp();
  const website = urlHost(app.clientUri);

  async function disconnect() {
    try {
      await revoke.mutateAsync(app.id);
      toast.success(`${app.name} disconnected`);
    } catch (err) {
      toast.error(errorMessage(err, `We couldn't disconnect ${app.name}. Please try again.`));
    }
  }

  return (
    <Card className="flex-row items-start gap-4 p-4 sm:p-5">
      <Avatar name={app.name} size="lg" shape="square" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-base font-semibold tracking-tight">{app.name}</h2>
            <Badge tone={app.audience === "business" ? "brand" : "neutral"} className="shrink-0">
              {app.audience === "business" ? "Your businesses" : "Your bookings"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {website && (
              <span className="inline-flex items-center gap-1.5">
                <Globe className="size-3.5" aria-hidden />
                {website}
              </span>
            )}
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <CornerDownLeft className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">Returns to {app.redirectHost}</span>
            </span>
          </div>
        </div>
        {app.scopes.length > 0 && (
          <ul aria-label="Permissions" className="flex flex-wrap gap-1.5">
            {app.scopes.map((scope) => {
              const Icon = scopeIcon(scope.key);
              return (
                <li key={scope.key}>
                  <Badge tone="neutral" title={scope.description}>
                    <Icon aria-hidden />
                    {scope.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-subtle-foreground">
          {formatConnectedAt(app.connectedAt, timeZone)} · {formatLastUsed(app.lastUsedAt, timeZone)}
        </p>
      </div>
      <ConfirmDialog
        destructive
        title={`Disconnect ${app.name}?`}
        description={
          app.audience === "business"
            ? `${app.name} will lose access to your businesses straight away. What it already changed stays as it is, and you can connect it again from the app at any time.`
            : `${app.name} will lose access to your bookanything account straight away. Your bookings stay as they are, and you can connect it again from the app at any time.`
        }
        confirmLabel="Disconnect"
        loading={revoke.isPending}
        onConfirm={disconnect}
        trigger={
          <Button variant="secondary" size="sm" className="shrink-0" aria-label={`Disconnect ${app.name}`}>
            <Unplug />
            <span className="hidden sm:inline">Disconnect</span>
          </Button>
        }
      />
    </Card>
  );
}
