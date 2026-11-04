import type { Metadata } from "next";
import Link from "next/link";
import {
  AI_HELP_PATH,
  BUSINESS_AI_HELP_PATH,
  BUSINESS_MCP_PATH,
  businessAgentsLive,
  CONNECTED_APPS_PATH,
  OAUTH_METADATA_PATH,
} from "@/lib/oauth/app-url";
import { HelpArticle, HelpNote, type HelpSection } from "@/components/oauth/help-article";
import {
  chatgptSection,
  claudeSection,
  otherAssistantsSection,
} from "@/components/oauth/help-vendor-sections";
import { ServerUrlField } from "@/components/oauth/server-url-field";

export const metadata: Metadata = {
  // Not indexed until the business server is switched on (it answers 404 meanwhile).
  ...(businessAgentsLive() ? {} : { robots: { index: false, follow: true } }),
  title: "Run your business from your AI agent",
  description:
    "Connect bookanything to Claude, ChatGPT or another AI agent to check your schedule, manage bookings and customers, and block time, with every change approved by you.",
  alternates: { canonical: BUSINESS_AI_HELP_PATH },
};

const SECTIONS: HelpSection[] = [
  {
    id: "what-it-does",
    title: "What it can do",
    body: (
      <>
        <ul>
          <li>
            <strong>Answer questions about your business</strong>, like &ldquo;who&rsquo;s in tomorrow
            morning?&rdquo;, &ldquo;when is Jordan free on Friday?&rdquo; or &ldquo;how did last month
            go?&rdquo;.
          </li>
          <li>
            <strong>Handle bookings:</strong> book a client in, move or cancel bookings, approve or decline
            requests, mark a booking completed or a no-show, record a payment taken at the venue and send a
            payment link.
          </li>
          <li>
            <strong>Keep your diary right:</strong> block time off, take it back, close a date and change
            opening hours.
          </li>
          <li>
            <strong>Look after your clients:</strong> find a client, see their bookings, add someone new and
            update their details.
          </li>
          <li>
            <strong>For owners and admins:</strong> reports, prices and lengths of services, and pausing or
            resuming deals.
          </li>
        </ul>
        <p>
          It works as you, with your role at each business. Staff see and change only their own calendar, and
          the agent can&rsquo;t do anything you couldn&rsquo;t do in the dashboard.
        </p>
      </>
    ),
  },
  {
    id: "you-confirm",
    title: "Changes wait for your approval",
    body: (
      <>
        <p>
          Looking things up happens straight away. A change is only prepared: the agent shows you what will
          happen (which bookings, the refund, the new time) and gives you a link. Open it, check the change on
          bookanything and tap approve. Nothing happens until you do, and the agent can&rsquo;t approve it for
          you. You also get a notification (in the bell, and by email unless you turn that off). The agent can
          see the result afterwards, so just tell it you&rsquo;re done.
        </p>
        <p>
          The owner can let agents make some kinds of change, like notes or time off, once you say yes in the
          AI app instead. Changes to several bookings at once always come here for approval. Everything
          waiting for you shows in the bell, with a link to approve it; a request expires after a day.
        </p>
        <p>Only connect agents you trust: they act as you.</p>
      </>
    ),
  },
  {
    id: "server-url",
    title: "Your server URL",
    body: (
      <>
        <p>
          Your agent needs the address of the bookanything business server. Copy it and paste it where the
          steps below say &ldquo;server URL&rdquo;.
        </p>
        <ServerUrlField path={BUSINESS_MCP_PATH} label="Business server URL" className="mt-4" />
        <p>
          The first time you use it, the agent opens bookanything so you can sign in and approve what it may
          do. One connection covers every business you belong to: tell the agent which one you mean.
        </p>
        <HelpNote>
          Booking appointments for yourself is a different server. See{" "}
          <Link href={AI_HELP_PATH}>Use bookanything in your AI assistant</Link>.
        </HelpNote>
      </>
    ),
  },
  claudeSection,
  chatgptSection,
  otherAssistantsSection,
  {
    id: "stay-in-control",
    title: "Stay in control",
    body: (
      <ul>
        <li>
          Owners and admins can use agents from the start. In <strong>Settings › AI agents</strong> the owner
          decides who may: owners and admins, the whole team, or nobody. Turning them off stops every
          member&rsquo;s agent at once; the assistant in the dashboard keeps working.
        </li>
        <li>
          Everything an agent changes is in the business&rsquo;s activity log, marked as done by AI with the
          app&rsquo;s name.
        </li>
        <li>
          You can disconnect an agent at any time in{" "}
          <Link href={CONNECTED_APPS_PATH}>My account › Connected apps</Link>. It loses access straight away.
        </li>
        <li>
          Clients&rsquo; names, notes and answers are information, not instructions: the agent is told never
          to follow instructions written in them. Sensitive answers are never shown to it.
        </li>
      </ul>
    ),
  },
  {
    id: "developers",
    title: "For developers",
    body: (
      <p>
        The business server is a Streamable HTTP MCP server using OAuth with its own resource and scopes (
        <code className="font-mono text-[0.875em]">business:read</code>,{" "}
        <code className="font-mono text-[0.875em]">business:write</code>). Authorization server metadata is
        published at <code className="font-mono text-[0.875em]">{OAUTH_METADATA_PATH}</code>; PKCE with{" "}
        <code className="font-mono text-[0.875em]">S256</code> is required, and clients can identify
        themselves with a client ID metadata document or register with dynamic client registration. Tools that
        change anything return a proposal. One with status{" "}
        <code className="font-mono text-[0.875em]">awaiting_approval</code> goes ahead only when the person
        approves it at its <code className="font-mono text-[0.875em]">approvalUrl</code>; check it with{" "}
        <code className="font-mono text-[0.875em]">get_proposal</code>. One with status{" "}
        <code className="font-mono text-[0.875em]">awaiting_confirmation</code> (a kind of change the business
        lets agents make) goes ahead with <code className="font-mono text-[0.875em]">confirm_action</code>.
      </p>
    ),
  },
];

export default function BusinessAgentsHelpPage() {
  return (
    <HelpArticle
      title="Run your business from your AI agent"
      lead="Connect bookanything to Claude, ChatGPT or another AI agent, then check your schedule, manage bookings and clients, and block time, just by asking. Every change waits for your yes."
      sections={SECTIONS}
    />
  );
}
