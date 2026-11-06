"use client";

import { createContext, useContext } from "react";

/** The booking open in the inspector, so the card or row it came from can say so. */
export const OpenBookingContext = createContext<string | null>(null);

export function useOpenBooking(): string | null {
  return useContext(OpenBookingContext);
}
