import { ChevronLeft, ChevronRight, Lock, RotateCw } from "lucide-react";

/** A desktop browser window around the replica: traffic lights, history arrows and the address bar. */
export function BrowserChrome({
  url,
  width,
  height,
  children,
}: {
  url: string;
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-[14px] bg-surface shadow-[0_30px_80px_-20px_rgb(0_0_0/0.35),0_0_0_1px_var(--border)] dark:shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7),0_0_0_1px_var(--border)]"
      style={{ width }}
    >
      <div className="relative flex h-11 items-center gap-4 border-b border-border bg-surface-sunken px-4">
        <div className="flex gap-2">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex gap-1 text-subtle-foreground">
          <ChevronLeft className="size-4.5" />
          <ChevronRight className="size-4.5 opacity-50" />
        </div>
        <div className="absolute left-1/2 flex h-7 w-[26rem] -translate-x-1/2 items-center justify-center gap-1.5 rounded-lg bg-background px-3 text-[0.8125rem] text-muted-foreground ring-1 ring-border">
          <Lock className="size-3" />
          <span className="truncate">{url}</span>
          <RotateCw className="absolute right-2.5 size-3 text-subtle-foreground" />
        </div>
      </div>
      <div className="relative overflow-hidden" style={{ height }}>
        {children}
      </div>
    </div>
  );
}

/** A modern phone: rounded bezel, dynamic island and status bar. `width`/`height` are the screen size. */
export function PhoneChrome({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[3.25rem] bg-gray-950 p-3 shadow-[0_40px_90px_-25px_rgb(0_0_0/0.45),inset_0_0_0_1.5px_rgb(255_255_255/0.08)] ring-1 ring-black/40">
      <div className="relative overflow-hidden rounded-[2.5rem] bg-background" style={{ width, height }}>
        <div className="absolute inset-x-0 top-0 z-40 flex h-12 items-center justify-between px-8 text-[0.9375rem] font-semibold">
          <span>9:41</span>
          <span className="absolute top-2.5 left-1/2 h-7.5 w-28 -translate-x-1/2 rounded-full bg-black" />
          <span className="flex items-center gap-1.5">
            <svg viewBox="0 0 18 12" className="h-3 w-4.5" fill="currentColor">
              <rect x="0" y="8" width="3" height="4" rx="1" />
              <rect x="5" y="5" width="3" height="7" rx="1" />
              <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
              <rect x="15" y="0" width="3" height="12" rx="1" />
            </svg>
            <svg viewBox="0 0 26 12" className="h-3 w-6.5" fill="none" stroke="currentColor">
              <rect x="0.5" y="0.5" width="22" height="11" rx="3.5" opacity="0.4" />
              <rect x="2" y="2" width="17" height="8" rx="2" fill="currentColor" stroke="none" />
              <path d="M24.5 4v4" strokeLinecap="round" opacity="0.4" />
            </svg>
          </span>
        </div>
        {children}
        <div className="absolute bottom-2 left-1/2 z-40 h-1.5 w-32 -translate-x-1/2 rounded-full bg-foreground/80" />
      </div>
    </div>
  );
}
