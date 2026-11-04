/** AI credits and usage (architecture §16). Credits have two decimals. */

export type AiFeature = "business_draft" | "site_generate" | "site_edit" | "assistant";

/** A business's AI credits this month (embedded in the site and assistant states). */
export type AiCredits = {
  limit: number;
  used: number;
  remaining: number;
  /** A fifth or less of the allowance left. */
  runningLow: boolean;
  /** Used up (and no metered overage): AI requests answer 409 `AI_LIMIT_REACHED`. */
  limitReached: boolean;
  /** YYYY-MM-DD, the first day of the next period. */
  resetsOn: string;
  /** Usage past the allowance is billed as metered overage instead of refused. */
  overage: boolean;
};

/** `GET /businesses/{id}/ai/usage` (owner/admin). */
export type AiUsage = {
  plan: "free" | "pro" | "business";
  timezone: string;
  periodStart: string;
  /** Last day of the period (inclusive). */
  periodEnd: string;
  credits: AiCredits;
  model: { configured: boolean; name: string | null };
  byFeature: { feature: AiFeature; label: string; credits: number; requests: number }[];
  /** Every day from the start of the period to today. */
  daily: { date: string; credits: number }[];
};
