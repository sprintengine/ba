"use client";

import { useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./command";
import { useFieldControlProps } from "./field";
import { controlSizes, controlStyles } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Secondary text shown right-aligned (e.g. email). Also searchable. */
  hint?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
};

/**
 * Searchable single select (customers, timezones, currencies).
 *   <Combobox options={opts} value={v} onValueChange={setV} placeholder="Select customer" />
 * For async search, pass `onSearchChange` + `shouldFilter={false}` and update `options` yourself.
 */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  onSearchChange,
  shouldFilter = true,
  footer,
  className,
  size = "md",
  ...rest
}: {
  options: ComboboxOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: React.ReactNode;
  onSearchChange?: (search: string) => void;
  shouldFilter?: boolean;
  /** Rendered under the list (e.g. "+ New customer"). */
  footer?: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
  id?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const props = useFieldControlProps(rest);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          className={cn(
            controlStyles,
            "flex items-center justify-between gap-2 text-left",
            controlSizes[size],
            className,
          )}
          {...props}
        >
          <span
            className={cn("flex min-w-0 items-center gap-2 truncate", !selected && "text-subtle-foreground")}
          >
            {selected?.icon}
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-subtle-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command shouldFilter={shouldFilter}>
          <CommandInput placeholder={searchPlaceholder} onValueChange={onSearchChange} />
          <CommandList id={listId}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.hint ?? ""} ${option.value}`}
                  disabled={option.disabled}
                  onSelect={() => {
                    onValueChange(option.value === value ? null : option.value);
                    setOpen(false);
                  }}
                >
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                  {option.hint && (
                    <span className="ml-auto truncate text-xs text-subtle-foreground">{option.hint}</span>
                  )}
                  <Check
                    className={cn(
                      "ml-2 size-4 text-foreground!",
                      option.value === value ? "opacity-100" : "opacity-0",
                      !option.hint && "ml-auto",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {footer && <div className="border-t border-border p-1">{footer}</div>}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
