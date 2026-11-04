"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { touchHitArea } from "@/components/ui/touch";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";

/** Free-text search. Commits (to the URL) once typing pauses; follows outside changes such as "Clear filters". */
export function SearchBox({
  value,
  onCommit,
  className,
}: {
  value: string;
  onCommit: (q: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  const debounced = useDebouncedValue(text.trim(), 300);
  // An outside change (not the echo of our own commit) replaces what's typed.
  if (synced !== value) {
    setSynced(value);
    if (value !== debounced) setText(value);
  }

  useEffect(() => {
    if (debounced !== value) onCommit(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debounced]);

  return (
    <div role="search" className={className}>
      <Input
        type="search"
        aria-label="Search businesses and services"
        placeholder="Search physio, haircut, car wash…"
        enterKeyHint="search"
        autoComplete="off"
        leading={<Search />}
        trailing={
          text ? (
            <IconButton
              label="Clear search"
              tooltip={false}
              size="xs"
              className={touchHitArea}
              onClick={() => setText("")}
            >
              <X />
            </IconButton>
          ) : undefined
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(text.trim());
        }}
        className="[&::-webkit-search-cancel-button]:hidden"
      />
    </div>
  );
}
