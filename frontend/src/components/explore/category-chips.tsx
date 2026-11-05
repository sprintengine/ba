"use client";

import { LayoutGrid } from "lucide-react";
import type { MarketplaceCategory } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "./category-icon";

/** Horizontally scrolling category toggles ("All" + one per category). */
export function CategoryChips({
  categories,
  value,
  onValueChange,
  loading,
}: {
  categories: MarketplaceCategory[] | undefined;
  value: string | null;
  onValueChange: (key: string | null) => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div aria-hidden className="flex gap-2 overflow-hidden">
        {["w-16", "w-28", "w-24", "w-32", "w-20", "w-28"].map((w, i) => (
          <Skeleton key={i} className={cn("h-9 shrink-0 rounded-full", w)} />
        ))}
      </div>
    );
  }
  if (!categories?.length) return null;
  return (
    <div
      role="group"
      aria-label="Categories"
      // One line at every size, so the results start high; the chosen one is scrolled into view.
      className="-mx-5 flex [scrollbar-width:none] gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] px-5 pr-10 pb-1 [&::-webkit-scrollbar]:hidden"
    >
      <Chip active={value === null} onClick={() => onValueChange(null)} icon={<LayoutGrid />}>
        All
      </Chip>
      {categories.map((c) => (
        <Chip
          key={c.key}
          active={value === c.key}
          onClick={() => onValueChange(value === c.key ? null : c.key)}
          icon={<CategoryIcon category={c.key} />}
        >
          {c.label}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      ref={active ? (el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 pointer-coarse:h-11",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      <span aria-hidden className="inline-flex">
        {icon}
      </span>
      {children}
    </button>
  );
}
