/** API types: Health, payments, billing. Import them from `@/lib/api/types`. */
import type { ManagedBooking, Payment } from "./bookings";
import type { PublicBusiness } from "./business";
import type { PaidPlan, Plan } from "./common";

/** `GET /health` (503 with `database: "unavailable"` when the DB is down). */
export type Health = { status: "ok"; database: "ok" | "unavailable" };

export type CheckoutUrl = { checkoutUrl: string };
export type UrlResponse = { url: string };
export type RedirectUrl = { redirectUrl: string };
export type ReturnUrlInput = { returnUrl: string };

export type DevPaymentOutcome = "succeeded" | "cancelled";

/** `GET /public/dev-payments/{paymentId}` (development only). Shape is a best guess from §6.1. */
export type DevPaymentInfo = { payment: Payment; booking: ManagedBooking; business: PublicBusiness };

export type PaymentProviderName = "stripe" | "dev" | "none";

/** `GET /payments/status` */
export type PaymentsStatus = {
  provider: PaymentProviderName;
  connected: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
};

/** Price list entry in `BillingInfo.prices` (§6.8 elides it; mirrors the backend, which includes "free"). */
export type BillingPrice = {
  plan: Plan;
  name?: string;
  amountCents: number;
  currency: string;
  interval: "month" | "year";
  features?: string[];
};

/** `GET /billing` */
export type BillingInfo = {
  plan: Plan;
  /** Subscription status (Stripe-style, e.g. `active`, `past_due`, `canceled`). */
  status: string;
  usage: {
    bookingsThisMonth: number;
    /** null = unlimited. */
    limit: number | null;
  };
  prices: BillingPrice[];
};

/** `POST /billing/checkout` */
export type BillingCheckoutInput = { plan: PaidPlan; returnUrl: string };
