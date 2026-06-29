import { SettingsSubpageLayout } from "@/pages/settings/SettingsSubpageLayout";
import { TimezoneSettingsPanel } from "@/pages/settings/SettingsPanels";

export default function TimezoneSettingsPage() {
  return (
    <SettingsSubpageLayout
      title="Timezone"
      description='Used for "today", attendance, and leave dates across the app.'
    >
      <TimezoneSettingsPanel />
    </SettingsSubpageLayout>
  );
}
