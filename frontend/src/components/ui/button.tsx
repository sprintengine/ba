import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

/**
 * Button. Variants:
 *  - primary   — the one main action on a surface (ink in the app; business colour on public pages)
 *  - brand     — bookanything iris; marketing CTAs
 *  - secondary — bordered surface button; most actions
 *  - ghost     — toolbar / low-emphasis
 *  - soft      — tinted brand, for secondary-but-positive actions
 *  - danger / danger-soft — destructive
 *  - danger-ghost — a low-emphasis destructive action beside others (Remove, Delete, Cancel booking)
 *  - link      — inline text action
 */
export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap select-none",
    "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-button hover:bg-primary-hover",
        brand: "bg-brand text-brand-foreground shadow-button hover:bg-brand-hover",
        secondary:
          "border border-border bg-surface text-foreground shadow-xs hover:border-border-strong hover:bg-accent dark:bg-surface-raised dark:hover:bg-accent",
        ghost: "text-foreground hover:bg-accent data-[state=open]:bg-accent",
        soft: "bg-brand-soft text-brand-soft-foreground hover:bg-brand-soft/70",
        danger: "bg-danger text-danger-foreground shadow-button hover:bg-danger-hover",
        "danger-soft": "bg-danger-soft text-danger-soft-foreground hover:bg-danger-soft/70",
        "danger-ghost": "text-danger-soft-foreground hover:bg-danger-soft data-[state=open]:bg-danger-soft",
        link: "h-auto px-0 text-brand underline-offset-4 hover:underline active:scale-100",
      },
      // On touch screens every size is at least a 40px target (44px from `sm` up).
      size: {
        xs: "h-7 rounded-button-sm px-2.5 text-xs pointer-coarse:h-10 [&_svg]:size-3.5",
        sm: "h-8 rounded-button-sm px-3 text-sm pointer-coarse:h-11 [&_svg]:size-4",
        md: "h-9 rounded-button px-3.5 text-sm pointer-coarse:h-11 [&_svg]:size-4",
        lg: "h-11 rounded-button px-5 text-base [&_svg]:size-[1.125rem]",
        xl: "h-12 rounded-button-lg px-6 text-base [&_svg]:size-5",
      },
      block: { true: "w-full" },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a Next <Link>) with button styles. */
    asChild?: boolean;
    /** Shows a spinner, keeps width, disables the button. */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  loading = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, block }), className);
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className="invisible inline-flex items-center gap-2">{children}</span>
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner label="Working" />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
