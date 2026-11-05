"use client";

import Link from "next/link";
import { CalendarHeart, ChevronsUpDown, LogOut, Monitor, Moon, Plug, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { cn } from "@/lib/utils";
import { useThemeChoice } from "@/components/common/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Avatar + dropdown with My bookings, theme and sign out. `variant="row"` for the sidebar footer. */
export function UserMenu({
  variant = "avatar",
  collapsed,
  align = "end",
  side = "bottom",
}: {
  variant?: "avatar" | "row";
  collapsed?: boolean;
  align?: "start" | "end";
  side?: "top" | "bottom" | "right";
}) {
  const { user, signOut, mode } = useAuth();
  const { theme, setTheme } = useThemeChoice();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "row" ? (
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-accent pointer-coarse:min-h-11",
              collapsed && "justify-center",
            )}
          >
            {/* The avatar repeats the name beside it. Collapsed, the name is screen-reader text, not an aria-label,
                which would have to contain the initials shown (WCAG 2.5.3, label in name). */}
            <Avatar name={user.name ?? user.email} src={user.imageUrl} size="sm" aria-hidden />
            {collapsed && <span className="sr-only">Account menu</span>}
            {!collapsed && (
              <>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm leading-5 font-medium">{user.name ?? user.email}</span>
                  <span className="truncate text-xs text-subtle-foreground">{user.email}</span>
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-subtle-foreground" />
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none pointer-coarse:size-11"
          >
            <Avatar name={user.name ?? user.email} src={user.imageUrl} size="md" aria-hidden />
            <span className="sr-only">Account menu</span>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 pb-2">
          <span className="text-sm font-medium text-foreground">{user.name ?? "Signed in"}</span>
          <span className="truncate font-normal">{user.email}</span>
          {mode === "dev" && (
            <span className="mt-1 w-fit rounded bg-warning-soft px-1.5 text-2xs text-warning-soft-foreground">
              Dev auth
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/my/bookings">
            <CalendarHeart /> My bookings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/my/connected-apps">
            <Plug /> Connected apps
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? <Moon /> : theme === "light" ? <Sun /> : <Monitor />} Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ redirectUrl: "/" })}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
