"use client";

import { useState } from "react";
import { LayoutList, Users } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Demo, Section } from "./section";

export function NavigationSection() {
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  return (
    <Section id="navigation" title="Tabs & segmented control">
      <div className="flex flex-col gap-8">
        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming" className="text-sm text-muted-foreground">
            Underline tabs for page sections.
          </TabsContent>
          <TabsContent value="past" className="text-sm text-muted-foreground">
            Past bookings.
          </TabsContent>
          <TabsContent value="cancelled" className="text-sm text-muted-foreground">
            Cancelled bookings.
          </TabsContent>
        </Tabs>
        <Demo>
          <Tabs defaultValue="details">
            <TabsList variant="pill">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </Tabs>
          <SegmentedControl
            aria-label="Calendar view"
            value={view}
            onValueChange={setView}
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
            ]}
          />
          <SegmentedControl
            aria-label="Layout"
            size="sm"
            value={layout}
            onValueChange={setLayout}
            options={[
              { value: "list", label: "List", icon: <LayoutList /> },
              { value: "grid", label: "Grid", icon: <Users /> },
            ]}
          />
        </Demo>
      </div>
    </Section>
  );
}
