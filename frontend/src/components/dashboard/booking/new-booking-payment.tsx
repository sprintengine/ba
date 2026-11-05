"use client";

import type { Service } from "@/lib/api/types";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { isPricedService, type NewBookingValues as Values } from "@/lib/dashboard/new-booking";
import { useVocabulary } from "@/lib/vocabulary";
import { FormField } from "@/components/ui/form";
import { RadioCard, RadioCards } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/** Last step: how it is paid (online only when priced and payments are connected), the email, internal notes. */
export function PaymentFields({ service }: { service: Service | undefined }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  // Until a service is chosen nothing is ruled out: the default ("At venue") shouldn't look selected and disabled.
  const unpriced = !!service && !isPricedService(service);
  return (
    <>
      <FormField<Values, "paymentMode"> name="paymentMode" label="Payment">
        {(field) => (
          <RadioCards
            value={field.value}
            onValueChange={field.onChange}
            columns={3}
            className="lg:grid-cols-3"
          >
            <RadioCard
              value="collect_online"
              title="Online"
              description={business.paymentsEnabled ? "Held until paid" : "Connect payments first"}
              disabled={unpriced || !business.paymentsEnabled}
              className="p-3"
            />
            <RadioCard
              value="at_venue"
              title="At venue"
              description="Pay on the day"
              disabled={unpriced}
              className="p-3"
            />
            <RadioCard value="none" title="No charge" description="Nothing to pay" className="p-3" />
          </RadioCards>
        )}
      </FormField>
      <FormField<Values, "notifyCustomer">
        name="notifyCustomer"
        orientation="horizontal"
        label={`Email the ${v("customer")}`}
        help="Confirmation with a link to manage it."
      >
        {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
      </FormField>
      <FormField<Values, "internalNotes"> name="internalNotes" label="Internal notes" optional>
        {(field) => <Textarea {...field} rows={2} placeholder="Only your team can see these notes." />}
      </FormField>
    </>
  );
}
