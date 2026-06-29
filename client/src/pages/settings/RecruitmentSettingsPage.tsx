import { SettingsSubpageLayout } from "@/pages/settings/SettingsSubpageLayout";
import { RecruitmentSettingsSection } from "@/pages/settings/SettingsPanels";

export default function RecruitmentSettingsPage() {
  return (
    <SettingsSubpageLayout
      title="Onsite interview locations"
      description="Default onsite interview locations for scheduling and candidate invite emails."
      maxWidthClass="max-w-2xl"
    >
      <RecruitmentSettingsSection />
    </SettingsSubpageLayout>
  );
}
