import { notificationTarget, timeAgo } from "./links";

describe("notificationTarget", () => {
  it("opens the same screen as the website link", () => {
    expect(notificationTarget("/dashboard/lumen-physio/approvals/a1")).toEqual({
      kind: "app",
      href: "/dashboard/lumen-physio/approvals/a1",
    });
    expect(notificationTarget("/my/approvals/r1")).toEqual({ kind: "app", href: "/my/approvals/r1" });
    expect(notificationTarget("/my")).toEqual({ kind: "app", href: "/my" });
    expect(notificationTarget("/dashboard/x/calendar?date=2026-10-06")).toEqual({
      kind: "app",
      href: "/dashboard/x/calendar?date=2026-10-06",
    });
  });

  it("opens a booking on its own screen (the website's drawer is a query)", () => {
    expect(notificationTarget("/dashboard/lumen-physio/bookings?booking=b-1")).toEqual({
      kind: "app",
      href: "/dashboard/lumen-physio/bookings/b-1",
    });
    expect(notificationTarget("/dashboard/lumen-physio/bookings?status=pending")).toEqual({
      kind: "app",
      href: "/dashboard/lumen-physio/bookings?status=pending",
    });
  });

  it("leaves other pages to the website", () => {
    expect(notificationTarget("/help/ai-assistant")).toEqual({ kind: "web", path: "/help/ai-assistant" });
    expect(notificationTarget("/myself")).toEqual({ kind: "web", path: "/myself" });
  });

  it("refuses anything that isn't a same-site path", () => {
    for (const link of [
      "https://evil.example/my",
      "//evil.example/my",
      "/\\evil.example",
      "javascript:alert(1)",
      "",
      null,
      undefined,
    ]) {
      expect(notificationTarget(link)).toBeNull();
    }
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  it("says how long ago, briefly", () => {
    expect(timeAgo("2026-10-10T11:59:50Z", now)).toBe("Just now");
    expect(timeAgo("2026-10-10T11:55:00Z", now)).toBe("5 min ago");
    expect(timeAgo("2026-10-10T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-10-09T10:00:00Z", now)).toBe("Yesterday");
    expect(timeAgo("2026-10-07T12:00:00Z", now)).toBe("3 days ago");
    expect(timeAgo("2026-09-01T12:00:00Z", now, "en-IE")).toBe("1 Sept");
  });
});
