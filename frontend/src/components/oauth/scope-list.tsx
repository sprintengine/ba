import {
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  KeyRound,
  Search,
  Store,
  type LucideIcon,
} from "lucide-react";
import type { OAuthScope } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const SCOPE_ICONS: Record<string, LucideIcon> = {
  "bookings:read": CalendarDays,
  "bookings:write": CalendarPlus,
  "marketplace:read": Search,
  "business:read": Store,
  "business:write": ClipboardCheck,
};

/** Icon for a permission; unknown scopes get a generic key. */
export function scopeIcon(key: string): LucideIcon {
  return SCOPE_ICONS[key] ?? KeyRound;
}

/** What an app may do: icon, label and description per scope. */
export function ScopeList({ scopes, className }: { scopes: OAuthScope[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col divide-y divide-border-subtle", className)}>
      {scopes.map((scope) => {
        const Icon = scopeIcon(scope.key);
        return (
          <li key={scope.key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-brand-border bg-brand-soft text-brand-soft-foreground [&_svg]:size-4"
            >
              <Icon />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{scope.label}</span>
              <span className="text-sm text-muted-foreground">{scope.description}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
