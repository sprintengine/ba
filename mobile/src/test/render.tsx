/**
 * Render a component with the app's providers: theme, safe areas, auth (a fake `AuthState`), a fresh React Query
 * client (no retries, no persistence) and toasts. For whole screens with routing, use `renderApp` (src/test/app.tsx).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthContext } from "@shared/auth/context";
import type { AuthState } from "@shared/auth/types";
import { ThemeProvider, ToastProvider, type ColorScheme } from "~/ui";

export const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export function authState(patch: Partial<AuthState> = {}): AuthState {
  return {
    mode: "dev",
    isLoaded: true,
    isSignedIn: true,
    user: { id: "dev_customer", email: "customer@bookanything.test", name: "Demo Customer", imageUrl: null },
    getToken: () => Promise.resolve("dev.token"),
    signOut: jest.fn(() => Promise.resolve()),
    ...patch,
  };
}

export function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

export type ProviderOptions = { auth?: AuthState; client?: QueryClient; scheme?: ColorScheme };

export function Providers({
  children,
  auth = authState(),
  client,
  scheme = "light",
}: ProviderOptions & { children: ReactElement }) {
  return (
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <ThemeProvider scheme={scheme}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client ?? testQueryClient()}>
            <ToastProvider>{children}</ToastProvider>
          </QueryClientProvider>
        </AuthContext.Provider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options: ProviderOptions & Omit<RenderOptions, "wrapper"> = {},
) {
  const { auth, client, scheme, ...rest } = options;
  const queryClient = client ?? testQueryClient();
  const result = render(ui, {
    wrapper: ({ children }) => (
      <Providers auth={auth} client={queryClient} scheme={scheme}>
        {children as ReactElement}
      </Providers>
    ),
    ...rest,
  });
  return { ...result, queryClient };
}

export type ScreenOptions = ProviderOptions & {
  /** Other routes the screen may navigate to (`{ "my/bookings/[id]": Detail }`). */
  routes?: Record<string, () => ReactElement>;
};

/**
 * Render a screen or component inside a real Expo Router (in memory) as the route `/`, so hooks like
 * `useFocusEffect`, `useLocalSearchParams` and `router.push` work. Returns the router helpers too
 * (`getPathname()`); see expo-router/testing-library.
 */
export function renderScreen(ui: ReactElement, { routes = {}, auth, client, scheme }: ScreenOptions = {}) {
  const queryClient = client ?? testQueryClient();
  const result = renderRouter(
    { index: () => ui, ...routes },
    {
      initialUrl: "/",
      wrapper: ({ children }) => (
        <Providers auth={auth} client={queryClient} scheme={scheme}>
          {children as ReactElement}
        </Providers>
      ),
    },
  );
  return { ...result, queryClient };
}
