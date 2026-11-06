import Link from "next/link";
import { cn } from "@/lib/utils";
import { railClass, railIdle, type RailItem } from "./dashboard-nav";

/** One item in the rail: a link in the app; without `href`, the same item on a sample of it. */
export function RailEntry({
  item,
  label,
  active,
  href,
  className,
  ...props
}: {
  item: RailItem;
  label: string;
  active: boolean;
  href?: string;
} & Omit<React.ComponentProps<"span">, "children">) {
  const look = cn(railClass, active ? "bg-background font-semibold text-foreground" : railIdle, className);
  const content = (
    <>
      <item.icon strokeWidth={active ? 2.25 : 1.75} />
      <span className="max-w-full truncate">{label}</span>
    </>
  );
  if (!href) {
    return (
      <span className={look} {...props}>
        {content}
      </span>
    );
  }
  return (
    <Link href={href} aria-current={active ? "page" : undefined} title={label} className={look}>
      {content}
    </Link>
  );
}
