/**
 * Every settings section's screen, by its `SETTINGS_NAV` segment (`@shared/dashboard/nav`). Phones open one per route
 * (`app/dashboard/[slug]/settings/<segment>.tsx` → `SettingsSectionRoute`); iPad shows them beside the list.
 */
import { SETTINGS_NAV } from "@shared/dashboard/nav";
import { RequireRole } from "~/shell/RequireRole";
import { useLayout } from "~/ui";
import { AiAgentsSettings } from "./ai-agents/AiAgentsSettings";
import { BillingSettings } from "./billing/BillingSettings";
import { BrandingSettings } from "./branding/BrandingSettings";
import { CustomerGroupsSettings } from "./customer-groups/CustomerGroupsSettings";
import { GeneralSettings } from "./general/GeneralSettings";
import { MarketplaceSettings } from "./marketplace/MarketplaceSettings";
import { PaymentsSettings } from "./payments/PaymentsSettings";
import { PoliciesSettings } from "./policies/PoliciesSettings";
import { QuestionsSettings } from "./questions/QuestionsSettings";
import { ReleaseSchedulesSettings } from "./release-schedules/ReleaseSchedulesSettings";
import { SettingsSplit, type SettingsSections } from "./SettingsSplit";

export const SETTINGS_SECTIONS: SettingsSections = {
  general: GeneralSettings,
  branding: BrandingSettings,
  policies: PoliciesSettings,
  "release-schedules": ReleaseSchedulesSettings,
  "customer-groups": CustomerGroupsSettings,
  questions: QuestionsSettings,
  marketplace: MarketplaceSettings,
  "ai-agents": AiAgentsSettings,
  payments: PaymentsSettings,
  billing: BillingSettings,
};

/** A settings section's route: its screen on phones, the master–detail with it open on iPad. */
export function SettingsSectionRoute({ segment }: { segment: string }) {
  const { isWide } = useLayout();
  const item = SETTINGS_NAV.find((s) => s.segment === segment);
  const Section = SETTINGS_SECTIONS[segment];
  if (!item || !Section) return null;
  if (isWide) {
    return (
      <RequireRole min="admin">
        <SettingsSplit initial={segment} sections={SETTINGS_SECTIONS} />
      </RequireRole>
    );
  }
  return (
    <RequireRole min={item.minRole}>
      <Section />
    </RequireRole>
  );
}
