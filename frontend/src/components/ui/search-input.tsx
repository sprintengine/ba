"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { Input, type InputProps } from "./input";

/**
 * A search box: the search icon, and a "Clear search" button once there is text. Controlled by the raw text;
 * pair it with `useDebouncedSearch` for the query to send.
 *   const search = useDebouncedSearch();
 *   <SearchInput value={search.text} onValueChange={search.setText} aria-label="Search customers" />
 *   useInfiniteCustomers(id, { q: search.query || undefined })
 */
export function SearchInput({
  value,
  onValueChange,
  size = "sm",
  className,
  ...props
}: Omit<InputProps, "value" | "onChange" | "leading" | "trailing" | "type"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  // `className` sizes the whole box: on the input it would leave "Clear search" at the edge of a full-width wrapper.
  return (
    <div className={cn("w-full", className)}>
      <Input
        size={size}
        leading={<Search />}
        trailing={
          value ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onValueChange("")}
              className="rounded p-0.5 hover:text-foreground"
            >
              <X />
            </button>
          ) : undefined
        }
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        {...props}
      />
    </div>
  );
}

/** The text in a search box and the query it stands for: trimmed, once typing has paused for `delay` ms. */
export function useDebouncedSearch(initial = "", delay = 250) {
  const [text, setText] = useState(initial);
  const query = useDebouncedValue(text.trim(), delay);
  return { text, setText, query };
}
