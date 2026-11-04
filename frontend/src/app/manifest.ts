import type { MetadataRoute } from "next";

/**
 * Lets owners add bookanything to an iPhone or iPad home screen (or install it on Android and desktop) and run the
 * dashboard full screen, like an app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "bookanything",
    short_name: "bookanything",
    description: "Bookings, calendar and payments for appointment businesses.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#f6f7f9",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
