import type { Metadata } from "next";
import Link from "next/link";
import {
  BUSINESS_AI_HELP_PATH,
  businessAgentsLive,
  CONNECTED_APPS_PATH,
  MCP_PATH,
  OAUTH_METADATA_PATH,
  PUBLIC_MCP_PATH,
} from "@/lib/oauth/app-url";
import { HelpArticle, HelpNote, type HelpSection } from "@/components/oauth/help-article";
import {
  chatgptSection,
  claudeSection,
  otherAssistantsSection,
} from "@/components/oauth/help-vendor-sections";
import { ServerUrlField } from "@/components/oauth/server-url-field";

export const metadata: Metadata = {
  title: "Use bookanything in your AI assistant",
  description:
    "Connect bookanything to Claude, ChatGPT or another AI assistant to find businesses, book and manage your bookings by chat.",
  alternates: { canonical: "/help/ai-assistant" },
};

const SECTIONS: HelpSection[] = [
  {
    id: "what-it-does",
    title: "What it can do",
    body: (
      <ul>
        <li>
          <strong>Find businesses and free times</strong> on bookanything, like &ldquo;a physio in Galway on
          Thursday morning&rdquo;.
        </li>
        <li>
          <strong>Book for you, as you.</strong> For paid bookings you get a secure link to pay on
          bookanything yourself. The assistant never sees your card details.
        </li>
        <li>
          <strong>See, move and cancel your bookings.</strong> Before cancelling it shows you any refund.
        </li>
      </ul>
    ),
  },
  {
    id: "you-approve",
    title: "You approve everything it does",
    body: (
      <>
        <p>
          The assistant only prepares a booking, a move or a cancellation. It shows you what will happen and
          gives you a link: open it, check it on bookanything and tap approve. Nothing happens until you do,
          and the assistant can&rsquo;t approve it for you. You also get a notification, and everything
          waiting is under <Link href="/my/approvals">Approvals</Link>.
        </p>
        <p>
          If you&rsquo;d rather just say yes in the chat, you can let your assistants book, move or cancel
          once you agree there, in <Link href={CONNECTED_APPS_PATH}>Connected apps</Link>.
        </p>
      </>
    ),
  },
  {
    id: "server-url",
    title: "Your server URL",
    body: (
      <>
        <p>
          Every assistant asks for the same thing: the address of the bookanything server. Copy it and paste
          it where the steps below say &ldquo;server URL&rdquo;.
        </p>
        <ServerUrlField path={MCP_PATH} label="Your server URL" className="mt-4" />
        <p>
          The first time you use it, the assistant opens bookanything so you can sign in and approve what it
          may do.
        </p>
        <BusinessAgentsNote />
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
          Only approve apps you trust, and read the permissions on the approval page before you allow them.
        </li>
        <li>Nothing is booked, moved or cancelled until you approve it on bookanything.</li>
        <li>
          You can disconnect an assistant at any time in{" "}
          <Link href={CONNECTED_APPS_PATH}>My account › Connected apps</Link>. It loses access straight away.
        </li>
      </ul>
    ),
  },
  {
    id: "developers",
    title: "For developers",
    body: (
      <>
        <p>A read-only server for searching businesses and availability works without signing in:</p>
        <ServerUrlField path={PUBLIC_MCP_PATH} label="Read-only server URL" className="mt-4" />
        <p>
          The signed-in server uses OAuth: authorization server metadata is published at{" "}
          <code className="font-mono text-[0.875em]">{OAUTH_METADATA_PATH}</code>, the authorization code flow
          requires PKCE with <code className="font-mono text-[0.875em]">S256</code>, and clients can identify
          themselves with a client ID metadata document or register with dynamic client registration.
        </p>
      </>
    ),
  },
];

/** Points business members to their own guide, once the business server is live. */
function BusinessAgentsNote() {
  if (!businessAgentsLive()) return null;
  return (
    <HelpNote>
      Run a business on bookanything? Your team&rsquo;s agents use a different server:{" "}
      <Link href={BUSINESS_AI_HELP_PATH}>Run your business from your AI agent</Link>.
    </HelpNote>
  );
}

export default function AiAssistantHelpPage() {
  return (
    <HelpArticle
      title="Use bookanything in your AI assistant"
      lead="Connect bookanything to Claude, ChatGPT or another AI assistant, then find, book and manage appointments just by asking."
      sections={SECTIONS}
    />
  );
}
