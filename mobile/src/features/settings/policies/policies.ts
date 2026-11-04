/** Choices the website's policies form offers (components/dashboard/settings/policies-settings.tsx). */
import { formatDuration } from "@shared/format";

/** Stripe Checkout sessions last at least 30 minutes, so a shorter hold would release a slot someone is paying for. */
export const STRIPE_MIN_HOLD = 30;

const NOTICE = [0, 30, 60, 120, 240, 720, 1440, 2880, 10080];
const REFUNDS = [0, 25, 50, 75, 100];

export const noticeLabel = (m: number) =>
  m === 0 ? "No notice" : m < 1440 ? formatDuration(m) : `${m / 1440} day${m === 1440 ? "" : "s"}`;

export const refundLabel = (p: number) => (p === 0 ? "No refund" : p === 100 ? "Full refund" : `${p}%`);

/** The list's values plus [current] (a value set elsewhere stays choosable), in order. */
const withCurrent = (list: number[], current: number) =>
  [...new Set([...list, current])].sort((a, b) => a - b);

export const noticeOptions = (current: number) =>
  withCurrent(NOTICE, current).map((m) => ({ value: String(m), label: noticeLabel(m) }));

export const refundOptions = (current: number) =>
  withCurrent(REFUNDS, current).map((p) => ({ value: String(p), label: refundLabel(p) }));
