"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { isApiError } from "@/lib/api/client";
import { useInviteTeamMember } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { assignableRoles, roleInfo } from "@/lib/business/permissions";
import { useVocabulary } from "@/lib/vocabulary";
import { dashboardHref } from "@/components/shells/dashboard-nav";
import { applyApiErrors, FormField, FormRootError } from "@/components/ui/form";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioCards } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

const inviteSchema = z.object({
  email: z.email("Enter a valid email"),
  role: z.enum(["owner", "admin", "staff"]),
  resourceId: z.string(),
});
type InviteValues = z.infer<typeof inviteSchema>;

/** Invite someone by email, with a role and optionally their calendar. */
export function InviteDialog({
  open,
  onOpenChange,
  people,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  people: { id: string; name: string }[];
}) {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const invite = useInviteTeamMember(business.id);
  const info = roleInfo(v);
  const [limit, setLimit] = useState<string | null>(null);
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "staff", resourceId: "none" },
  });
  const selectedRole = useWatch({ control: form.control, name: "role" });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      title={`Invite to ${business.name}`}
      description="They get an email with a link. The invite is accepted when they sign in with this address."
      submitLabel="Send invite"
      onSubmit={async (values) => {
        try {
          await invite.mutateAsync({
            email: values.email.trim(),
            role: values.role,
            resourceId: values.resourceId === "none" ? null : values.resourceId,
          });
          toast.success(`Invite sent to ${values.email}`);
          onOpenChange(false);
        } catch (err) {
          if (isApiError(err) && err.code === "PLAN_LIMIT_REACHED") setLimit(err.message);
          else applyApiErrors(form, err);
        }
      }}
    >
      <FormField<InviteValues, "email"> name="email" label="Email" required>
        {(field) => (
          <Input {...field} type="email" autoComplete="off" placeholder="jordan@example.com" autoFocus />
        )}
      </FormField>
      <FormField<InviteValues, "role"> name="role" label="Role">
        {(field) => (
          <RadioCards value={field.value} onValueChange={field.onChange}>
            {assignableRoles(perms.role)
              .slice()
              .reverse()
              .map((r) => (
                <RadioCard
                  key={r}
                  value={r}
                  title={info[r].label}
                  description={info[r].summary}
                  className="p-3"
                />
              ))}
          </RadioCards>
        )}
      </FormField>
      {people.length > 0 && (
        <FormField<InviteValues, "resourceId">
          name="resourceId"
          label="Their calendar"
          optional
          help={
            selectedRole === "staff"
              ? `Pick one, and they see ${v("bookings")} on that calendar only.`
              : "Link them to their own calendar column."
          }
        >
          {(field) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No calendar</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}
      {limit && (
        <div
          role="alert"
          className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2.5 text-sm text-warning-soft-foreground"
        >
          {limit}{" "}
          {perms.manageBilling && (
            <Link
              href={dashboardHref(business.slug, "settings/billing")}
              className="font-medium underline underline-offset-2"
            >
              See plans
            </Link>
          )}
        </div>
      )}
      <FormRootError />
    </FormDialog>
  );
}
