/** Pure helpers for the AI site builder panel. */
import type { SiteAiStatus, SiteVersion } from "@/lib/api/types";
import { canUseCredits } from "@/lib/ai/credits";

/**
 * Whether AI generation and edits are available: always with the built-in designer (no model, nothing to spend),
 * otherwise while the business has AI credits left.
 */
export function canUseSiteAi(ai: SiteAiStatus): boolean {
  return !ai.model || canUseCredits(ai.credits);
}

/** Starting points for conversational edits. */
export const EDIT_SUGGESTIONS = [
  "Make it warmer",
  "Add a FAQ about parking",
  "Move reviews higher",
  "Use the bold theme",
  "Make the headline shorter",
];

/** AI versions (generate/edit), newest first: the instruction history. */
export function aiHistory(versions: SiteVersion[]): SiteVersion[] {
  return versions
    .filter((v) => v.source === "ai_generate" || v.source === "ai_edit")
    .sort((a, b) => b.version - a.version);
}

export const VERSION_SOURCE_LABELS: Record<SiteVersion["source"], string> = {
  owner: "Edited",
  ai_generate: "Generated with AI",
  ai_edit: "AI edit",
  restore: "Restored",
  template: "Starting design",
  seed: "Demo design",
};
