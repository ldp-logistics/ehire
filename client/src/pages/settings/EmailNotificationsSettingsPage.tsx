import { SettingsSubpageLayout } from "@/pages/settings/SettingsSubpageLayout";
import { EmailNotificationsSection, EmailBrandingSection } from "@/pages/settings/SettingsPanels";
import { Separator } from "@/components/ui/separator";

export default function EmailNotificationsSettingsPage() {
  return (
    <SettingsSubpageLayout
      title="Email notifications"
      description="Toggle events, edit templates, and customise the look of all notification emails."
      maxWidthClass="max-w-5xl"
    >
      <EmailBrandingSection />
      <Separator className="my-8" />
      <EmailNotificationsSection />
    </SettingsSubpageLayout>
  );
}
