"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Light/dark via a class on <html>; follows the OS by default. Use `useTheme()` from next-themes to read/set. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
