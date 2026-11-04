import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";
import { Tooltip } from "./tooltip";

const iconButtonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center rounded-lg transition-[background-color,color,border-color,transform] duration-150",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "active:scale-95 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none",
  ],
  {
    variants: {
      variant: {
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground",
        secondary:
          "border border-border bg-surface text-foreground shadow-xs hover:bg-accent dark:bg-surface-raised",
        primary: "bg-primary text-primary-foreground shadow-button hover:bg-primary-hover",
        danger: "text-danger-soft-foreground hover:bg-danger-soft",
      },
      // On touch screens every size is at least a 40px target (44px from `sm` up).
      size: {
        xs: "size-6 rounded-md pointer-coarse:size-10 [&_svg]:size-3.5",
        sm: "size-8 pointer-coarse:size-11 [&_svg]:size-4",
        md: "size-9 pointer-coarse:size-11 [&_svg]:size-[1.125rem]",
        lg: "size-11 [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "ghost", size: "sm" },
  },
);

export type IconButtonProps = Omit<React.ComponentProps<"button">, "aria-label"> &
  VariantProps<typeof iconButtonVariants> & {
    /** Accessible name — required. Also shown as a tooltip unless `tooltip={false}`. */
    label: string;
    tooltip?: boolean;
    loading?: boolean;
  };

/** Square icon-only button. Always has an accessible label (and a tooltip by default). */
export function IconButton({
  label,
  tooltip = true,
  loading,
  variant,
  size,
  className,
  children,
  disabled,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type="button"
      aria-label={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}
