import { notFound } from "next/navigation";
import { AppProviders } from "@/app/app-providers";

/** Development-only routes (/dev/ui kitchen sink, /dev/checkout). Hidden in production unless explicitly enabled. */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES !== "true")
    notFound();
  return <AppProviders>{children}</AppProviders>;
}
