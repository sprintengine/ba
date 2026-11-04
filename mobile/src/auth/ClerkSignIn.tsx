import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@shared/api/client";
import { Button, Text } from "~/ui";
import { space } from "~/ui/tokens";
import { afterSignIn } from "./return-to";

/**
 * Production sign-in: Clerk's hosted Account Portal in an authentication browser session (the same sign-in methods
 * and look as the website), then back to the app with the session active, and on to [returnTo] (`afterSignIn`).
 */
export function ClerkSignIn({ returnTo }: { returnTo?: string }) {
  const { startHostedAuth } = useHostedAuth();
  const [busy, setBusy] = useState<"sign-in" | "sign-up" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const start = async (mode: "sign-in" | "sign-up") => {
    setBusy(mode);
    setError(null);
    try {
      const result = await startHostedAuth({ mode });
      if (result.createdSessionId) afterSignIn(returnTo);
    } catch (e) {
      setError(errorMessage(e, "Sign-in didn't finish. Please try again."));
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={styles.actions}>
      <Button
        label="Sign in"
        size="lg"
        fullWidth
        loading={busy === "sign-in"}
        onPress={() => void start("sign-in")}
      />
      <Button
        label="Create an account"
        variant="secondary"
        size="lg"
        fullWidth
        loading={busy === "sign-up"}
        onPress={() => void start("sign-up")}
      />
      {error ? (
        <Text variant="callout" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ actions: { gap: space[3], marginTop: space[4] } });
