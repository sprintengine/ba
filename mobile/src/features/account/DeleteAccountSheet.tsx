import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTeam } from "@shared/api/hooks/use-team";
import type { Me } from "@shared/api/types";
import { useAuth } from "@shared/auth/context";
import { AccountDeletionError } from "~/auth/account-deletion";
import { Banner, Button, Sheet, Text, TextField, useToast } from "~/ui";
import { space } from "~/ui/tokens";

type Membership = Me["memberships"][number];

/** Typing DELETE (any case) or the account's email confirms. */
export function confirmsDeletion(typed: string, email: string | null): boolean {
  const value = typed.trim().toLowerCase();
  return value === "delete" || (!!email && value === email.trim().toLowerCase());
}

/**
 * Deleting the account, after saying what happens (what the backend does on Clerk's `user.deleted`:
 * `ClerkEventHandler`) and warning an owner whose business would be left without one. Confirmed by typing DELETE or
 * the email. Once deleted the person is signed out, and the app goes to sign-in.
 */
export function DeleteAccountSheet({
  visible,
  onClose,
  email,
  memberships,
  deleteAccount,
}: {
  visible: boolean;
  onClose: () => void;
  email: string | null;
  memberships: Membership[];
  deleteAccount: () => Promise<void>;
}) {
  const { signOut } = useAuth();
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AccountDeletionError | null>(null);
  const owned = memberships.filter((m) => m.role === "owner");

  const close = () => {
    if (busy) return;
    setTyped("");
    setError(null);
    onClose();
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      toast.show("Your account was deleted");
    } catch (e) {
      setError(
        e instanceof AccountDeletionError
          ? e
          : new AccountDeletionError("failed", "We couldn't delete your account. Please try again."),
      );
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Delete your account?"
      testID="delete-account-sheet"
      footer={
        <View style={styles.actions}>
          <Button label="Keep my account" variant="secondary" onPress={close} disabled={busy} />
          <Button
            testID="delete-account-submit"
            label="Delete my account"
            variant="destructive"
            disabled={!confirmsDeletion(typed, email)}
            loading={busy}
            onPress={() => void submit()}
          />
        </View>
      }
    >
      <Text>This permanently deletes your bookanything account and signs you out. It can't be undone.</Text>
      {owned.map((m) => (
        <OwnerWarning key={m.businessId} membership={m} />
      ))}
      <View style={styles.list} testID="delete-account-consequences">
        <Point>You can't sign in to this account again, and your name and email are removed from it.</Point>
        <Point>
          Your connected AI apps are disconnected, and your notifications and AI app requests are deleted.
        </Point>
        {memberships.length > 0 ? (
          <Point>You're removed from the team of every business you belong to.</Point>
        ) : null}
        <Point>
          Your bookings aren't cancelled. The businesses you booked with keep their own records of them, with
          the details you gave them. Cancel any upcoming bookings you won't make first, and ask a business if
          you'd like it to erase your details.
        </Point>
      </View>
      {error ? (
        <Banner
          tone="danger"
          title="Your account wasn't deleted"
          testID="delete-account-error"
          action={
            error.reason === "reverify" ? (
              <Button
                testID="delete-account-sign-out"
                variant="secondary"
                size="sm"
                label="Sign out"
                onPress={() => void signOut()}
              />
            ) : null
          }
        >
          {error.message}
        </Banner>
      ) : null}
      <TextField
        testID="delete-account-confirm"
        label="Type DELETE to confirm"
        hint={email ? `Or type your email, ${email}.` : undefined}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        editable={!busy}
      />
    </Sheet>
  );
}

function Point({ children }: { children: string }) {
  return (
    <View style={styles.point}>
      <Text tone="muted" importantForAccessibility="no" accessibilityElementsHidden>
        •
      </Text>
      <Text tone="muted" style={styles.pointText}>
        {children}
      </Text>
    </View>
  );
}

/**
 * The backend suspends a business whose last active owner deletes their account. The team list says whether this
 * person is the only owner; until it has loaded (or if it can't), the warning says "if".
 */
function OwnerWarning({ membership }: { membership: Membership }) {
  const team = useTeam(membership.businessId);
  const owners = team.data?.filter((m) => m.role === "owner" && m.status === "active").length;
  if (owners !== undefined && owners > 1) return null;
  const consequence =
    "Its booking page goes offline, customers can't book or change their bookings, and its team loses access until our support restores it.";
  return owners === undefined ? (
    <Banner
      tone="warning"
      title={`If you're the only owner of ${membership.name}, it will be suspended`}
      testID={`delete-account-owner-${membership.slug}`}
    >
      {`${consequence} Make someone else an owner first if it should carry on.`}
    </Banner>
  ) : (
    <Banner
      tone="danger"
      title={`${membership.name} will be suspended`}
      testID={`delete-account-owner-${membership.slug}`}
    >
      {`You're its only owner. ${consequence} Make someone else an owner in Team first if it should carry on.`}
    </Banner>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space[2], flexWrap: "wrap" },
  list: { gap: space[2] },
  point: { flexDirection: "row", gap: space[2] },
  pointText: { flex: 1 },
});
