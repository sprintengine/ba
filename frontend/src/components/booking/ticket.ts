/**
 * The booking ticket: a panel washed with the business's colour (or the theme's own primary, so a business with no
 * colour set gets a neutral one), with a tear between who it's with and what's being booked.
 */
export const TICKET_PANEL =
  "flex min-w-0 flex-col rounded-2xl border border-border bg-[color-mix(in_oklab,var(--primary)_6%,var(--surface))] @4xl:sticky @4xl:top-24 @4xl:self-start";

/** The tear's two notches, cut from the panel's edges in the page's colour. */
export const TICKET_NOTCHES =
  "pointer-events-none absolute -top-2.25 -right-2.25 -left-2.25 flex justify-between before:size-4 before:rounded-full before:border before:border-border before:bg-background before:content-[''] after:size-4 after:rounded-full after:border after:border-border after:bg-background after:content-['']";
