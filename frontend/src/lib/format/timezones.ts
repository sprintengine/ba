import { timeZoneLabel } from "./datetime";

/** IANA timezones for pickers, in the order we suggest them; also the fallback where Intl cannot list zones. */
export const COMMON_TIME_ZONES = [
  "Europe/Dublin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Lisbon",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

/** The browser's own timezone, or null when it cannot tell (only for suggestions; display uses the business zone). */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Every IANA zone the browser knows, or [COMMON_TIME_ZONES] where it cannot list them. */
export function supportedTimeZones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    const zones = intl.supportedValuesOf?.("timeZone");
    return zones?.length ? zones : COMMON_TIME_ZONES;
  } catch {
    return COMMON_TIME_ZONES;
  }
}

/**
 * Whether the API accepts [timeZone] for a business: a region id (`Europe/Dublin`) or `UTC` that Intl knows. Like the
 * backend's `parseZone`, it refuses abbreviations and fixed offsets (`GMT`, `EST`, `+01:00`), which ignore daylight
 * saving time even though Intl accepts them.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone !== "UTC" && !timeZone.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export type TimeZoneOption = { value: string; label: string; hint: string };

/** Combobox options for [zones], in order: "America/New_York" shows as "America/New York" with its short name. */
export function timeZoneOptions(zones: readonly string[], now: Date = new Date()): TimeZoneOption[] {
  return [...new Set(zones)].map((zone) => ({
    value: zone,
    label: zone.replace(/_/g, " "),
    hint: safeLabel(zone, now),
  }));
}

function safeLabel(zone: string, now: Date): string {
  try {
    return timeZoneLabel(zone, now);
  } catch {
    return "";
  }
}
