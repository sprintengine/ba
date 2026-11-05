"use client";

import Link from "next/link";
import { ArrowUpRight, Bot } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useUpdateBusiness } from "@/lib/api/hooks";
import type { AgentChangeKind, AiAgentsAccess, UpdateBusiness } from "@/lib/api/types";
import { useBusinessContext } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { BUSINESS_AI_HELP_PATH, BUSINESS_MCP_PATH, CONNECTED_APPS_PATH } from "@/lib/oauth/app-url";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckboxItem } from "@/components/ui/checkbox";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { toast } from "@/components/ui/toast";
import { ServerUrlField } from "@/components/oauth/server-url-field";
import { SettingsCard, SettingsHeader } from "./settings-common";

/** Who may use agents; "Nobody" says Bo carries on where the deployment offers it. */
function accessOptions(
  assistantAvailable: boolean,
): { value: AiAgentsAccess; label: string; description: string }[] {
  return [
    {
      value: "admins",
      label: "Owners and admins",
      description: "Whoever runs the business can use their agent here. Staff can't.",
    },
    {
      value: "team",
      label: "Everyone on the team",
      description: "Staff too, with the same access they have here: their own calendar and its customers.",
    },
    {
      value: "off",
      label: "Nobody",
      description: assistantAvailable
        ? "Every agent is stopped. The assistant in the dashboard isn't affected."
        : "Every agent is stopped.",
    },
  ];
}

/** The kinds of change an owner can let agents make without approval here, in the order they're listed. */
const KINDS: {
  value: AgentChangeKind;
  label: string;
  description: (v: ReturnType<typeof useVocabulary>["v"]) => string;
}[] = [
  {
    value: "records",
    label: "Notes and customer details",
    description: (v) => `Notes on ${v("bookings")}, adding and editing ${v("customers")}.`,
  },
  {
    value: "bookings",
    label: "New and moved bookings",
    description: (v) =>
      `New ${v("bookings")}, moves, approving requests, marking outcomes and payments, sending payment links.`,
  },
  {
    value: "time_off",
    label: "Time off and closures",
    description: () => "Blocking time, closing dates, and taking them back.",
  },
  {
    value: "cancellations",
    label: "Cancellations",
    description: (v) => `Cancelling ${v("bookings")} and declining requests. These can refund customers.`,
  },
  {
    value: "settings",
    label: "Opening hours, services and deals",
    description: () => "Changing hours, service prices and durations, pausing deals.",
  },
];

/**
 * Settings → AI agents (§20.7, §20.8): who may run this business from their own AI apps, which of their changes go
 * ahead without approval here, and how to connect. Only an owner changes the rules; admins see them. Only offered
 * where the deployment serves the business MCP (`aiAgentsAvailable`).
 */
export function AiAgentsSettings() {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const update = useUpdateBusiness(business.id);
  const isOwner = business.myRole === "owner";
  const access = business.aiAgentsAccess ?? "admins";
  const auto = new Set(business.aiAgentsAutoApprove ?? []);

  if (!business.aiAgentsAvailable) {
    return (
      <>
        <SettingsHeader segment="ai-agents" />
        <Card>
          <EmptyState
            icon={<Bot />}
            title="Not available yet"
            description={
              business.assistantAvailable
                ? "Connecting your own AI agents isn't switched on for bookanything yet. The assistant in the dashboard works as usual."
                : "Connecting your own AI agents isn't switched on for bookanything yet."
            }
          />
        </Card>
      </>
    );
  }

  const save = async (patch: UpdateBusiness, message: string) => {
    try {
      await update.mutateAsync(patch);
      toast.success(message);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const setKind = (kind: AgentChangeKind, on: boolean) => {
    const next = KINDS.map((k) => k.value).filter((k) => (k === kind ? on : auto.has(k)));
    void save(
      { aiAgentsAutoApprove: next },
      on ? "Agents can make these without approval" : "These need approval again",
    );
  };

  const ownerOnly = isOwner ? null : (
    <p className="text-sm text-muted-foreground">Only an owner can change this.</p>
  );

  return (
    <>
      <SettingsHeader segment="ai-agents" />
      <div className="flex flex-col gap-6">
        <SettingsCard
          title="Who can use AI agents"
          description="Agents act with the same role the person has here."
        >
          <RadioGroup
            aria-label="Who can use AI agents"
            value={access}
            disabled={!isOwner || update.isPending}
            onValueChange={(value) =>
              void save({ aiAgentsAccess: value as AiAgentsAccess }, "Saved who can use AI agents")
            }
            className="flex flex-col gap-3"
          >
            {accessOptions(!!business.assistantAvailable).map((a) => (
              <RadioItem
                key={a.value}
                id={`ai-access-${a.value}`}
                value={a.value}
                label={a.label}
                description={a.description}
                disabled={!isOwner}
              />
            ))}
          </RadioGroup>
          {ownerOnly}
        </SettingsCard>

        <SettingsCard
          title="Approving changes"
          description="By default, an agent prepares a change and the person approves it here, through a link. Tick what they can approve in their AI app instead."
        >
          <fieldset className="flex flex-col gap-3" disabled={!isOwner || update.isPending}>
            <legend className="sr-only">Changes that don&rsquo;t need approval here</legend>
            {KINDS.map((k) => (
              <CheckboxItem
                key={k.value}
                label={k.label}
                description={k.description(v)}
                checked={auto.has(k.value)}
                disabled={!isOwner || update.isPending}
                onCheckedChange={(on) => setKind(k.value, on === true)}
              />
            ))}
          </fieldset>
          <p className="text-sm text-muted-foreground">
            A change to several {v("bookings")} at once always needs approval here. Everything an agent
            changes is in the activity log, marked as done by AI with the app&rsquo;s name.
          </p>
          {ownerOnly}
        </SettingsCard>

        <SettingsCard
          title="Connect your agent"
          description="Add this address to your AI app as a custom connector, then sign in and approve it. One connection covers every business you belong to."
        >
          <ServerUrlField path={BUSINESS_MCP_PATH} label="Business server URL" />
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Button asChild variant="link" className="px-0">
              <Link href={BUSINESS_AI_HELP_PATH} target="_blank" rel="noopener">
                Step-by-step for Claude and ChatGPT <ArrowUpRight />
              </Link>
            </Button>
            <Button asChild variant="link" className="px-0">
              <Link href={dashboardHref(business.slug, "approvals")}>Your agents&rsquo; requests</Link>
            </Button>
            <Button asChild variant="link" className="px-0">
              <Link href={CONNECTED_APPS_PATH}>Your connected apps</Link>
            </Button>
          </div>
        </SettingsCard>
      </div>
    </>
  );
}
