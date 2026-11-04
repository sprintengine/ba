import type { LocationType, PaymentMode } from "@/lib/api/types";

/** Every payment mode, in picker order (mirrors the backend's `PAYMENT_MODES` in `ServiceModels.kt`). */
export const PAYMENT_MODES: readonly PaymentMode[] = ["full", "deposit", "at_venue", "free"];

/** Every location type (mirrors the backend's `LOCATION_TYPES` in `ServiceModels.kt`). */
export const LOCATION_TYPES: readonly LocationType[] = ["business", "customer", "online"];

/** How a payment mode is described to an owner setting up a service: picker label, short badge, one line of help. */
export const PAYMENT_MODE_COPY: Record<PaymentMode, { label: string; short: string; help: string }> = {
  full: {
    label: "Paid online when booking",
    short: "Paid online",
    help: "Customers pay the full price to confirm.",
  },
  deposit: {
    label: "Deposit online, rest at the venue",
    short: "Deposit",
    help: "A deposit secures the slot.",
  },
  at_venue: { label: "Paid at the venue", short: "Pay at venue", help: "No online payment." },
  free: { label: "Free", short: "Free", help: "No charge." },
};
