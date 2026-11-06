"use client";

import { useState } from "react";
import type { CustomerDetail } from "@/lib/api/types";
import { useEraseCustomer } from "@/lib/api/hooks";
import { useBusinessContext } from "@/lib/business/business-context";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { withToast } from "@/components/common/with-toast";

/** GDPR erase with typed confirmation. */
export function EraseDialog({
  customer,
  open,
  onOpenChange,
  onErased,
  returnFocusTo,
}: {
  customer: Pick<CustomerDetail, "id" | "name">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onErased: () => void;
  /** Where focus goes on closing, when what opened it has gone (a menu item). */
  returnFocusTo?: HTMLElement | null;
}) {
  const { business } = useBusinessContext();
  const { v } = useVocabulary();
  const erase = useEraseCustomer(business.id);
  const [typed, setTyped] = useState("");
  const match = typed.trim().toLowerCase() === customer.name.trim().toLowerCase();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTyped("");
      }}
    >
      <DialogContent
        size="sm"
        onCloseAutoFocus={(e) => {
          if (!returnFocusTo) return;
          e.preventDefault();
          returnFocusTo.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Erase {customer.name}?</DialogTitle>
          <DialogDescription>
            Their name, email, phone, notes and answers are anonymised on every {v("booking")}.{" "}
            {v("bookings", { title: true })} stay in your reports without personal data. This can&apos;t be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field
            label={
              <>
                Type <span className="font-semibold">{customer.name}</span> to confirm
              </>
            }
          >
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Keep
          </Button>
          <Button
            variant="danger"
            disabled={!match}
            loading={erase.isPending}
            onClick={async () => {
              if (!(await withToast(() => erase.mutateAsync(customer.id), "Personal data erased"))) return;
              onOpenChange(false);
              onErased();
            }}
          >
            Erase permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
