"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CreditCard, Euro, Mail, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, CheckboxItem } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Form, FormField, FormRootError, FormSubmit } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { RadioCard, RadioCards, RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Section } from "./section";

const schema = z.object({
  name: z.string().trim().min(2, "Enter the customer's full name"),
  email: z.email("Enter a valid email address"),
  notes: z.string().max(500).optional(),
});

export function FormsSection() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "not-an-email", notes: "" },
  });
  const [service, setService] = useState<string>("assessment");
  const [customer, setCustomer] = useState<string | null>("c2");
  const [notify, setNotify] = useState(true);
  const [mode, setMode] = useState("full");

  return (
    <Section
      id="forms"
      title="Form controls"
      description="Field wires label/help/error + aria to any control. FormField binds it to react-hook-form + zod."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>New customer</CardTitle>
            <CardDescription>Form + FormField + zod. Submit to see validation.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form
              form={form}
              onSubmit={async () => {
                await new Promise((r) => setTimeout(r, 900));
                form.setError("root", { message: "A customer with this email already exists." });
              }}
            >
              <FormField name="name" label="Full name" required>
                {(field) => <Input placeholder="Alex Morgan" {...field} />}
              </FormField>
              <FormField name="email" label="Email" help="We'll send confirmations here.">
                {(field) => <Input type="email" leading={<Mail />} {...field} />}
              </FormField>
              <FormField name="notes" label="Notes" optional>
                {(field) => (
                  <Textarea
                    placeholder="Anything the team should know"
                    {...field}
                    value={(field.value as string | undefined) ?? ""}
                  />
                )}
              </FormField>
              <FormRootError />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => form.reset()}>
                  Reset
                </Button>
                <FormSubmit>Create customer</FormSubmit>
              </div>
            </Form>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <Field label="Search">
            <Input placeholder="Search bookings…" leading={<Search />} trailing={<Kbd>/</Kbd>} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Service">
              <Select value={service} onValueChange={setService}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assessment">Initial assessment</SelectItem>
                  <SelectItem value="followup">Follow-up</SelectItem>
                  <SelectItem value="massage">Sports massage</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Customer" help="Searchable combobox.">
              <Combobox
                value={customer}
                onValueChange={setCustomer}
                placeholder="Select customer"
                options={[
                  { value: "c1", label: "Alex Morgan", hint: "aoife@example.ie" },
                  { value: "c2", label: "Jordan Casey", hint: "ciaran@example.ie" },
                  { value: "c3", label: "Sam Taylor", hint: "niamh@example.ie" },
                ]}
              />
            </Field>
          </div>
          <Field label="Disabled input" disabled>
            <Input value="bookanything.ie/lumen-physio" readOnly />
          </Field>
          <Field label="Reference" error="That reference doesn't exist.">
            <Input defaultValue="BA-XXXXXX" className="font-mono" />
          </Field>
          <Field orientation="horizontal" label="Notify customer" help="Send an email about this change.">
            <Switch checked={notify} onCheckedChange={setNotify} />
          </Field>
          <div className="flex flex-wrap gap-6">
            <CheckboxItem label="Requires approval" description="You confirm each booking." defaultChecked />
            <div className="flex items-center gap-2">
              <Checkbox checked="indeterminate" aria-label="Select all" />{" "}
              <span className="text-sm">Indeterminate</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch size="sm" defaultChecked aria-label="Small switch" />{" "}
              <span className="text-sm">Small switch</span>
            </div>
          </div>
          <RadioGroup defaultValue="policy" aria-label="Refund">
            <RadioItem
              value="policy"
              label="Refund per policy"
              description="Full refund — cancelled 3 days ahead."
            />
            <RadioItem value="full" label="Full refund" />
            <RadioItem value="none" label="No refund" />
          </RadioGroup>
        </div>
      </div>
      <div className="mt-8">
        <RadioCards value={mode} onValueChange={setMode} columns={3} aria-label="Payment mode">
          <RadioCard
            value="full"
            title="Full prepayment"
            description="Customers pay when they book."
            icon={<CreditCard />}
          />
          <RadioCard
            value="deposit"
            title="Deposit"
            description="Take a deposit, rest at the venue."
            icon={<Wallet />}
            aside="€20"
          />
          <RadioCard value="at_venue" title="Pay at venue" description="No online payment." icon={<Euro />} />
        </RadioCards>
      </div>
    </Section>
  );
}
