"use client";

import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Search, UserPlus } from "lucide-react";
import { useCustomers } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import type { NewBookingPrefill, NewBookingValues as Values } from "@/lib/dashboard/new-booking";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useVocabulary } from "@/lib/vocabulary";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

/** Step 3: find an existing customer, or switch to entering a new one (prefilled from the search). */
export function CustomerFields({ prefill }: { prefill?: NewBookingPrefill["customer"] }) {
  const business = useCurrentBusiness();
  const { v } = useVocabulary();
  const form = useFormContext<Values>();
  const newCustomer = useWatch({ control: form.control, name: "newCustomer" });
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 200);
  const customers = useCustomers(business.id, { q: q || undefined, limit: 20 }, { enabled: !newCustomer });
  const [picked, setPicked] = useState<NewBookingPrefill["customer"] | null>(prefill ?? null);
  const options = useMemo(() => {
    const list = (customers.data?.items ?? []).map((c) => ({
      value: c.id,
      label: c.name,
      hint: c.email ?? c.phone ?? undefined,
    }));
    if (picked && !list.some((o) => o.value === picked.id)) {
      list.unshift({ value: picked.id, label: picked.name, hint: picked.email ?? picked.phone ?? undefined });
    }
    return list;
  }, [customers.data, picked]);

  if (newCustomer) {
    return (
      <div className="flex flex-col gap-3.5 rounded-xl border border-border bg-surface-sunken/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">New {v("customer")}</span>
          <Button size="xs" variant="ghost" onClick={() => form.setValue("newCustomer", false)}>
            <Search /> Search existing
          </Button>
        </div>
        <FormField<Values, "customer.name"> name="customer.name" label="Name" required>
          {(field) => <Input {...field} autoComplete="off" placeholder="Alex Morgan" />}
        </FormField>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <FormField<Values, "customer.email">
            name="customer.email"
            label="Email"
            optional
            help="For confirmations and reminders."
          >
            {(field) => <Input {...field} type="email" autoComplete="off" placeholder="alex@example.com" />}
          </FormField>
          <FormField<Values, "customer.phone">
            name="customer.phone"
            label="Phone"
            optional={!business.policies.requireCustomerPhone}
          >
            {(field) => <Input {...field} type="tel" autoComplete="off" />}
          </FormField>
        </div>
      </div>
    );
  }

  return (
    <FormField<Values, "customerId"> name="customerId" label={`Find a ${v("customer")}`} required>
      {(field) => (
        <Combobox
          options={options}
          value={field.value}
          onValueChange={(id) => {
            field.onChange(id);
            const c = customers.data?.items.find((x) => x.id === id);
            if (c) setPicked({ id: c.id, name: c.name, email: c.email, phone: c.phone });
          }}
          placeholder={`Search by name, email or phone`}
          searchPlaceholder="Name, email or phone…"
          shouldFilter={false}
          onSearchChange={setSearch}
          emptyText={customers.isFetching ? "Searching…" : `No ${v("customers")} found.`}
          footer={
            <Button
              size="sm"
              variant="ghost"
              block
              className="justify-start"
              onClick={() => {
                const s = search.trim();
                form.setValue("newCustomer", true);
                if (s && !s.includes("@")) form.setValue("customer.name", s);
                if (s.includes("@")) form.setValue("customer.email", s);
              }}
            >
              <UserPlus /> New {v("customer")}
              {search.trim() ? `: “${search.trim()}”` : ""}
            </Button>
          }
        />
      )}
    </FormField>
  );
}
