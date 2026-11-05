"use client";

import { CalendarPlus, ChevronDown, Download } from "lucide-react";
import type { CustomerBooking } from "@/lib/api/types";
import { bookingCalendarEvent, downloadIcs, googleCalendarUrl } from "@/lib/booking/calendar-links";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** "Add to calendar": Google Calendar link or an .ics download for a customer's booking. */
export function AddToCalendar({
  booking,
  manageUrl,
  variant = "secondary",
  size,
  className,
}: {
  booking: CustomerBooking;
  manageUrl?: string | null;
  variant?: "secondary" | "ghost" | "soft";
  size?: "sm";
  className?: string;
}) {
  const event = bookingCalendarEvent(booking, manageUrl);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          Add to calendar
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem asChild>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
            <CalendarPlus /> Google Calendar
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadIcs(event, `${booking.reference}.ics`)}>
          <Download /> Apple, Outlook & others (.ics)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
