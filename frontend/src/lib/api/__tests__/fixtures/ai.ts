/** AI usage fixtures (§16). */
import type { AiUsage } from "@/lib/api/types";
import { aiCredits } from "./site";

export const aiUsage = {
  plan: "pro",
  timezone: "Europe/Dublin",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  credits: aiCredits,
  model: { configured: true, name: "claude-sonnet" },
  byFeature: [
    { feature: "site_generate", label: "Website builder", credits: 80.25, requests: 3 },
    { feature: "assistant", label: "Assistant", credits: 40.25, requests: 12 },
  ],
  daily: [
    { date: "2026-10-01", credits: 100 },
    { date: "2026-10-02", credits: 20.5 },
  ],
} satisfies AiUsage;

/** No model configured: the deterministic designer answers, nothing is spent. */
export const aiUsageSparse = { ...aiUsage, model: { configured: false, name: null } } satisfies AiUsage;
