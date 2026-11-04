/** The website's AI agents choices (components/dashboard/settings/ai-agents-settings.tsx), in its order and words. */
import type { AgentChangeKind, AiAgentsAccess } from "@shared/api/types";
import type { VocabularyKey } from "@shared/vocabulary";

type Words = (key: VocabularyKey) => string;

/**
 * The website's `BUSINESS_MCP_PATH` and `CONNECTED_APPS_PATH` (`@shared/oauth/app-url`, which can't be shared: it reads
 * `window` for the origin). The business MCP server on the website's origin, and the app's connected-apps screen.
 */
export const BUSINESS_MCP_PATH = "/mcp/business";
export const CONNECTED_APPS_PATH = "/my/connected-apps";

/** Who may use agents; "Nobody" says Bo carries on where the deployment offers it (`assistantAvailable`). */
export function accessOptions(
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
export const KINDS: { value: AgentChangeKind; label: string; description: (v: Words) => string }[] = [
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
