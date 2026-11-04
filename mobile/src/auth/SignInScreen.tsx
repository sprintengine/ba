import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEMO_ACCOUNTS, devSubForEmail } from "@shared/auth/dev-token";
import { env } from "~/config/env";
import { BrandMark } from "~/shell/BrandMark";
import { Button, Card, Divider, ListRow, Text, TextField, useTheme } from "~/ui";
import { layout, space } from "~/ui/tokens";
import { devSignIn } from "./dev-session";
import { afterSignIn } from "./return-to";

/**
 * Sign-in: Clerk's hosted pages in production, the demo accounts and any email in development. Then the link that
 * asked for it (`?returnTo=/invitations/abc`, `RequireSignIn`), the screen it was opened over, or home.
 */
export function SignInScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space[12], paddingBottom: insets.bottom + space[6] },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <BrandMark size={40} />
        <Text variant="body" tone="muted">
          Book anything, and run your bookings, from your pocket.
        </Text>
        {env.authMode === "clerk" ? (
          <ClerkSignInLazy returnTo={returnTo} />
        ) : (
          <DevSignIn returnTo={returnTo} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Clerk's hosted sign-in, loaded only in builds that use Clerk. */
function ClerkSignInLazy({ returnTo }: { returnTo?: string }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ClerkSignIn } = require("./ClerkSignIn") as typeof import("./ClerkSignIn");
  return <ClerkSignIn returnTo={returnTo} />;
}

/** Development: sign in as a seeded demo account or any email (architecture §3.2; the website's dev sign-in). */
function DevSignIn({ returnTo }: { returnTo?: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const signIn = (identity: { sub: string; email: string; name: string }) => {
    devSignIn(identity);
    afterSignIn(returnTo);
  };
  const submit = () => {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setError("Enter an email address like you@example.com.");
      return;
    }
    signIn({ sub: devSubForEmail(trimmed), email: trimmed, name: name.trim() });
  };
  return (
    <View style={styles.actions}>
      <Text variant="footnote" tone="subtle">
        Development sign-in against {env.apiUrl}. The backend must run with AUTH_MODE=dev.
      </Text>
      <Card padding={0}>
        {DEMO_ACCOUNTS.map((account, i) => (
          <View key={account.sub}>
            {i > 0 ? <Divider inset={space[4]} /> : null}
            <ListRow
              testID={`dev-sign-in-${account.sub}`}
              title={`${account.role}: ${account.name}`}
              subtitle={account.description}
              onPress={() => signIn(account)}
            />
          </View>
        ))}
      </Card>
      <Text variant="caption" tone="subtle">
        OR ANY EMAIL
      </Text>
      <TextField
        label="Email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setError(null);
        }}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        error={error}
        testID="dev-email"
      />
      <TextField
        label="Name (optional)"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        testID="dev-name"
      />
      <Button label="Sign in" fullWidth onPress={submit} testID="dev-sign-in-submit" />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    paddingHorizontal: space[5],
    gap: space[4],
    width: "100%",
    maxWidth: layout.formWidth,
    alignSelf: "center",
  },
  actions: { gap: space[3], marginTop: space[4] },
});
