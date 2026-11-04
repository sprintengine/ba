/**
 * Deleting the signed-in account from the app (App Store guideline 5.1.1(v), Google Play's account deletion policy).
 * The auth provider offers it: Clerk deletes the user (its `user.deleted` webhook then anonymises them in our
 * backend, `ClerkEventHandler`); dev auth has no account to delete. Features read `useAccountDeletion()` and never
 * import Clerk.
 */
import { createContext, useContext } from "react";

export type AccountDeletion =
  | {
      available: true;
      /**
       * Deletes the account, then cleans up as a sign-out does (`beforeSignOut` tasks; the cache clears when the user
       * goes) and ends the session here. Rejects with `AccountDeletionError` when it couldn't.
       */
      deleteAccount: () => Promise<void>;
    }
  | { available: false; reason: string };

/** Why deleting failed: `reverify` = the sign-in is too old for it (sign in again first). */
export class AccountDeletionError extends Error {
  constructor(
    readonly reason: "reverify" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "AccountDeletionError";
  }
}

export const REVERIFY_MESSAGE =
  "For your security, deleting your account needs a recent sign-in. Sign out, sign in again, then delete it straight away.";

const AccountDeletionContext = createContext<AccountDeletion>({
  available: false,
  reason: "Deleting your account isn't available in this build.",
});

export const AccountDeletionProvider = AccountDeletionContext.Provider;

export function useAccountDeletion(): AccountDeletion {
  return useContext(AccountDeletionContext);
}
