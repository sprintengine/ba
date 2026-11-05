"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Customer, CustomerInput } from "@/lib/api/types";
import { useCustomerGroups } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import {
  customerSchema,
  customerToValues,
  valuesToCustomerInput,
  type CustomerFormValues,
} from "@/lib/dashboard/customer-schema";
import { applyApiErrors, Form, FormField, FormRootError, FormSubmit } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** Create/edit a customer's contact details, group and notes. */
export function CustomerForm({
  initial,
  submitLabel,
  onSubmit,
  showNotes = true,
  footer,
}: {
  initial?: Customer | null;
  submitLabel: string;
  onSubmit: (input: CustomerInput) => Promise<unknown>;
  showNotes?: boolean;
  footer?: React.ReactNode;
}) {
  const business = useCurrentBusiness();
  const groups = useCustomerGroups(business.id);
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: customerToValues(initial),
  });
  const activeGroups = (groups.data ?? []).filter((g) => g.isActive || g.id === initial?.groupId);

  return (
    <Form
      form={form}
      onSubmit={async (values) => {
        try {
          await onSubmit(valuesToCustomerInput(values));
          form.reset(values);
        } catch (err) {
          applyApiErrors(form, err);
        }
      }}
    >
      <FormField<CustomerFormValues, "name"> name="name" label="Name" required>
        {(field) => <Input {...field} autoComplete="off" />}
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField<CustomerFormValues, "email"> name="email" label="Email" optional className="sm:col-span-2">
          {(field) => <Input {...field} type="email" autoComplete="off" />}
        </FormField>
        <FormField<CustomerFormValues, "phone"> name="phone" label="Phone" optional>
          {(field) => <Input {...field} type="tel" autoComplete="off" />}
        </FormField>
      </div>
      {activeGroups.length > 0 && (
        <FormField<CustomerFormValues, "groupId">
          name="groupId"
          label="Group"
          help="A group can have its own hours or services."
        >
          {(field) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger ref={field.ref}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No group</SelectItem>
                {activeGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                    {g.restricted ? " (restricted)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}
      {showNotes && (
        <FormField<CustomerFormValues, "notes">
          name="notes"
          label="Notes"
          optional
          help="Private to your team."
        >
          {(field) => <Textarea {...field} rows={3} />}
        </FormField>
      )}
      <FormRootError />
      <div className="flex justify-end gap-2">
        {footer}
        <FormSubmit>{submitLabel}</FormSubmit>
      </div>
    </Form>
  );
}
