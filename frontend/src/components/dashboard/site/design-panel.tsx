"use client";

import { useCurrentBusiness } from "@/lib/business/business-context";
import { LIMITS } from "@/lib/site/schema";
import { siteTheme } from "@/lib/site/themes";
import { ThemePicker } from "@/components/site/theme-picker";
import { ColorPicker } from "@/components/ui/color-picker";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useEditorServices } from "./editor-data";
import { PanelSection } from "./panel-section";
import { useEditor } from "./use-site-editor";

/** Theme, colours and search appearance. */
export function DesignPanel() {
  const business = useCurrentBusiness();
  const services = useEditorServices();
  const { plan, site, dispatch, issues } = useEditor();
  const theme = siteTheme(plan.theme);
  const accentOn = plan.palette.accent != null;
  return (
    <div className="flex flex-col gap-8">
      <PanelSection
        title="Theme"
        description="Fonts, shapes, spacing and backgrounds. Your content stays the same."
      >
        <ThemePicker
          value={plan.theme}
          onChange={(t) => dispatch({ type: "setTheme", theme: t })}
          plan={plan}
          business={business}
          services={services}
          context={site.context}
        />
      </PanelSection>

      <PanelSection
        title="Colours"
        description="Buttons and links use your main colour. We adjust shades automatically so text stays readable in light and dark mode."
      >
        <Field label="Main colour" error={issues.palette.primaryColor}>
          <ColorPicker
            value={plan.palette.primaryColor}
            onValueChange={(c) => dispatch({ type: "setPalette", palette: { primaryColor: c } })}
          />
        </Field>
        <Field
          label="Second colour"
          orientation="horizontal"
          help={
            theme.defaultAccent
              ? `${theme.name} adds a matching accent when this is off.`
              : "Accents use your main colour when this is off."
          }
        >
          <Switch
            checked={accentOn}
            onCheckedChange={(on) =>
              dispatch({
                type: "setPalette",
                palette: { accent: on ? (theme.defaultAccent ?? plan.palette.primaryColor) : null },
              })
            }
          />
        </Field>
        {accentOn && (
          <Field label="Accent colour" error={issues.palette.accent}>
            <ColorPicker
              value={plan.palette.accent ?? ""}
              onValueChange={(c) => dispatch({ type: "setPalette", palette: { accent: c } })}
            />
          </Field>
        )}
      </PanelSection>

      <PanelSection
        title="Search and sharing"
        description="How your site appears in Google and when the link is shared."
      >
        <Field
          label="Page title"
          optional
          error={issues.seo.title}
          help={`${(plan.seo.title ?? "").length}/${LIMITS.seoTitle}`}
        >
          <Input
            value={plan.seo.title ?? ""}
            placeholder={business.name}
            onChange={(e) => dispatch({ type: "setSeo", seo: { title: e.target.value } })}
          />
        </Field>
        <Field
          label="Description"
          optional
          error={issues.seo.description}
          help={`${(plan.seo.description ?? "").length}/${LIMITS.seoDescription}`}
        >
          <Textarea
            rows={3}
            value={plan.seo.description ?? ""}
            placeholder={business.description ?? `Book online with ${business.name}.`}
            onChange={(e) => dispatch({ type: "setSeo", seo: { description: e.target.value } })}
          />
        </Field>
      </PanelSection>
    </div>
  );
}
