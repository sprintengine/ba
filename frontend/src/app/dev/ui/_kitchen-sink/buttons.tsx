"use client";

import { useState } from "react";
import { Bell, CalendarPlus, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Demo, Section } from "./section";

export function ButtonsSection() {
  const [loading, setLoading] = useState(false);
  return (
    <Section id="buttons" title="Buttons" description="Button, IconButton. One primary action per surface.">
      <div className="flex flex-col gap-6">
        <Demo label="Variants">
          <Button variant="primary">Save changes</Button>
          <Button variant="brand">Get started</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="soft">Invite team</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="danger">Delete</Button>
          <Button variant="danger-soft">Remove</Button>
          <Button variant="link">View all</Button>
        </Demo>
        <Demo label="Sizes & icons">
          <Button variant="primary" size="xs">
            <Plus /> Extra small
          </Button>
          <Button variant="primary" size="sm">
            <Plus /> Small
          </Button>
          <Button variant="primary">
            <CalendarPlus /> New booking
          </Button>
          <Button variant="primary" size="lg">
            Book now
          </Button>
          <Button variant="brand" size="xl">
            Start for free
          </Button>
        </Demo>
        <Demo label="States">
          <Button
            variant="primary"
            loading={loading}
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1500);
            }}
          >
            Click to load
          </Button>
          <Button variant="secondary" loading>
            Saving
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </Demo>
        <Demo label="IconButton (label → aria-label + tooltip)">
          <IconButton label="Edit">
            <Pencil />
          </IconButton>
          <IconButton label="Copy link" variant="secondary">
            <Copy />
          </IconButton>
          <IconButton label="Notifications" variant="secondary" size="md">
            <Bell />
          </IconButton>
          <IconButton label="Delete" variant="danger">
            <Trash2 />
          </IconButton>
          <IconButton label="Add" variant="primary" size="md">
            <Plus />
          </IconButton>
          <IconButton label="Working" loading variant="secondary" />
        </Demo>
      </div>
    </Section>
  );
}
