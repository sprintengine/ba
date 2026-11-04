/**
 * What's wrong with a service's deposit, if anything. One rule for the dashboard's service editor and onboarding,
 * mirroring the backend's `validateDeposit` (ServiceModels.kt, which `SetupValidation` also runs): in deposit mode a
 * deposit above zero and at most the service's own price (its base price, whatever its options cost); in other modes
 * no negative deposit.
 */
export function depositProblem(s: {
  paymentMode: string;
  priceCents: number;
  depositCents: number | null;
}): string | null {
  if (s.paymentMode !== "deposit") {
    return s.depositCents !== null && s.depositCents < 0 ? "Must not be negative" : null;
  }
  if (s.depositCents === null || s.depositCents <= 0) return "Enter the deposit amount";
  if (s.depositCents > s.priceCents) return "The deposit can't be more than the price";
  return null;
}
