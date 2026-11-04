/**
 * Opening a booking and the "New booking" form from anywhere in a section (the website's BookingActionsProvider).
 * Each business-day section's layout mounts one (`app/dashboard/[slug]/<section>/_layout.tsx`), so a booking opens
 * inside the section's own stack (back returns to the calendar, Today or the customer), and the form opens over it.
 */
import { router, type Href } from "expo-router";
import { useCurrentBusiness } from "@shared/business/business-context";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { NewBookingPrefill } from "@shared/dashboard/new-booking";
import { NewBookingSheet } from "./new-booking/NewBookingSheet";

/** The sections that show bookings; each has its own booking detail route. */
export type BookingSection = "overview" | "calendar" | "bookings" | "customers";

/** A booking's detail route within a section's stack. */
export function bookingHref(slug: string, section: BookingSection, id: string): Href {
  const base = `/dashboard/${slug}`;
  const path = {
    overview: `${base}/booking/${id}`,
    calendar: `${base}/calendar/${id}`,
    bookings: `${base}/bookings/${id}`,
    customers: `${base}/customers/booking/${id}`,
  }[section];
  return path as Href;
}

type BookingActionsValue = {
  section: BookingSection;
  openBooking: (bookingId: string) => void;
  openNewBooking: (prefill?: NewBookingPrefill) => void;
};

const BookingActionsContext = createContext<BookingActionsValue | null>(null);

export function BookingActionsProvider({
  section,
  children,
}: {
  section: BookingSection;
  children: ReactNode;
}) {
  const { slug } = useCurrentBusiness();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<NewBookingPrefill>({});
  /** 0 until first opened; a fresh form per opening. */
  const [formKey, setFormKey] = useState(0);

  const openBooking = useCallback(
    (id: string) => router.push(bookingHref(slug, section, id)),
    [slug, section],
  );
  const openNewBooking = useCallback((p: NewBookingPrefill = {}) => {
    setPrefill(p);
    setFormKey((k) => k + 1);
    setOpen(true);
  }, []);
  const value = useMemo(
    () => ({ section, openBooking, openNewBooking }),
    [section, openBooking, openNewBooking],
  );

  return (
    <BookingActionsContext.Provider value={value}>
      {children}
      {formKey > 0 ? (
        <NewBookingSheet
          key={formKey}
          visible={open}
          prefill={prefill}
          onClose={() => setOpen(false)}
          onView={openBooking}
        />
      ) : null}
    </BookingActionsContext.Provider>
  );
}

export function useBookingActions(): BookingActionsValue {
  const ctx = useContext(BookingActionsContext);
  if (!ctx) throw new Error("useBookingActions must be used inside a section's BookingActionsProvider");
  return ctx;
}
