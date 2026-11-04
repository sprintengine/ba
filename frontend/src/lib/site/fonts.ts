/**
 * The site-theme font allowlist, self-hosted by `next/font` (no requests to Google at runtime).
 * Not preloaded: a page only downloads the files its theme actually uses. Each font exposes a CSS
 * variable that `siteThemeVars` references. The app itself is set in Figtree (root layout); Geist
 * belongs to the minimal site theme only.
 */
import {
  Archivo,
  DM_Sans,
  Fraunces,
  Geist,
  Fredoka,
  IBM_Plex_Sans,
  Instrument_Sans,
  Instrument_Serif,
  Nunito,
} from "next/font/google";
import type { SiteThemeKey } from "@/lib/api/types";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex",
  display: "swap",
  preload: false,
  weight: ["400", "500", "600", "700"],
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
  axes: ["SOFT", "opsz"],
});
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap", preload: false });
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
  preload: false,
  axes: ["wdth"],
});
const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-fredoka", display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap", preload: false });
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
  preload: false,
  weight: "400",
  style: ["normal", "italic"],
});
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
  preload: false,
});

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap", preload: false });

/** Class names that define each theme's font variables (apply on the `data-theme` scope). */
export const THEME_FONT_CLASSES: Record<SiteThemeKey, string> = {
  clinical: plex.variable,
  calm: `${fraunces.variable} ${dmSans.variable}`,
  bold: archivo.variable,
  playful: `${fredoka.variable} ${nunito.variable}`,
  editorial: `${instrumentSerif.variable} ${instrumentSans.variable}`,
  minimal: geist.variable,
};
