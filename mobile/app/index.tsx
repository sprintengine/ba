import { Redirect } from "expo-router";
import { useAuth } from "@shared/auth/context";
import { homeHref, lastVisit, useSignedInMe } from "~/shell/session";
import { Button, ErrorState, Screen, Skeleton } from "~/ui";
import { StyleSheet, View } from "react-native";
import { space } from "~/ui/tokens";

/** Launch: sign in, or open where the person left off (`homeHref`). */
export default function Index() {
  const { isSignedIn, signOut } = useAuth();
  const me = useSignedInMe();
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (me.data) return <Redirect href={homeHref(me.data, lastVisit())} />;
  if (me.isError) {
    return (
      <Screen testID="launch-error">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
        <View style={styles.signOut}>
          <Button variant="ghost" label="Sign out" onPress={() => void signOut()} />
        </View>
      </Screen>
    );
  }
  return (
    <Screen testID="launch-loading">
      <View style={styles.skeleton}>
        <Skeleton height={32} width="60%" />
        <Skeleton height={96} radius="2xl" />
        <Skeleton height={96} radius="2xl" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeleton: { padding: space[4], paddingTop: space[16], gap: space[3] },
  signOut: { alignItems: "center" },
});
