"use client";

import { Bot } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useUpdateBusiness } from "@/lib/api/hooks";
import type { AgentChangeKind, AiAgentsAccess, UpdateBusiness } from "@/lib/api/types";
import { useBusinessContext } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { BUSINESS_AI_HELP_PATH, BUSINESS_MCP_PATH, CONNECTED_APPS_PATH } from "@/lib/oauth/app-url";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { LogoMark } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { ServerUrlField } from "@/components/oauth/server-url-field";
import {
  SettingFieldRow,
  SettingGroup,
  SettingLink,
  SettingRow,
  SettingsHeader,
  settingsStack,
} from "./settings-common";

/** The symbol belongs on AI: it sits beside this page's title. */
const AI_MARK = <LogoMark className="h-4.5" weight="small" aria-hidden title="" />;

const ACCESS_CHIP: Record<AiAgentsAccess, string> = {
  admins: "On for owners and admins",
  team: "On for the team",
  off: "Off",
};

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
        <SettingsHeader segment="ai-agents" lede mark={AI_MARK} />
        <SettingGroup title="Your own AI agents">
          <EmptyState
            headingLevel={4}
            icon={<Bot />}
            title="Not available yet"
            description={
              business.assistantAvailable
                ? "Connecting your own AI agents isn't switched on for bookanything yet. The assistant in the dashboard works as usual."
                : "Connecting your own AI agents isn't switched on for bookanything yet."
            }
          />
        </SettingGroup>
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

  const ownerOnly = isOwner ? null : <p>Only an owner can change this.</p>;

  return (
    <>
      <SettingsHeader segment="ai-agents" lede mark={AI_MARK} />
      <div className={settingsStack}>
        <SettingGroup
          title="Who can use AI agents"
          description="Agents act with the same role the person has here."
          action={
            <Badge tone={access === "off" ? "neutral" : "success"} dot>
              {ACCESS_CHIP[access]}
            </Badge>
          }
          note={ownerOnly}
        >
          <RadioGroup
            aria-label="Who can use AI agents"
            value={access}
            disabled={!isOwner || update.isPending}
            onValueChange={(value) =>
              void save({ aiAgentsAccess: value as AiAgentsAccess }, "Saved who can use AI agents")
            }
            className="gap-0 divide-y divide-border-subtle"
          >
            {accessOptions(!!business.assistantAvailable).map((a) => (
              <div key={a.value} className="px-4.5 py-3">
                <RadioItem
                  id={`ai-access-${a.value}`}
                  value={a.value}
                  label={a.label}
                  description={a.description}
                  disabled={!isOwner}
                />
              </div>
            ))}
          </RadioGroup>
        </SettingGroup>

        <SettingGroup
          title="Approving changes"
          description="By default, an agent prepares a change and the person approves it here, through a link. Turn on what they can approve in their AI app instead."
          note={
            <>
              <p>
                A change to several {v("bookings")} at once always needs approval here. Everything an agent
                changes is in the activity log, marked as done by AI with the app&rsquo;s name.
              </p>
              {ownerOnly}
            </>
          }
        >
          {KINDS.map((k) => (
            <SettingFieldRow key={k.value} fit label={k.label} help={k.description(v)}>
              <Switch
                checked={auto.has(k.value)}
                disabled={!isOwner || update.isPending}
                onCheckedChange={(on) => setKind(k.value, on)}
              />
            </SettingFieldRow>
          ))}
        </SettingGroup>

        <SettingGroup title="Connect your agent">
          <SettingRow
            stacked
            label="Business server URL"
            help="Add this address to your AI app as a custom connector, then sign in and approve it. One connection covers every business you belong to."
          >
            <ServerUrlField path={BUSINESS_MCP_PATH} label="Business server URL" />
          </SettingRow>
          <SettingLink external href={BUSINESS_AI_HELP_PATH} label="Step-by-step for Claude and ChatGPT" />
          <SettingLink
            href={dashboardHref(business.slug, "approvals")}
            label={<>Your agents&rsquo; requests</>}
          />
          <SettingLink href={CONNECTED_APPS_PATH} label="Your connected apps" />
        </SettingGroup>
      </div>
    </>
  );
}
