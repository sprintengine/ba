"use client";

import { useId } from "react";
import { Users } from "lucide-react";
import type { CustomerGroup } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Who can book a time range: everyone, or only the chosen customer groups. [label] names the range. */
export function AudiencePicker({
  label,
  groups,
  value,
  onChange,
  disabled,
}: {
  label: string;
  groups: CustomerGroup[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const names = groups.filter((g) => value.includes(g.id)).map((g) => g.name);
  const who = value.length === 0 ? "Everyone" : names.join(", ");
  const titleId = useId();
  const helpId = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={value.length ? "soft" : "ghost"}
          disabled={disabled}
          className="max-w-40"
          aria-label={`Who can book ${label}: ${who}`}
        >
          <Users />
          <span className="truncate">{who}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start" aria-labelledby={titleId} aria-describedby={helpId}>
        <p id={titleId} className="text-sm font-medium">
          Who can book these hours
        </p>
        <p id={helpId} className="mt-0.5 mb-3 text-xs text-muted-foreground">
          Leave empty for everyone. Restricted groups can only book hours that list them.
        </p>
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <label key={g.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
              <Checkbox
                checked={value.includes(g.id)}
                onCheckedChange={(c) => onChange(c ? [...value, g.id] : value.filter((x) => x !== g.id))}
              />
              <span className="flex-1">{g.name}</span>
              {g.restricted && (
                <Badge tone="warning" className="h-5">
                  Restricted
                </Badge>
              )}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
