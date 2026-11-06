"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useConnectedApps } from "@/lib/api/hooks";
import type { ConnectedApp } from "@/lib/api/types";
import { AI_HELP_PATH } from "@/lib/oauth/app-url";
import { viewerTimeZone } from "@/lib/oauth/format";
import { ErrorState } from "@/components/common/feedback";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ExamplePreview } from "@/components/ui/example-preview";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentSettingsCard } from "./agent-settings-card";
import { ConnectedAppCard } from "./connected-app-card";

/** Sample content for the real card, on a page with no apps yet. */
const EXAMPLE_APP: ConnectedApp = {
  id: "example",
  clientId: "example",
  name: "Your assistant",
  clientUri: null,
  kind: "dynamic",
  redirectHost: "your assistant's app",
  audience: "customer",
  scopes: [
    { key: "bookings:read", label: "See your bookings", description: "" },
    { key: "bookings:write", label: "Book and move them, with your OK", description: "" },
  ],
  connectedAt: "2026-01-01T09:00:00Z",
  lastUsedAt: null,
};

/** /my/connected-apps: apps and AI assistants the person allowed to use their account. */
export function ConnectedAppsPage() {
  const apps = useConnectedApps();
  const timeZone = useMemo(() => viewerTimeZone(), []);

  return (
    <>
      <PageHeader
        back={{ href: "/my/bookings", label: "My bookings" }}
        title="Connected apps"
        description="Apps and AI assistants you've allowed to use your bookanything account. Disconnect one and it loses access straight away."
      />
      {apps.isError ? (
        <ErrorState error={apps.error} onRetry={() => apps.refetch()} />
      ) : !apps.data ? (
        <div className="flex flex-col gap-3" role="status" aria-busy aria-label="Loading connected apps">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : apps.data.length === 0 ? (
        <div className="flex flex-col gap-2">
          <ExamplePreview>
            <ConnectedAppCard app={EXAMPLE_APP} timeZone="UTC" />
          </ExamplePreview>
          <EmptyState
            size="sm"
            headingLevel={2}
            title="No connected apps"
            description="Connect an AI assistant such as Claude or ChatGPT and it shows up here with what it's allowed to do."
            action={
              <Button asChild variant="secondary">
                <Link href={AI_HELP_PATH}>
                  <BookOpen /> How to connect an assistant
                </Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {apps.data.map((app) => (
              <li key={app.id}>
                <ConnectedAppCard app={app} timeZone={timeZone} />
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <AgentSettingsCard />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Want to add another assistant?{" "}
            <Link href={AI_HELP_PATH} className="text-brand underline-offset-4 hover:underline">
              How to connect an assistant
            </Link>
          </p>
        </>
      )}
    </>
  );
}
