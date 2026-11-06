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
import { Badge } from "@/components/ui/badge";
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
import {
  CURRENCIES,
  LOCALES,
  SaveBar,
  SettingFormRow,
  SettingGroup,
  SettingRow,
  SettingsHeader,
  settingsStack,
} from "./settings-common";

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
  const published = useWatch({ control: form.control, name: "published" });
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
      // The save bar says it's saved, unless the page is about to move to the new address.
      if (saved.slug !== business.slug) {
        toast.success("Settings saved");
        router.replace(`/dashboard/${saved.slug}/settings/general`);
      }
    } catch (err) {
      applyApiErrors(form, flattenFieldErrors(err, ["address"]));
    }
  };

  return (
    <>
      <SettingsHeader segment="general" />
      <Form form={form} onSubmit={submit} className={settingsStack}>
        <SettingGroup title="Business details">
          <SettingFormRow<V, "name"> name="name" label="Business name" required>
            {(field) => <Input {...field} />}
          </SettingFormRow>
          <SettingFormRow<V, "slug">
            name="slug"
            label="Booking page address"
            help={
              slug !== business.slug
                ? "Changing it breaks links you've already shared."
                : "Lowercase letters, numbers and hyphens."
            }
          >
            {(field) => (
              <>
                <div className="flex">
                  {/* A long host shouldn't squeeze out the part people actually edit, so it gives way. */}
                  <span
                    title={`${origin}/`}
                    className="inline-flex max-w-[45%] min-w-0 items-center rounded-l-lg border border-r-0 border-border-strong bg-muted px-3 text-sm text-muted-foreground"
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
                {checkSlug && availability.data && !availability.data.available && (
                  <p className="text-xs text-danger-soft-foreground">
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
              </>
            )}
          </SettingFormRow>
          <SettingFormRow<V, "published">
            name="published"
            fit
            label="Booking page"
            help={
              published ? "Anyone with the link can book." : "Only your team can see it until you turn it on."
            }
          >
            {(field) => (
              <div className="flex items-center gap-2.5">
                <Badge tone={published ? "success" : "neutral"} dot>
                  {published ? "Live" : "Draft"}
                </Badge>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </div>
            )}
          </SettingFormRow>
          <SettingFormRow<V, "description">
            name="description"
            stacked
            label="About"
            help="A sentence or two at the top of your booking page."
          >
            {(field) => <Textarea {...field} rows={3} />}
          </SettingFormRow>
        </SettingGroup>

        <SettingGroup title="Region">
          <SettingFormRow<V, "timezone">
            name="timezone"
            label="Timezone"
            help="Used on your calendar and in emails."
          >
            {(field) => (
              <Combobox
                options={zones}
                value={field.value}
                onValueChange={(v) => v && field.onChange(v)}
                searchPlaceholder="Search cities…"
              />
            )}
          </SettingFormRow>
          <SettingFormRow<V, "currency">
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
          </SettingFormRow>
          <SettingFormRow<V, "locale"> name="locale" label="Date and number format">
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
          </SettingFormRow>
        </SettingGroup>

        <SettingGroup
          title="Contact and address"
          description="Shown on your booking page and in confirmation emails. All optional."
        >
          <SettingFormRow<V, "contactEmail"> name="contactEmail" label="Email">
            {(field) => <Input {...field} type="email" />}
          </SettingFormRow>
          <SettingFormRow<V, "contactPhone"> name="contactPhone" label="Phone">
            {(field) => <Input {...field} type="tel" />}
          </SettingFormRow>
          <SettingFormRow<V, "websiteUrl"> name="websiteUrl" label="Website">
            {(field) => <Input {...field} type="url" leading={<Globe />} placeholder="https://" />}
          </SettingFormRow>
          <SettingRow label="Address" labelId="settings-address">
            <div role="group" aria-labelledby="settings-address" className="grid grid-cols-2 gap-2">
              <FormField<V, "line1"> name="line1" className="col-span-2">
                {(field) => <Input {...field} aria-label="Address line 1" placeholder="Address line 1" />}
              </FormField>
              <FormField<V, "line2"> name="line2" className="col-span-2">
                {(field) => <Input {...field} aria-label="Address line 2" placeholder="Address line 2" />}
              </FormField>
              <FormField<V, "city"> name="city">
                {(field) => <Input {...field} aria-label="Town or city" placeholder="Town or city" />}
              </FormField>
              <FormField<V, "postcode"> name="postcode">
                {(field) => <Input {...field} aria-label="Postcode / Eircode" placeholder="Postcode" />}
              </FormField>
            </div>
          </SettingRow>
        </SettingGroup>

        <FormRootError />
        <SaveBar
          dirty={form.formState.isDirty}
          onDiscard={() => form.reset(businessToGeneralValues(business))}
        />
      </Form>

      {perms.deleteBusiness && (
        <SettingGroup title="Danger zone" className="mt-8">
          <SettingRow
            danger
            action
            label="Delete business"
            help={deleteBusinessDescription({ customers: v("customers"), bookings: v("bookings") })}
          >
            <ConfirmDialog
              trigger={
                <Button variant="danger-soft" aria-label={`Delete ${business.name}`}>
                  Delete
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
          </SettingRow>
        </SettingGroup>
      )}
    </>
  );
}
