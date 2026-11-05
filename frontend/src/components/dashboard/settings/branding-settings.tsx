"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, ImageIcon } from "lucide-react";
import { useUpdateBusiness } from "@/lib/api/hooks";
import { useCurrentBusiness } from "@/lib/business/business-context";
import { flattenFieldErrors } from "@/lib/settings/api-fields";
import {
  brandingSchema,
  brandingValuesToUpdate,
  businessToBrandingValues,
  type BrandingValues,
} from "@/lib/settings/branding-form";
import { HEX_COLOR } from "@/lib/theme/color";
import { BusinessThemeProvider } from "@/lib/theme/business-theme";
import { vocab } from "@/lib/vocabulary";
import { BusinessTile } from "@/components/shells/business-tile";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { applyApiErrors, Form, FormField, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ImageUploadDropzone } from "@/components/dashboard/image-upload";
import { PortalStylePicker } from "@/components/booking/portal-style-picker";
import { SiteScope } from "@/components/site/site-scope";
import { SaveBar, SettingsCard, SettingsHeader } from "./settings-common";

type V = BrandingValues;
const toValues = businessToBrandingValues;

export function BrandingSettings() {
  const business = useCurrentBusiness();
  const update = useUpdateBusiness(business.id);
  const form = useForm<V>({ resolver: zodResolver(brandingSchema), defaultValues: toValues(business) });

  return (
    <>
      <SettingsHeader segment="branding" />
      <Form
        form={form}
        className="gap-6"
        onSubmit={async (v) => {
          try {
            const saved = await update.mutateAsync(brandingValuesToUpdate(v));
            form.reset(toValues(saved));
            toast.success("Branding saved");
          } catch (err) {
            applyApiErrors(form, flattenFieldErrors(err, ["branding", "vocabulary"]));
          }
        }}
      >
        <SettingsCard title="Preview" description="Your booking page header, live as you edit.">
          <Preview />
        </SettingsCard>
        <SettingsCard
          title="Colour and images"
          description="Buttons, selected dates and links use your colour. We adjust it automatically so text stays readable in light and dark mode."
        >
          <FormField<V, "primaryColor"> name="primaryColor" label="Brand colour">
            {(field) => <ColorPicker value={field.value} onValueChange={field.onChange} />}
          </FormField>
          <FormField<V, "logoUrl">
            name="logoUrl"
            label="Logo"
            optional
            help="A square image works best. Upload one, or paste an image address."
          >
            {(field) => (
              <div className="flex flex-col gap-2">
                <ImageUploadDropzone
                  compact
                  label="Upload a logo"
                  businessId={business.id}
                  onUploaded={(u) => field.onChange(u.url)}
                />
                <Input
                  {...field}
                  type="url"
                  placeholder="https://…/logo.png"
                  leading={<ImageIcon />}
                  aria-label="Logo image address"
                />
              </div>
            )}
          </FormField>
          <FormField<V, "coverImageUrl">
            name="coverImageUrl"
            label="Cover image"
            optional
            help={
              business.sitesEnabled
                ? "Wide photo (3:1) used when your site has no hero image of its own."
                : "Wide photo (3:1) shown at the top of your booking page."
            }
          >
            {(field) => (
              <div className="flex flex-col gap-2">
                <ImageUploadDropzone
                  compact
                  label="Upload a cover image"
                  businessId={business.id}
                  onUploaded={(u) => field.onChange(u.url)}
                />
                <Input
                  {...field}
                  type="url"
                  placeholder="https://…/cover.jpg"
                  leading={<ImageIcon />}
                  aria-label="Cover image address"
                />
              </div>
            )}
          </FormField>
        </SettingsCard>
        {/* With a site, the booking pages wear the site's theme (chosen in the site editor) instead. */}
        {!business.sitesEnabled && (
          <SettingsCard
            title="Booking page style"
            description="Fonts, corners and surfaces for your booking page. Your colour, logo and cover go on top."
          >
            <StyleField />
          </SettingsCard>
        )}
        <SettingsCard
          title="Wording"
          description="Use the words your customers use — a physio has patients and appointments, a school has students and lessons."
        >
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
            {(
              [
                ["booking", "What's booked (one)"],
                ["bookings", "What's booked (many)"],
                ["customer", "Who books (one)"],
                ["customers", "Who books (many)"],
                ["resource", "Who or what is booked (one)"],
                ["resources", "Who or what is booked (many)"],
              ] as const
            ).map(([key, label]) => (
              <FormField<V, typeof key> key={key} name={key} label={label}>
                {(field) => <Input {...field} autoComplete="off" />}
              </FormField>
            ))}
          </div>
        </SettingsCard>
        <FormRootError />
        <SaveBar dirty={form.formState.isDirty} onDiscard={() => form.reset(toValues(business))} />
      </Form>
    </>
  );
}

