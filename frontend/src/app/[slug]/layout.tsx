import { AppProviders } from "@/app/app-providers";

/**
 * A business's page and booking flow: a signed-in customer books under their account (and sees their details filled
 * in), so these need auth and the query client.
 */
export default function BusinessPublicLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
