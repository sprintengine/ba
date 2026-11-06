import { ChevronLeft, ChevronRight, Lock, PanelLeft, Plus, RotateCw, Share, SquareStack } from "lucide-react";
import { cn } from "@/lib/utils";

/** The toolbar's height, for frames that have to add up to a phone beside them. */
export const WINDOW_BAR = "2.75rem";

const LIGHTS = ["#ff5f57", "#febc2e", "#28c840"];

/** A desktop browser's bar, at its true sizes: the window's three lights, its buttons, and the address in the middle. */
function WindowBar({ address, note }: { address: string; note?: string }) {
  return (
    <div className="relative flex h-(--window-bar) shrink-0 items-center gap-2.5 border-b border-black/10 bg-[#f6f6f6] px-3 text-black/55 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]">
      <span className="flex gap-2 pr-1">
        {LIGHTS.map((colour) => (
          <i
            key={colour}
            className="size-3 rounded-full shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.14)]"
            style={{ background: colour }}
          />
        ))}
      </span>
      <PanelLeft className="max-md:hidden" />
      <ChevronLeft className="max-md:hidden" />
      <ChevronRight className="text-black/25 max-md:hidden" />
      <span className="mx-auto flex h-7 w-full max-w-[24rem] min-w-0 items-center justify-center gap-1.5 rounded-lg bg-black/[0.055] px-2.5 text-[0.8125rem] text-black/80 max-sm:text-xs">
        <Lock className="size-3! text-black/45 max-sm:hidden" />
        <span className="truncate">{address}</span>
        <RotateCw className="ml-auto size-3! text-black/45 max-sm:hidden" />
      </span>
      {note && (
        <span className="shrink-0 rounded-md bg-black/[0.055] px-2 py-0.5 text-xs font-medium whitespace-nowrap text-black/70 max-lg:hidden">
          {note}
        </span>
      )}
      <Share className="max-md:hidden" />
      <Plus className="max-md:hidden" />
      <SquareStack className="max-md:hidden" />
    </div>
  );
}

/** The app as it's really seen: in a browser window, with the window's own edge and shadow. */
export function BrowserWindow({
  address = "bookanything.ie",
  note,
  className,
  children,
}: {
  address?: string;
  /** What the window is showing, when that needs saying: "Sample business". */
  note?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden
      inert
      style={{ "--window-bar": WINDOW_BAR } as React.CSSProperties}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[0.8125rem] bg-background shadow-[0_0_0_0.5px_rgb(0_0_0/0.28),0_1px_2px_rgb(0_0_0/0.1),0_18px_32px_-14px_rgb(0_0_0/0.22),0_48px_90px_-36px_rgb(0_0_0/0.34)]",
        className,
      )}
    >
      <WindowBar address={address} note={note} />
      {children}
    </div>
  );
}
