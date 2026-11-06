"use client";

import { SlidersHorizontal } from "lucide-react";
import type { ExploreFilters } from "@/lib/explore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { FiltersPanel } from "./filters-panel";

/** "Filters" button + bottom drawer for small screens (the bar takes over from `xl`). */
export function MobileFilters({
  filters,
  activeCount,
  onChange,
  onClear,
}: {
  filters: ExploreFilters;
  activeCount: number;
  onChange: (patch: Partial<ExploreFilters>) => void;
  onClear: () => void;
}) {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="xl:hidden"
          aria-label={activeCount > 0 ? `Filters (${activeCount} active)` : undefined}
        >
          <SlidersHorizontal /> Filters
          {activeCount > 0 && (
            <Badge tone="solid" className="tnum h-4.5 px-1.5">
              {activeCount}
            </Badge>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filters</DrawerTitle>
          <DrawerDescription>Results update as you change them.</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <FiltersPanel filters={filters} onChange={onChange} />
        </DrawerBody>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="primary" size="lg" block>
              Show results
            </Button>
          </DrawerClose>
          {activeCount > 0 && (
            <Button variant="ghost" size="lg" block onClick={onClear}>
              Clear filters
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
