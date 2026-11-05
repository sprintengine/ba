"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import type { PublicService } from "@/lib/api/types";
import { zonedToIso, type PlainDate } from "@/lib/format";
import {
  BOOKED_SERVICE,
  CLIENT,
  dayEntries,
  demoDay,
  LUMEN,
  roomFor,
  whoIsFree,
  type DemoEntry,
} from "./fixture";

export type DemoStep = "service" | "time" | "review" | "paying" | "done";

/** The auto-played booking. */
const AUTO_TIME = "15:30";
const TAP = { hold: 1500, travel: 650, press: 260 };

/**
 * The state of the booking demo, and the script that plays it. The script taps the same controls a visitor would; a
 * visitor who taps the phone takes over and the script stops. With reduced motion nothing plays: it rests on a
 * finished booking, and can still be tapped through.
 */
export function useBookingDemo({
  screen,
  visible,
  onPaid,
}: {
  /** The phone's screen, to find what to tap. */
  screen: React.RefObject<HTMLElement | null>;
  visible: boolean;
  /** The booking is confirmed: put it on the calendar. */
  onPaid: (entry: DemoEntry, land: () => void) => void;
}) {
  const reduce = useReducedMotion();
  const today = useMemo(() => demoDay(), []);
  const [step, setStep] = useState<DemoStep>("service");
  const [service, setService] = useState<PublicService | null>(null);
  const [date, setDate] = useState<PlainDate>(today);
  const [time, setTime] = useState<string | null>(null);
  const [booked, setBooked] = useState<DemoEntry[]>([]);
  const [auto, setAuto] = useState(true);
  const [paused, setPaused] = useState(false);
  const [touch, setTouch] = useState<{ x: number; y: number; down: boolean } | null>(null);
  const entries = useMemo(() => dayEntries(booked), [booked]);

  const pickService = useCallback((s: PublicService) => {
    setService(s);
    setTime(null);
    setStep("time");
  }, []);
  const pickDate = useCallback((d: PlainDate) => setDate(d), []);
  const pickTime = useCallback((t: string) => {
    setTime(t);
    setStep("review");
  }, []);
  const goTo = useCallback((s: DemoStep) => setStep(s), []);
  const pay = useCallback(() => setStep("paying"), []);
  const again = useCallback(() => {
    setService(null);
    setTime(null);
    setStep("service");
  }, []);

  // Rests on a finished booking: the picture of what the scene shows, without the movement.
  const rested = useRef(false);
  useEffect(() => {
    if (!reduce || rested.current) return;
    rested.current = true;
    const who = whoIsFree(dayEntries([]), BOOKED_SERVICE, AUTO_TIME) ?? "sam";
    setAuto(false);
    setService(BOOKED_SERVICE);
    setTime(AUTO_TIME);
    setBooked([{ who, at: AUTO_TIME, customer: CLIENT.name, service: BOOKED_SERVICE, room: roomFor(who) }]);
    setStep("done");
  }, [reduce]);

  // Paying: a short wait, as for a real payment, then the booking leaves the phone.
  const paying = step === "paying";
  useEffect(() => {
    if (!paying || !service || !time) return;
    const id = window.setTimeout(() => {
      const who = whoIsFree(entries, service, time);
      setStep("done");
      if (!who) return;
      const entry = { who, at: time, customer: CLIENT.name, service, room: roomFor(who) };
      onPaid(entry, () => setBooked((b) => [...b, entry]));
    }, 900);
    return () => window.clearTimeout(id);
  }, [paying, service, time, entries, onPaid]);

  const running = auto && !paused && visible && !reduce;
  useEffect(() => {
    if (!running) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTouch(null);
      return;
    }
    const timers: number[] = [];
    const after = (ms: number, run: () => void) => timers.push(window.setTimeout(run, ms));
    /** Moves the finger to a control, presses it, then clicks it: the same click a visitor makes. */
    const tap = (find: (root: HTMLElement) => HTMLElement | null | undefined, hold = TAP.hold) => {
      after(hold, () => {
        const root = screen.current;
        const el = root && find(root);
        if (!root || !el) return;
        const box = root.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const k = box.width / root.offsetWidth;
        const at = { x: (r.left + r.width / 2 - box.left) / k, y: (r.top + r.height / 2 - box.top) / k };
        setTouch({ ...at, down: false });
        after(TAP.travel, () => {
          setTouch({ ...at, down: true });
          after(TAP.press, () => {
            setTouch(null);
            el.click();
          });
        });
      });
    };
    const byText = (root: HTMLElement, text: string) =>
      [...root.querySelectorAll("button")].find((b) => b.textContent.includes(text));

    if (step === "service") tap((r) => byText(r, BOOKED_SERVICE.name));
    if (step === "time") tap((r) => byText(r, AUTO_TIME));
    if (step === "review") tap((r) => r.querySelector<HTMLElement>('[data-demo="pay"]'));
    if (step === "done") {
      after(7000, () => {
        setTouch(null);
        setBooked([]);
        again();
      });
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [running, step, screen, again]);

  return {
    step,
    service,
    today,
    date,
    time,
    entries,
    startIso: zonedToIso(date, time ?? AUTO_TIME, LUMEN.timezone),
    touch,
    auto,
    paused: paused || !auto,
    pickService,
    pickDate,
    pickTime,
    goTo,
    pay,
    again,
    /** A visitor tapped the phone: it's theirs now. */
    takeOver: () => {
      setAuto(false);
      setTouch(null);
    },
    toggle: () => {
      if (auto) {
        setPaused((p) => !p);
        return;
      }
      setBooked([]);
      again();
      setPaused(false);
      setAuto(true);
    },
  };
}

export type BookingDemo = ReturnType<typeof useBookingDemo>;
