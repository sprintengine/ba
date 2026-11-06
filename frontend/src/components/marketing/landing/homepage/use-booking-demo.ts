"use client";

import { useCallback, useMemo, useState } from "react";
import type { PublicService } from "@/lib/api/types";
import { zonedToIso, type PlainDate } from "@/lib/format";
import { BOOKED_AT, BOOKED_SERVICE, dayEntries, demoDay, LUMEN, type DemoEntry } from "./fixture";

export type DemoStep = "service" | "time" | "review" | "paying" | "done";

/** The booking on the phone: the steps a client goes through. The hero's script drives it by tapping its controls. */
export function useBookingDemo() {
  const today = useMemo(() => demoDay(), []);
  const [step, setStep] = useState<DemoStep>("service");
  const [service, setService] = useState<PublicService | null>(null);
  const [date, setDate] = useState<PlainDate>(today);
  const [time, setTime] = useState<string | null>(null);
  const [booked, setBooked] = useState<DemoEntry[]>([]);
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
  /** The payment went through. */
  const confirm = useCallback(() => setStep("done"), []);
  /** Back to an empty page and an untouched calendar. */
  const reset = useCallback(() => {
    setService(null);
    setTime(null);
    setBooked([]);
    setStep("service");
  }, []);
  /** A finished booking, with no steps before it: what reduced motion rests on. */
  const finish = useCallback(() => {
    setService(BOOKED_SERVICE);
    setTime(BOOKED_AT);
    setStep("done");
  }, []);

  return useMemo(
    () => ({
      step,
      service,
      today,
      date,
      time,
      entries,
      startIso: zonedToIso(date, time ?? BOOKED_AT, LUMEN.timezone),
      pickService,
      pickDate,
      pickTime,
      goTo,
      pay,
      confirm,
      reset,
      finish,
      setBooked,
    }),
    [
      step,
      service,
      today,
      date,
      time,
      entries,
      pickService,
      pickDate,
      pickTime,
      goTo,
      pay,
      confirm,
      reset,
      finish,
    ],
  );
}

export type BookingDemo = ReturnType<typeof useBookingDemo>;
