import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isoWeekday, type PlainDate } from "@/lib/format";
import { must } from "@/test/must";
import { finalState, type DemoStep } from "../../engine/types";
import { customerChapters } from "../chapters";
import { CustomerDemo } from "../customer-demo";
import { LUMEN } from "../fixture";
import { PhoneScreen } from "../phone-screen";
import { demoDates, demoToday, LUMEN_TIMEZONE, SERVICE_ID, slotsOn, type CustomerState } from "../state";

afterEach(() => vi.unstubAllGlobals());

function applyStep(s: CustomerState, step: DemoStep<CustomerState>): CustomerState {
  switch (step.kind) {
    case "click":
      return step.apply ? step.apply(s) : s;
    case "type":
      return step.apply(s, step.text);
    case "set":
      return step.apply(s);
    default:
      return s;
  }
}

/** The fixture's capture week, and a "today" across a month and year boundary. */
const TODAYS: PlainDate[] = ["2026-10-01", demoToday("2026-12-29")];

describe("customer demo dates", () => {
  it("always shows a Thursday on or after the real date, at most six days ahead", () => {
    for (const real of ["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-07"]) {
      const today = demoToday(real);
      expect(isoWeekday(today)).toBe(4);
      expect(today >= real).toBe(true);
      expect(today <= "2026-10-08").toBe(true);
    }
  });

  it("books a bookable Tuesday after today, and opens on a bookable Friday", () => {
    for (const today of TODAYS) {
      const d = demoDates(today);
      expect(isoWeekday(d.booked)).toBe(2);
      expect(slotsOn(d.booked, today)).toContain("12:30");
      expect(slotsOn(d.firstOpen, today).length).toBeGreaterThan(0);
      expect(slotsOn(today, today)).toEqual([]);
    }
  });
});

describe("customer demo script", () => {
  it.each(TODAYS)("finds every target on the screen it is reached on (today %s)", (today) => {
    for (const chapter of customerChapters(today)) {
      let s = chapter.initial;
      for (const step of chapter.steps) {
        if ("target" in step) {
          const { container, unmount } = render(<PhoneScreen s={s} />);
          expect(
            container.querySelector(`[data-demo="${step.target}"]`),
            `${chapter.id}: ${step.target} on ${s.screen}`,
          ).not.toBeNull();
          unmount();
        }
        s = applyStep(s, step);
      }
    }
  });

  it("renders every chapter's result (the reduced-motion poster)", () => {
    for (const chapter of customerChapters("2026-10-01")) {
      const { container, unmount } = render(<PhoneScreen s={finalState(chapter)} />);
      expect(container.textContent).not.toBe("");
      unmount();
    }
  });

  it("ends each chapter where the visitor's journey says it should", () => {
    const [find, time, details, pay, mine] = customerChapters("2026-10-01").map((c) => finalState(c));
    expect(find?.screen).toBe("therapist");
    expect(time).toMatchObject({ screen: "time", date: "2026-10-06", time: "12:30" });
    expect(details?.details).toMatchObject({
      name: "Jordan Pike",
      email: "jordan@example.com",
      surgery: "No",
    });
    expect(pay).toMatchObject({ screen: "confirmed", calendarMenu: true });
    expect(mine).toMatchObject({ screen: "my-bookings", pastTab: true });
  });
});

describe("CustomerDemo", () => {
  it("renders the phone with the clinic's booking page and a pill per chapter", () => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    render(<CustomerDemo />);
    expect(screen.getByRole("figure", { name: /booking a physiotherapy appointment/i })).toBeInTheDocument();
    for (const label of ["Open the link", "Pick a time", "Your details", "Pay & done", "My bookings"])
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause the demo" })).toBeInTheDocument();
  });

  it("opens on the booking link with the clinic's deal above the services, and taps the service, not the deal", () => {
    const [find] = customerChapters("2026-10-01");
    const { container } = render(<PhoneScreen s={must(find, "first chapter").initial} />);
    const deal = screen.getByRole("region", { name: "Current deal" });
    expect(within(deal).getByText("Last-minute physio")).toBeInTheDocument();
    expect(within(deal).getByText("€15 off")).toBeInTheDocument();
    const target = must(
      container.querySelector<HTMLElement>(`[data-demo="service-${SERVICE_ID}"]`),
      "service target",
    );
    expect(deal.contains(target)).toBe(false);
    expect(screen.getByText("bookanything.ie/lumen-physio/book")).toBeInTheDocument();
  });

  it("keeps the fixture out of the landing's first load: only the replica's chunk imports it", () => {
    expect(LUMEN.timezone).toBe(LUMEN_TIMEZONE);
    // Vitest runs from frontend/ (jsdom gives modules an http import.meta.url).
    const dir = resolvePath(process.cwd(), "src/components/marketing/demo/customer");
    for (const eager of ["customer-demo.tsx", "chapters.ts", "state.ts"])
      expect(readFileSync(resolvePath(dir, eager), "utf8"), eager).not.toMatch(/from "\.\/fixture"/);
  });
});
