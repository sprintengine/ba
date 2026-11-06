"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { NewBookingPrefill } from "@/lib/dashboard/new-booking";

/**
 * The drawer and the sheet are large and only open on demand, so they load on first open (`next/dynamic`) instead of
 * with every dashboard page; once opened they stay mounted so closing animates as before.
 */
const BookingDrawer = dynamic(() => import("./booking-drawer").then((m) => m.BookingDrawer), { ssr: false });
const NewBookingSheet = dynamic(() => import("./new-booking-sheet").then((m) => m.NewBookingSheet), {
  ssr: false,
});

type BookingActions = {
  /** Open the booking detail drawer. */
  openBooking: (bookingId: string) => void;
  /** Open the "New booking" sheet, optionally prefilled (date/time/resource from the calendar, customer…). */
  openNewBooking: (prefill?: NewBookingPrefill) => void;
};

export const BookingActionsContext = createContext<BookingActions | null>(null);

/**
 * Mounted once by the dashboard layout: owns the shared booking detail drawer
 * and the new-booking sheet so the calendar, lists, customer pages and ⌘K
 * all open the same UI.
 */
export function BookingActionsProvider({ children }: { children: React.ReactNode }) {
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [prefill, setPrefill] = useState<NewBookingPrefill>({});
  /** 0 until the sheet is first opened; then a fresh form state per open. */
  const [newKey, setNewKey] = useState(0);

  const openBooking = useCallback((id: string) => {
    setBookingId(id);
    setDrawerOpen(true);
  }, []);
  const openNewBooking = useCallback((p: NewBookingPrefill = {}) => {
    setPrefill(p);
    setNewKey((k) => k + 1); // fresh form state per open
    setNewOpen(true);
  }, []);

  const value = useMemo(() => ({ openBooking, openNewBooking }), [openBooking, openNewBooking]);

  return (
    <BookingActionsContext.Provider value={value}>
      {children}
      {bookingId !== null && (
        <BookingDrawer bookingId={bookingId} open={drawerOpen} onOpenChange={setDrawerOpen} />
      )}
      {newKey > 0 && (
        <NewBookingSheet
          key={newKey}
          open={newOpen}
          onOpenChange={setNewOpen}
          prefill={prefill}
          onCreated={(id) => openBooking(id)}
        />
      )}
    </BookingActionsContext.Provider>
  );
}

export function useBookingActions(): BookingActions {
  const ctx = useContext(BookingActionsContext);
  if (!ctx) throw new Error("useBookingActions must be used inside the dashboard layout");
  return ctx;
}
