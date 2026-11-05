"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * The theme script only has to run in the server's HTML. A 404 re-renders the root on the client, where an
 * executable script tag would never run and React reports it, so there it is an inert data block.
 */
const THEME_SCRIPT_PROPS = { type: typeof window === "undefined" ? "text/javascript" : "text/plain" };

/** Light/dark via a class on <html>; follows the OS by default. Use `useTheme()` from next-themes to read/set. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      scriptProps={THEME_SCRIPT_PROPS}
    >
      {children}
    </NextThemesProvider>
  );
}
