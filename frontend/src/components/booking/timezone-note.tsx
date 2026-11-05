"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { timeZoneLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "Times in Dublin time (IST)", noting when that differs from the visitor's device. */
export function TimezoneNote({ timeZone, className }: { timeZone: string; className?: string }) {
  const [differs, setDiffers] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only check after hydration
    setDiffers(Intl.DateTimeFormat().resolvedOptions().timeZone !== timeZone);
  }, [timeZone]);
  const city = timeZone.split("/").pop()?.replace(/_/g, " ") ?? timeZone;
  return (
    <p className={cn("flex items-start gap-1.5 text-sm text-muted-foreground", className)}>
      <Globe className="mt-0.5 size-3.5 shrink-0 text-subtle-foreground" aria-hidden />
      <span>
        Times in {city} time ({timeZoneLabel(timeZone)})
        {differs && <span> · different from your device</span>}
      </span>
    </p>
  );
}
