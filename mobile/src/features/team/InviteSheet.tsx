import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { isApiError } from "@shared/api/client";
import { useInviteTeamMember } from "@shared/api/hooks/use-team";
import { useBusinessContext, usePermissions } from "@shared/business/business-context";
import { assignableRoles, roleInfo } from "@shared/business/permissions";
import { useVocabulary } from "@shared/vocabulary";
import { Banner, Button, Sheet, Text } from "~/ui";
import {
  applyApiErrors,
  confirmDiscard,
  FormRadioGroup,
  FormRootError,
  FormSelect,
  FormTextField,
  useSaveFeedback,
} from "~/ui/form";

/** The website's invite-dialog schema. */
const inviteSchema = z.object({
  email: z.email("Enter a valid email"),
  role: z.enum(["owner", "admin", "staff"]),
  resourceId: z.string(),
});
type InviteValues = z.infer<typeof inviteSchema>;

/** Invite someone by email, with a role and optionally their calendar (the website's InviteDialog). */
export function InviteSheet({
  visible,
  onClose,
  people,
}: {
  visible: boolean;
  onClose: () => void;
  people: { id: string; name: string }[];
}) {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const { v } = useVocabulary();
  const invite = useInviteTeamMember(business.id);
  const feedback = useSaveFeedback();
  const info = roleInfo(v);
  const [limit, setLimit] = useState<string | null>(null);
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "staff", resourceId: "none" },
  });
  const role = useWatch({ control: form.control, name: "role" });

  const close = async () => {
    if (form.formState.isDirty && !(await confirmDiscard())) return;
    form.reset();
    setLimit(null);
    onClose();
  };

  const submit = form.handleSubmit(async (values) => {
    setLimit(null);
    try {
      await invite.mutateAsync({
        email: values.email.trim(),
        role: values.role,
        resourceId: values.resourceId === "none" ? null : values.resourceId,
      });
      feedback.saved(`Invite sent to ${values.email.trim()}`);
      form.reset();
      onClose();
    } catch (err) {
      if (isApiError(err) && err.code === "PLAN_LIMIT_REACHED") setLimit(err.message);
      else applyApiErrors(form, err);
    }
  });

  return (
    <Sheet
      visible={visible}
      onClose={() => void close()}
      title={`Invite to ${business.name}`}
      testID="invite-sheet"
      footer={
        <Button
          testID="invite-send"
          label="Send invite"
          fullWidth
          loading={form.formState.isSubmitting}
          onPress={() => void submit()}
        />
      }
    >
      <Banner tone="neutral">
        They get an email with a link. The invite is accepted when they sign in with this address.
      </Banner>
      <FormTextField
        control={form.control}
        name="email"
        label="Email"
        testID="invite-email"
        placeholder="jordan@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        textContentType="emailAddress"
        autoFocus
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
      />
      <FormRadioGroup
        control={form.control}
        name="role"
        label="Role"
        testID="invite-role"
        options={assignableRoles(perms.role)
          .slice()
          .reverse()
          .map((r) => ({ value: r, label: info[r].label, description: info[r].summary }))}
      />
      {people.length > 0 ? (
        <FormSelect
          control={form.control}
          name="resourceId"
          label="Their calendar (optional)"
          testID="invite-calendar"
          options={[
            { value: "none", label: "No calendar" },
            ...people.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      ) : null}
      {people.length > 0 ? (
        <Text variant="footnote" tone="subtle">
          {role === "staff"
            ? `Staff see ${v("bookings")} on this calendar only.`
            : "Link them to their own calendar column."}
        </Text>
      ) : null}
      {limit ? (
        <Banner
          tone="warning"
          testID="invite-limit"
          action={
            perms.manageBilling ? (
              <Button
                label="See plans"
                variant="secondary"
                size="sm"
                onPress={() => {
                  form.reset();
                  setLimit(null);
                  onClose();
                  router.push(`/dashboard/${business.slug}/settings/billing`);
                }}
              />
            ) : undefined
          }
        >
          {limit}
        </Banner>
      ) : null}
      <FormRootError control={form.control} />
    </Sheet>
  );
}
