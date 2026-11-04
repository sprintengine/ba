"use client";

import { Layers, Plus } from "lucide-react";
import type { BusinessSetup } from "@/lib/api/types";
import { PAYMENT_MODE_COPY } from "@/lib/catalog/services";
import type { SetupAction } from "@/lib/onboarding/actions";
import { durationLabel, priceLabel } from "@/lib/booking/quote";
import type { SetupErrors } from "@/lib/onboarding/types";
import { Button } from "@/components/ui/button";
import { ItemRow, SectionCard } from "./section-card";
import { ServiceEditor } from "./service-editor";

export function ServicesSection({
  setup,
  errors,
  expandedIndex,
  onExpand,
  dispatch,
}: {
  setup: BusinessSetup;
  errors: SetupErrors;
  expandedIndex: number | null;
  onExpand: (index: number | null) => void;
  dispatch: (action: SetupAction) => void;
}) {
  const problems = Object.keys(errors).filter((k) => k.startsWith("services")).length;
  const count = setup.services.length;
  return (
    <SectionCard
      id="section-services"
      icon={<Layers />}
      title="Services"
      summary={
        count === 0
          ? "What customers can book."
          : `${count} ${count === 1 ? "service" : "services"} customers can book.`
      }
      problems={problems}
    >
      <div className="flex flex-col gap-3">
        {count === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Add at least one service so customers have something to book.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {setup.services.map((s, i) => {
              const prefix = `services[${i}].`;
              const invalid = Object.keys(errors).some((k) => k.startsWith(prefix));
              return (
                <ItemRow
                  key={i}
                  id={`item-services-${i}`}
                  expanded={expandedIndex === i}
                  onToggle={() => onExpand(expandedIndex === i ? null : i)}
                  invalid={invalid}
                  leading={
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                  }
                  title={s.name.trim() || "Unnamed service"}
                  meta={[
                    durationLabel(s),
                    s.category,
                    PAYMENT_MODE_COPY[s.paymentMode].short,
                    s.requiresApproval ? "Needs approval" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  aside={priceLabel(s, setup.currency)}
                >
                  <ServiceEditor
                    setup={setup}
                    service={s}
                    index={i}
                    errors={errors}
                    dispatch={dispatch}
                    onRemoved={() => onExpand(null)}
                  />
                </ItemRow>
              );
            })}
          </ul>
        )}
        <Button
          size="sm"
          className="self-start"
          onClick={() => {
            onExpand(count);
            dispatch({ type: "addService" });
          }}
        >
          <Plus />
          Add service
        </Button>
      </div>
    </SectionCard>
  );
}
