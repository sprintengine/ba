import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import "./globals.css";

/** Figtree is the one bookanything typeface (Prism brand): UI, headings, wordmark and figures alike. */
const figtree = localFont({
  src: "./fonts/Figtree.woff2",
  weight: "300 900",
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "bookanything — online booking for any business", template: "%s · bookanything" },
  description:
    "Beautiful online booking for physios, car washes, music teachers, clinics — anything bookable. Free to start, 0% platform fee on payments.",
  applicationName: "bookanything",
  openGraph: { siteName: "bookanything", type: "website" },
  // Added to an iPhone or iPad home screen, the dashboard opens full screen under this name (see manifest.ts).
  appleWebApp: { capable: true, title: "bookanything", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // Draw under the home indicator and around the notch, so the env(safe-area-inset-*) padding on tab bars and
  // sticky actions takes effect (in Safari and on the home screen alike). The body keeps flowing content off the
  // notch in landscape (globals.css).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1a16" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IE" suppressHydrationWarning className={figtree.variable}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
