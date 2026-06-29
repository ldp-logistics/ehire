import { SettingsSubpageLayout } from "@/pages/settings/SettingsSubpageLayout";
import { TimesheetPolicySection, CheckinRemindersSection } from "@/pages/settings/SettingsPanels";

export default function TimesheetPolicySettingsPage() {
  return (
    <SettingsSubpageLayout
      title="Timesheet policy"
      description={
        <>
          <strong>These hours apply to everyone</strong> for check-in/out, late, half-day, and overtime. Shift assignments
          do not override these times. Late = after start + grace. Half day = below the configured % of expected hours.
        </>
      }
    >
      <TimesheetPolicySection />

      <div className="border-t border-border pt-8 mt-8">
        <CheckinRemindersSection />
      </div>
    </SettingsSubpageLayout>
  );
}
