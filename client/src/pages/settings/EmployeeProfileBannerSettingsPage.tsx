import { SettingsSubpageLayout } from "@/pages/settings/SettingsSubpageLayout";
import { EmployeeProfileBannerSection } from "@/pages/settings/SettingsPanels";

export default function EmployeeProfileBannerSettingsPage() {
  return (
    <SettingsSubpageLayout
      title="Employee profile banner"
      description="One image for all profiles at the top of each employee card. Stored in SharePoint (same as profile photos). Max 5MB."
    >
      <EmployeeProfileBannerSection />
    </SettingsSubpageLayout>
  );
}
