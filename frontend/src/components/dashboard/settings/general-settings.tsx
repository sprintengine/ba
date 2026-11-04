"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CircleAlert, Globe } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import { useDeleteBusiness, useSlugAvailability, useUpdateBusiness } from "@/lib/api/hooks";
import { useBusinessContext, usePermissions } from "@/lib/business/business-context";
import { supportedTimeZones, timeZoneOptions } from "@/lib/format";
import {
  businessToGeneralValues,
  deleteBusinessDescription,
  generalSettingsSchema,
  generalValuesToUpdate,
  SLUG_PATTERN,
  type GeneralSettingsValues as V,
} from "@/lib/settings/general-form";
import { flattenFieldErrors } from "@/lib/settings/api-fields";
import { useVocabulary } from "@/lib/vocabulary";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { applyApiErrors, Form, FormField, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { CURRENCIES, LOCALES, SaveBar, SettingsCard, SettingsHeader } from "./settings-common";

/**
 * The booking page address's availability, announced politely. Always rendered (even when empty): an Input whose
 * `trailing` appears and disappears re-mounts its <input>, which would drop the focus while someone is typing.
 */
function SlugStatus({ checking, available }: { checking: boolean; available: boolean | undefined }) {
  return (
    <span role="status" className="flex items-center">
      {checking ? (
        <Spinner role="img" label="Checking the address" />
      ) : available === true ? (
        <Check role="img" className="text-success" aria-label="Available" />
      ) : available === false ? (
        <CircleAlert role="img" className="text-danger" aria-label="Taken" />
      ) : null}
    </span>
  );
}

export function GeneralSettings() {
  const { business } = useBusinessContext();
  const perms = usePermissions();
  const router = useRouter();
  const update = useUpdateBusiness(business.id);
  const remove = useDeleteBusiness(business.id);
  const { v } = useVocabulary();
  const form = useForm<V>({
    resolver: zodResolver(generalSettingsSchema),
    defaultValues: businessToGeneralValues(business),
  });
  const slug = useWatch({ control: form.control, name: "slug" });
  const debouncedSlug = useDebouncedValue(slug.trim(), 350);
  const checkSlug =
    debouncedSlug !== business.slug && SLUG_PATTERN.test(debouncedSlug) && debouncedSlug.length >= 3;
  const availability = useSlugAvailability(checkSlug ? debouncedSlug : "");
  const zones = useMemo(() => timeZoneOptions(supportedTimeZones()), []);
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "bookanything.ie";

  const submit = async (v: V) => {
    if (checkSlug && availability.data && !availability.data.available) {
      form.setError("slug", { message: "That address is taken" });
      return;
    }
    const input = generalValuesToUpdate(v);
    try {
      const saved = await update.mutateAsync(input);
      form.reset(businessToGeneralValues(saved));
      toast.success("Settings saved");
      if (saved.slug !== business.slug) router.replace(`/dashboard/${saved.slug}/settings/general`);
    } catch (err) {
      applyApiErrors(form, flattenFieldErrors(err, ["address"]));
    }
  };

  return (
    <>
      <SettingsHeader segment="general" />
      <Form form={form} onSubmit={submit} className="gap-6">
        <SettingsCard title="Your business" description="How you appear on your booking page and in emails.">
          <FormField<V, "name"> name="name" label="Business name" required>
            {(field) => <Input {...field} />}
          </FormField>
          <FormField<V, "slug">
            name="slug"
            label="Booking page address"
            help={
              slug !== business.slug
                ? "Changing it breaks links you've already shared."
                : "Lowercase letters, numbers and hyphens."
            }
          >
            {(field) => (
              <div className="flex">
                {/* A long host shouldn't squeeze out the part people actually edit, so it gives way on phones. */}
                <span
                  title={`${origin}/`}
                  className="inline-flex max-w-[45%] min-w-0 items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground sm:max-w-none sm:shrink-0"
                >
                  <span className="truncate">{origin}/</span>
                </span>
                <div className="min-w-0 flex-1">
                  <Input
                    {...field}
                    className="rounded-l-none"
                    onChange={(e) => field.onChange(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                    trailing={
                      <SlugStatus
                        checking={checkSlug && availability.isFetching}
                        available={checkSlug ? availability.data?.available : undefined}
                      />
                    }
                  />
                </div>
              </div>
            )}
          </FormField>
          {checkSlug && availability.data && !availability.data.available && (
            <p className="-mt-3 text-xs text-danger-soft-foreground">
              Taken.{" "}
              {availability.data.suggestion && (
                <button
                  type="button"
                  className="font-medium underline underline-offset-2"
                  onClick={() =>
                    form.setValue("slug", availability.data.suggestion!, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  Use {availability.data.suggestion}
                </button>
              )}
            </p>
          )}
          <FormField<V, "description">
            name="description"
            label="About"
            optional
            help="A sentence or two at the top of your booking page."
          >
            {(field) => <Textarea {...field} rows={3} />}
          </FormField>
          <FormField<V, "published">
            name="published"
            orientation="horizontal"
            label="Published"
            help="When off, your booking page is hidden from the public and only your team can preview it."
          >
            {(field) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          </FormField>
        </SettingsCard>

        <SettingsCard title="Region" description="Times on your calendar and in emails use this timezone.">
          <FormField<V, "timezone"> name="timezone" label="Timezone">
            {(field) => (
              <Combobox
                options={zones}
                value={field.value}
                onValueChange={(v) => v && field.onChange(v)}
                searchPlaceholder="Search cities…"
              />
            )}
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField<V, "currency">
              name="currency"
              label="Currency"
              help="Changing it doesn't convert existing prices."
            >
              {(field) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger ref={field.ref}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField<V, "locale"> name="locale" label="Date and number format">
              {(field) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger ref={field.ref}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Contact and address"
          description="Shown on your booking page and in confirmation emails."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField<V, "contactEmail"> name="contactEmail" label="Email" optional>
              {(field) => <Input {...field} type="email" />}
            </FormField>
            <FormField<V, "contactPhone"> name="contactPhone" label="Phone" optional>
              {(field) => <Input {...field} type="tel" />}
            </FormField>
          </div>
          <FormField<V, "websiteUrl"> name="websiteUrl" label="Website" optional>
            {(field) => <Input {...field} type="url" leading={<Globe />} placeholder="https://" />}
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField<V, "line1"> name="line1" label="Address line 1" optional>
              {(field) => <Input {...field} />}
            </FormField>
            <FormField<V, "line2"> name="line2" label="Address line 2" optional>
              {(field) => <Input {...field} />}
            </FormField>
            <FormField<V, "city"> name="city" label="Town or city" optional>
              {(field) => <Input {...field} />}
            </FormField>
            <FormField<V, "postcode"> name="postcode" label="Postcode / Eircode" optional>
              {(field) => <Input {...field} />}
            </FormField>
          </div>
        </SettingsCard>

        <FormRootError />
        <SaveBar
          dirty={form.formState.isDirty}
          onDiscard={() => form.reset(businessToGeneralValues(business))}
        />
      </Form>

      {perms.deleteBusiness && (
        <SettingsCard
          className="mt-10 border-danger-border"
          title="Delete business"
          description={deleteBusinessDescription({ customers: v("customers"), bookings: v("bookings") })}
        >
          <ConfirmDialog
            trigger={
              <Button variant="danger-soft" className="self-start">
                Delete {business.name}
              </Button>
            }
            title={`Delete ${business.name}?`}
            description={`The booking page goes offline immediately, and you can't undo this from your dashboard. Your ${v("customers")} can only see and cancel their ${v("bookings")}.`}
            confirmLabel="Delete business"
            destructive
            onConfirm={async () => {
              try {
                await remove.mutateAsync();
                toast.success("Business deleted");
                router.replace("/dashboard");
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          />
        </SettingsCard>
      )}
    </>
  );
}
