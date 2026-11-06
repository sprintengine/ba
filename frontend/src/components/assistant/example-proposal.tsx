"use client";

import type { AssistantAction } from "@/lib/api/types";
import { ExamplePreview } from "@/components/ui/example-preview";
import { ProposalView, type ProposalWhere } from "./proposal-card";

const NOW = "2026-01-01T09:00:00Z";

/** Sample content for the real card, in the shape an assistant's request arrives in. */
const SAMPLE: AssistantAction = {
  id: "example",
  tool: "example",
  status: "pending",
  proposal: {
    title: "Move two bookings to Aoife",
    summary: "Sam is off on Friday afternoon, and Aoife is free at both times.",
    changes: [{ label: "With", before: "Sam", after: "Aoife" }],
    items: [
      { title: "15:30 · Rory", detail: "Follow-up" },
      { title: "16:15 · Jo", detail: "First visit" },
    ],
    warnings: [],
    confirmLabel: "Move both",
    destructive: false,
  },
  result: null,
  error: null,
  expiresAt: NOW,
  createdAt: NOW,
  decidedAt: null,
};

const INERT = { mutate: () => undefined, isPending: false };

/** What an assistant's request looks like when one arrives: the real card, dimmed, on a page with none yet. */
export function ExampleProposal({ where }: { where: ProposalWhere }) {
  return (
    <ExamplePreview>
      <ProposalView action={SAMPLE} confirm={INERT} reject={INERT} retryHint="" where={where} />
    </ExamplePreview>
  );
}
