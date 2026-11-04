/**
 * Root: providers (theme, auth, data, toasts), the splash screen, and the top-level stack. Signed out, people reach
 * sign-in, Explore, a business's page and its booking flow (guests can book, as on the website) and a guest's manage
 * link. The customer tabs that need an account, the dashboard and invitations are opened from links, so they send a
 * signed-out person to sign-in and come back afterwards (`RequireSignIn`); the modals are behind `Stack.Protected`.
 */
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, type ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuth } from "@shared/auth/context";
import { configureApi } from "~/api/setup";
import { QueryProvider } from "~/api/QueryProvider";
import { AuthProvider } from "~/auth/AuthProvider";
import { configProblem } from "~/config/env";
import { PushNotifications } from "~/features/notifications/push/PushNotifications";
import { RootErrorBoundary } from "~/shell/RootErrorBoundary";
import { useStackOptions } from "~/shell/stack";
import { EmptyState, Screen, ThemeProvider, ToastProvider, useTheme } from "~/ui";

configureApi();
void SplashScreen.preventAutoHideAsync();

export { RootErrorBoundary as ErrorBoundary };

export default function RootLayout() {
  const problem = configProblem();
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedNavigation>
          {problem ? (
            <ConfigError problem={problem} />
          ) : (
            <AuthProvider>
              <QueryProvider>
                <ToastProvider>
                  <RootStack />
                  <PushNotifications />
                </ToastProvider>
              </QueryProvider>
            </AuthProvider>
          )}
        </ThemedNavigation>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** React Navigation's theme (backgrounds behind transitions, default header colours) from our tokens. */
function ThemedNavigation({ children }: { children: ReactNode }) {
  const { scheme, colors } = useTheme();
  const theme = useMemo(() => {
    const base = scheme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.brand,
        background: colors.background,
        card: colors.surface,
        text: colors.foreground,
        border: colors.border,
        notification: colors.danger,
      },
    };
  }, [scheme, colors]);
  return (
    <NavigationThemeProvider value={theme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {children}
    </NavigationThemeProvider>
  );
}

function RootStack() {
  const { isLoaded, isSignedIn } = useAuth();
  const options = useStackOptions();
  useEffect(() => {
    if (isLoaded) SplashScreen.hide();
  }, [isLoaded]);
  if (!isLoaded) return null;
  return (
    <Stack screenOptions={{ ...options, headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="invitations/[token]" options={{ headerShown: true, title: "Invitation" }} />
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="assistant" options={{ presentation: "modal", headerShown: true, title: "Bo" }} />
        <Stack.Screen
          name="notifications"
          options={{ presentation: "modal", headerShown: true, title: "Notifications" }}
        />
        <Stack.Screen
          name="connect-ai"
          options={{ presentation: "modal", headerShown: true, title: "Connect an AI app" }}
        />
        <Stack.Screen name="onboarding" options={{ presentation: "fullScreenModal" }} />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Screen name="manage/[token]" options={{ headerShown: true, title: "Your booking" }} />
    </Stack>
  );
}

function ConfigError({ problem }: { problem: string }) {
  useEffect(() => {
    SplashScreen.hide();
  }, []);
  return (
    <Screen>
      <EmptyState title="This build isn't set up" description={problem} />
    </Screen>
  );
}
