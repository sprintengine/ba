"use client";

import { useState } from "react";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";

/** Pick the dates of a new seasonal schedule. */
export function AddPeriodDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (from: string, until: string | null) => void;
}) {
  const business = useCurrentBusiness();
  const [from, setFrom] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const error = from && until && until < from ? "The end is before the start" : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Seasonal hours</DialogTitle>
          <DialogDescription>
            Extra hours for a date range — summer evenings, a holiday rota. They add to your regular hours.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Field label="From">
            <DatePicker value={from} onValueChange={setFrom} timeZone={business.timezone} />
          </Field>
          <Field label="Until" optional error={error}>
            <DatePicker
              value={until}
              onValueChange={setUntil}
              min={from ?? undefined}
              timeZone={business.timezone}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!from || !!error}
            onClick={() => {
              onAdd(from!, until);
              onOpenChange(false);
              setFrom(null);
              setUntil(null);
            }}
          >
            Add period
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
