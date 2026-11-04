import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { businessThemeVars } from "./color";

/**
 * Applies a business's brand colour to everything inside it: `primary` buttons,
 * `brand` accents, focus rings, selected calendar days… Contrast-safe in light
 * and dark mode (see color.ts). PublicBookingShell applies the same variables; wrap any other
 * business-branded surface (e.g. a branding preview in settings) with it.
 *
 *   <BusinessThemeProvider primaryColor={business.branding.primaryColor}>…</BusinessThemeProvider>
 */
export function BusinessThemeProvider({
  primaryColor,
  className,
  children,
  as: Tag = "div",
}: {
  primaryColor: string | null | undefined;
  className?: string;
  children: React.ReactNode;
  as?: "div" | "section" | "main";
}) {
  const style = useMemo(() => businessThemeVars(primaryColor) as React.CSSProperties, [primaryColor]);
  return (
    <Tag data-business-theme="" style={style} className={cn(className)}>
      {children}
    </Tag>
  );
}