function StyleField() {
  const business = useCurrentBusiness();
  const color = useWatch<V, "primaryColor">({ name: "primaryColor" });
  return (
    <FormField<V, "portalStyle"> name="portalStyle" label="Style">
      {(field) => (
        <PortalStylePicker
          value={field.value}
          onChange={field.onChange}
          primaryColor={HEX_COLOR.test(color) ? color : business.branding.primaryColor}
          businessName={business.name}
        />
      )}
    </FormField>
  );
}

/** The preview in the (unsaved) style and colour; with a site, the colour only (the site's theme is set elsewhere). */
function PreviewTheme({
  style,
  color,
  children,
}: {
  style: V["portalStyle"] | null;
  color: string;
  children: React.ReactNode;
}) {
  const className = "overflow-hidden rounded-xl border border-border bg-background";
  if (!style) {
    return (
      <BusinessThemeProvider primaryColor={color} className={className}>
        {children}
      </BusinessThemeProvider>
    );
  }
  return (
    <SiteScope theme={style} palette={{ primaryColor: color, accent: null }} className={className}>
      {children}
    </SiteScope>
  );
}

/** Mini public header + a sample service, themed by the (unsaved) colour and style. */
function Preview() {
  const business = useCurrentBusiness();
  const v = useWatch<V>() as V;
  const color = HEX_COLOR.test(v.primaryColor) ? v.primaryColor : business.branding.primaryColor;
  const noun = vocab(v, "booking");
  const isImageUrl = (url: string | undefined) => !!url && /^https?:\/\//.test(url);
  const cover = isImageUrl(v.coverImageUrl) ? v.coverImageUrl : null;
  const logo = isImageUrl(v.logoUrl) ? v.logoUrl : null;
  return (
    <div role="group" aria-label="Booking page preview">
      <PreviewTheme style={business.sitesEnabled ? null : v.portalStyle} color={color}>
        <div className="flex h-14 items-center gap-3 border-b border-border/70 px-4">
          <BusinessTile name={business.name} logoUrl={logo} color={color} size="lg" className="size-8" />
          <span className="truncate text-sm font-semibold tracking-tight">{business.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">My {vocab(v, "bookings")}</span>
        </div>
        {cover && (
          <div className="px-4 pt-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL */}
            <img src={cover} alt="" className="aspect-[3/1] w-full rounded-lg bg-muted object-cover" />
          </div>
        )}
        <div className="flex flex-col gap-3 p-4">
          <p className="site-heading text-base font-semibold tracking-tight">
            {/* The default wording has no noun to book: nobody says "Book a booking". */}
            {noun === "booking" ? "Book online" : `Book ${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`}
          </p>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-border bg-brand-soft/60 px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              <CalendarDays className="size-4 text-brand" /> Initial consultation
            </span>
            <span className="text-xs text-muted-foreground">45 min</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["09:00", "09:45", "10:30", "11:15"].map((t, i) => (
              <span
                key={t}
                className={
                  i === 1
                    ? "tnum rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                    : "tnum rounded-md border border-border px-2.5 py-1 text-xs"
                }
              >
                {t}
              </span>
            ))}
          </div>
          <Button variant="primary" size="sm" tabIndex={-1} className="pointer-events-none self-start">
            Continue
          </Button>
        </div>
      </PreviewTheme>
    </div>
  );
}
