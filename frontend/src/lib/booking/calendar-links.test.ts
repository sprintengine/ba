import { afterEach, describe, expect, it, vi } from "vitest";
import { managedBooking } from "./__tests__/fixtures";
import {
  bookingCalendarEvent,
  buildIcs,
  downloadIcs,
  escapeIcsText,
  googleCalendarUrl,
  toIcsUtc,
} from "./calendar-links";

const event = {
  uid: "bk1",
  title: "Initial assessment · Lumen Physiotherapy",
  start: "2026-10-08T10:00:00+01:00",
  end: "2026-10-08T11:00:00+01:00",
  location: "Unit 4, Lantern Quay; Dublin",
  description: "Reference BA-7K3F9Q\nWith Alex Morgan",
};

describe("calendar links", () => {
  it("converts instants to UTC basic format", () => {
    expect(toIcsUtc(event.start)).toBe("20261008T090000Z");
  });

  it("escapes text per RFC 5545", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("builds a valid VEVENT with CRLF line endings", () => {
    const ics = buildIcs(event, new Date("2026-09-30T12:00:00Z"));
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("DTSTART:20261008T090000Z");
    expect(ics).toContain("DTEND:20261008T100000Z");
    expect(ics).toContain("UID:bk1@bookanything.ie");
    expect(ics).toContain("LOCATION:Unit 4\\, Lantern Quay\\; Dublin");
    expect(ics.split("\r\n").every((line) => line.length <= 75)).toBe(true);
  });

  it("builds a Google Calendar template link", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.searchParams.get("dates")).toBe("20261008T090000Z/20261008T100000Z");
    expect(url.searchParams.get("text")).toBe(event.title);
  });
});

describe("bookingCalendarEvent", () => {
  it("describes a booking with its reference, people and manage link", () => {
    const b = managedBooking();
    const event = bookingCalendarEvent(b, "https://bookanything.ie/manage/tok");
    expect(event).toMatchObject({
      uid: b.id,
      title: `${b.service.name} · ${b.business.name}`,
      start: b.start,
      end: b.end,
      url: "https://bookanything.ie/manage/tok",
    });
    expect(event.description).toContain(`Reference ${b.reference}`);
    expect(event.description).toContain("Manage: https://bookanything.ie/manage/tok");
    expect(bookingCalendarEvent(b).url).toBeNull();
  });
});

/** The .ics lines with RFC 5545 folding undone (a CRLF followed by a space joins two lines). */
const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");
const octets = (line: string) => new TextEncoder().encode(line).length;

describe("ics folding", () => {
  it("folds long lines at 75 octets and unfolds back to the original", () => {
    const description = "Reference BA-7K3F9Q. ".repeat(12).trim();
    const ics = buildIcs({ ...event, description }, new Date("2026-09-30T12:00:00Z"));
    const lines = ics.split("\r\n");
    expect(lines.some((l) => l.startsWith(" "))).toBe(true);
    expect(lines.every((l) => octets(l) <= 75)).toBe(true);
    expect(unfold(ics)).toContain(`DESCRIPTION:${escapeIcsText(description)}`);
  });

  it("counts octets, not characters, so accented names stay within the limit", () => {
    const title = "Seán Ó Briain · Éadaoin's Físiteiripe · Ráiteas ".repeat(3).trim();
    const ics = buildIcs({ ...event, title });
    for (const line of ics.split("\r\n")) expect(octets(line)).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain(`SUMMARY:${escapeIcsText(title)}`);
  });

  it("never splits a character across lines (emoji survive the download)", () => {
    const title = `Massage ${"🌿".repeat(40)}`;
    const ics = buildIcs({ ...event, title });
    // A split surrogate pair would leave a lone half on a line, which UTF-8 encoding turns into U+FFFD.
    for (const line of ics.split("\r\n")) {
      expect(new TextDecoder().decode(new TextEncoder().encode(line))).toBe(line);
      expect(octets(line)).toBeLessThanOrEqual(75);
    }
    expect(unfold(ics)).toContain(`SUMMARY:${title}`);
  });

  it("leaves out the optional properties an event doesn't have", () => {
    const ics = buildIcs({ uid: "x", title: "Call", start: event.start, end: event.end });
    expect(ics).not.toMatch(/DESCRIPTION|LOCATION|URL:/);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("Google Calendar link details", () => {
  it("puts the description and the manage link in the details, and the location", () => {
    const url = new URL(googleCalendarUrl({ ...event, url: "https://bookanything.ie/manage/tok" }));
    expect(url.searchParams.get("details")).toBe(
      `${event.description}\n\nhttps://bookanything.ie/manage/tok`,
    );
    expect(url.searchParams.get("location")).toBe(event.location);
  });

  it("omits details and location when there are none", () => {
    const url = new URL(googleCalendarUrl({ uid: "x", title: "Call", start: event.start, end: event.end }));
    expect(url.searchParams.has("details")).toBe(false);
    expect(url.searchParams.has("location")).toBe(false);
  });
});

describe("bookingCalendarEvent without people or address", () => {
  it("has no location and only the reference in the description", () => {
    const b = managedBooking({
      resources: [{ id: "room", name: "Room 1", kind: "space" }],
      business: {
        ...managedBooking().business,
        address: { line1: null, line2: null, city: null, postcode: null },
      },
    });
    const e = bookingCalendarEvent(b);
    expect(e.location).toBeNull();
    expect(e.description).toBe(`Reference ${b.reference}`);
  });
});

describe("downloadIcs", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("downloads the event as a named .ics file and releases the blob afterwards", async () => {
    vi.useFakeTimers();
    const blobs: Blob[] = [];
    const create = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:ics";
    });
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });

    downloadIcs(event, "BA-7K3F9Q.ics");

    expect(clicked).toHaveLength(1);
    expect(clicked[0]).toMatchObject({ download: "BA-7K3F9Q.ics", href: "blob:ics" });
    expect(document.querySelector("a[download]")).toBeNull();
    const blob = blobs[0];
    expect(blob?.type).toBe("text/calendar;charset=utf-8");
    expect(await blob?.text()).toContain("UID:bk1@bookanything.ie");
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith("blob:ics");
  });
});
