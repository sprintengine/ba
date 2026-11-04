/**
 * How bots pay for a held booking. The seam is `Payer`:
 *
 * - `dev` (phase 1): the development payment provider's checkout (`/dev/checkout/{paymentId}`), completed through
 *   `POST /v1/public/dev-payments/{paymentId}/complete` with `succeeded` or `cancelled`, as its page does.
 * - `stripe-checkout` (staging): real Stripe Checkout in test mode, driven by Playwright with the 4242 test card, for a
 *   share of paid bookings (`--stripe-share`); the others are abandoned (their hold lapses) or cancelled. Stripe then
 *   confirms through its webhook, so the booking is confirmed a little after the redirect. Not verified until staging
 *   exists: it needs Playwright (`npx playwright install chromium`) and Stripe test keys on the staging backend.
 */
import { publicApi } from "@shared/api/public";
import type { Rng } from "./rng";

export type PayResult = "paid" | "cancelled" | "unsupported";

export interface Payer {
  readonly name: string;
  /** Whether a paid booking is confirmed by the time the checkout returns (else a webhook confirms it later). */
  readonly confirmsAtOnce: boolean;
  /** The shortest hold the provider allows (the backend lengthens shorter ones to it). */
  readonly minHoldMinutes: number;
  /** Whether this bot pays this checkout (the rest are abandoned or cancelled). */
  willPay(rng: Rng): boolean;
  /** Pays (or, with `cancel`, backs out of) the checkout at [checkoutUrl]. */
  complete(checkoutUrl: string, outcome: "succeeded" | "cancelled"): Promise<PayResult>;
  close(): Promise<void>;
}

/** The payment id in a dev checkout link (`.../dev/checkout/{paymentId}`), or null for any other link. */
export function devPaymentId(checkoutUrl: string): string | null {
  const match = /\/dev\/checkout\/([0-9a-f-]{36})/i.exec(checkoutUrl);
  return match?.[1] ?? null;
}

export class DevPayer implements Payer {
  readonly name = "dev";
  readonly confirmsAtOnce = true;
  readonly minHoldMinutes = 0;
  willPay(rng: Rng): boolean {
    return rng.chance(0.75);
  }
  async complete(checkoutUrl: string, outcome: "succeeded" | "cancelled"): Promise<PayResult> {
    const paymentId = devPaymentId(checkoutUrl);
    if (!paymentId) return "unsupported";
    await publicApi.completeDevPayment(paymentId, outcome);
    return outcome === "succeeded" ? "paid" : "cancelled";
  }
  async close() {}
}

type Browser = {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
};
type PlaywrightLocator = {
  fill(v: string): Promise<void>;
  click(): Promise<void>;
  first(): PlaywrightLocator;
};
type PlaywrightPage = {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  locator(selector: string): PlaywrightLocator;
  waitForURL(test: (url: URL) => boolean, opts?: { timeout?: number }): Promise<void>;
  close(): Promise<void>;
};

/** Stripe's test card that always succeeds. */
const TEST_CARD = { number: "4242 4242 4242 4242", expiry: "12 / 34", cvc: "424", name: "Sim Customer" };

export class StripeCheckoutPayer implements Payer {
  readonly name = "stripe-checkout";
  readonly confirmsAtOnce = false;
  // The backend's StripePaymentProvider.MIN_HOLD_MINUTES.
  readonly minHoldMinutes = 31;
  private browser: Browser | null = null;

  constructor(private readonly share: number) {}

  willPay(rng: Rng): boolean {
    return rng.chance(this.share);
  }

  private async launch(): Promise<Browser> {
    if (this.browser) return this.browser;
    let chromium: { launch(opts: { headless: boolean }): Promise<Browser> };
    try {
      // Optional: only staging runs that pay through Stripe need Playwright.
      const name: string = "playwright";
      ({ chromium } = (await import(/* @vite-ignore */ name)) as { chromium: typeof chromium });
    } catch {
      throw new Error(
        "--payments stripe-checkout needs Playwright: npm install --no-save playwright && npx playwright install chromium",
      );
    }
    this.browser = await chromium.launch({ headless: true });
    return this.browser;
  }

  async complete(checkoutUrl: string, outcome: "succeeded" | "cancelled"): Promise<PayResult> {
    if (outcome === "cancelled") return "cancelled"; // Abandoning a Stripe checkout is not paying it: the hold lapses.
    const browser = await this.launch();
    const page = await browser.newPage();
    try {
      await page.goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.locator("#email").first().fill(`sim+${Date.now()}@example.test`);
      await page.locator("#cardNumber").first().fill(TEST_CARD.number);
      await page.locator("#cardExpiry").first().fill(TEST_CARD.expiry);
      await page.locator("#cardCvc").first().fill(TEST_CARD.cvc);
      await page.locator("#billingName").first().fill(TEST_CARD.name);
      await page
        .locator('[data-testid="hosted-payment-submit-button"], button[type="submit"]')
        .first()
        .click();
      // Back on our manage page (`?payment=succeeded`) once Stripe has taken the payment.
      await page.waitForURL((url) => url.searchParams.get("payment") === "succeeded", { timeout: 90_000 });
      return "paid";
    } finally {
      await page.close();
    }
  }

  async close() {
    await this.browser?.close();
    this.browser = null;
  }
}

export function payerFor(mode: "dev" | "stripe-checkout", stripeShare: number): Payer {
  return mode === "dev" ? new DevPayer() : new StripeCheckoutPayer(stripeShare);
}
