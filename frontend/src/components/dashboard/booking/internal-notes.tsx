"use client";

import { useState } from "react";
import type { BookingDetail } from "@/lib/api/types";
import { useUpdateBooking } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { withToast } from "@/components/common/with-toast";
import { PanelSection } from "../common";

/** Team-only notes on a booking: edit in place, ⌘↵ or "Save notes" to save, "Discard" to drop the draft. */
export function InternalNotes({ booking }: { booking: BookingDetail }) {
  const business = useCurrentBusiness();
  const [draft, setDraft] = useState<string | null>(null);
  const update = useUpdateBooking(business.id);
  const value = draft ?? booking.internalNotes ?? "";
  const dirty = draft !== null && draft !== (booking.internalNotes ?? "");

  const save = async () => {
    const saved = await withToast(
      () => update.mutateAsync({ id: booking.id, input: { internalNotes: value.trim() ? value : null } }),
      "Notes saved",
    );
    if (saved) setDraft(null);
  };

  return (
    <PanelSection
      title="Internal notes"
      action={
        <span className="text-2xs text-subtle-foreground">
          {dirty ? "Unsaved · ⌘↵ to save" : "Only your team sees these"}
        </span>
      }
    >
      <Textarea
        aria-label="Internal notes"
        placeholder="Add a note"
        value={value}
        rows={2}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && dirty) {
            e.preventDefault();
            void save();
          }
        }}
      />
      {dirty && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
            Discard
          </Button>
          <Button size="sm" variant="primary" loading={update.isPending} onClick={save}>
            Save notes
          </Button>
        </div>
      )}
    </PanelSection>
  );
}
