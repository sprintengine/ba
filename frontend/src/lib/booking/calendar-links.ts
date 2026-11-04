/** "Add to calendar": an .ics file (Apple/Outlook/most apps) and a Google Calendar link. */
import type { CustomerBooking } from "@/lib/api/types";
import { downloadBlob } from "@/lib/download";
import { formatAddress } from "./booking";

export type CalendarEvent = {
  /** Stable id, e.g. the booking id — lets calendar apps update rather than duplicate. */
  uid: string;
  title: string;
  /** ISO instants. */
  start: string;
  end: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
};

/** The calendar event for a customer's booking, linking back to its manage page when known. */
export function bookingCalendarEvent(booking: CustomerBooking, manageUrl?: string | null): CalendarEvent {
  const location = formatAddress(booking.business.address);
  const people = booking.resources.filter((r) => r.kind === "person").map((r) => r.name);
  return {
    uid: booking.id,
    title: `${booking.service.name} · ${booking.business.name}`,
    start: booking.start,
    end: booking.end,
    location: location || null,
    description: [
      `Reference ${booking.reference}`,
      people.length ? `With ${people.join(", ")}` : null,
      manageUrl ? `Manage: ${manageUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    url: manageUrl ?? null,
  };
}

/** ISO instant → iCalendar UTC form `20261001T080000Z`. */
export function toIcsUtc(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Escape text per RFC 5545 (backslash, semicolon, comma, newlines). */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const utf8 = new TextEncoder();

/**
 * Fold lines longer than 75 octets per RFC 5545: continuation lines start with a space, and a line is never
 * split inside a character (so "é" or an emoji in a name survives the .ics download intact).
 */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  let limit = 75;
  for (const char of line) {
    const size = utf8.encode(char).length;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
      limit = 74; // the leading space counts
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(event: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//bookanything//booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@bookanything.ie`,
    `DTSTAMP:${toIcsUtc(now.toISOString())}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(event.end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toIcsUtc(event.start)}/${toIcsUtc(event.end)}`,
  });
  const details = [event.description, event.url].filter(Boolean).join("\n\n");
  if (details) params.set("details", details);
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Trigger a download of the .ics in the browser. */
export function downloadIcs(event: CalendarEvent, filename = "booking.ics") {
  downloadBlob(new Blob([buildIcs(event)], { type: "text/calendar;charset=utf-8" }), filename);
}
