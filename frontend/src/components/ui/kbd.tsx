import { cn } from "@/lib/utils";

/** Keyboard hint: <Kbd>⌘</Kbd><Kbd>K</Kbd> */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border bg-surface-sunken px-1 font-sans text-[0.6875rem] font-medium text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]",
        className,
      )}
      {...props}
    />
  );
}
