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

/** How connecting an existing Stripe account ended (`POST /payments/connect/existing/complete`, or Stripe's return). */
export type ConnectExistingOutcome =
  | "connected"
  | "denied"
  | "expired"
  | "invalid"
  | "forbidden"
  | "already_connected"
  | "account_in_use"
  | "currency"
  | "failed";

/** `POST /payments/connect/existing/complete` */
export type ConnectExistingInput = { state: string; code: string };
export type ConnectExistingResult = { outcome: ConnectExistingOutcome; currency: string | null };

/** How a Stripe account was linked: created through our onboarding, or an existing account connected with OAuth. */
export type StripeConnectMethod = "created" | "oauth";

/** `GET /payments/status` */
export type PaymentsStatus = {
  provider: PaymentProviderName;
  connected: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  connectMethod: StripeConnectMethod | null;
  /** Whether "I already have a Stripe account" is offered (the server has a Connect client id). */
  canConnectExisting: boolean;
  accountId: string | null;
  /** The account's name in Stripe, when Stripe could be asked. */
  accountName: string | null;
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
