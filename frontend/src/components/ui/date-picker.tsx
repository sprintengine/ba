"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatDate, type PlainDate } from "@/lib/format/datetime";
import { cn } from "@/lib/utils";
import { Calendar, type CalendarProps } from "./calendar";
import { useFieldControlProps } from "./field";
import { controlSizes, controlStyles } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/** Date field: button + popover calendar. Value is a plain date "YYYY-MM-DD". */
export function DatePicker({
  value,
  onValueChange,
  placeholder = "Pick a date",
  className,
  size = "md",
  id,
  disabled,
  ...calendarProps
}: Omit<CalendarProps, "onValueChange" | "value" | "size"> & {
  value: PlainDate | null;
  onValueChange: (date: PlainDate) => void;
  placeholder?: string;
  size?: "sm" | "md";
  id?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const props = useFieldControlProps({ id, disabled });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            controlStyles,
            "flex items-center gap-2 text-left",
            controlSizes[size],
            !value && "text-subtle-foreground",
            className,
          )}
          {...props}
        >
          <CalendarDays className="size-4 shrink-0 text-subtle-foreground" />
          <span className="tnum truncate">
            {value ? formatDate(value, "UTC", "dayMonthYear") : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3">
        <Calendar
          {...calendarProps}
          value={value}
          onValueChange={(d) => {
            onValueChange(d);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
