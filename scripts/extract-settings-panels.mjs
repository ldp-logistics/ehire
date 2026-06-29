import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const settingsPath = path.join(root, "client/src/pages/Settings.tsx");
const outPath = path.join(root, "client/src/pages/settings/SettingsPanels.tsx");

const lines = fs.readFileSync(settingsPath, "utf8").split(/\n/);
const imports = lines.slice(0, 41).join("\n");
const constants = lines.slice(41, 133).join("\n");
let panels = lines.slice(408).join("\n");

const tzPanel = `export function TimezoneSettingsPanel() {
  const { user, refreshUser } = useAuth();
  const [timezone, setTimezone] = useState<string>(user?.timeZone ?? "");
  const [timezoneSaving, setTimezoneSaving] = useState(false);
  useEffect(() => {
    setTimezone(user?.timeZone ?? "");
  }, [user?.timeZone]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Timezone</h2>
        <p className="text-sm text-slate-500">Used for &quot;today&quot;, attendance, and leave dates across the app.</p>
      </div>
      <Separator />
      <div className="grid gap-2 max-w-sm">
        <Label htmlFor="timezone">Your timezone</Label>
        <Select value={timezone || " "} onValueChange={(v) => setTimezone(v === " " ? "" : v)}>
          <SelectTrigger id="timezone">
            <SelectValue placeholder="Use server default" />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value || "default"} value={opt.value || " "}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex justify-end">
          <Button
            disabled={timezoneSaving}
            onClick={async () => {
              setTimezoneSaving(true);
              try {
                await apiRequest("PATCH", "/api/auth/me", { timeZone: timezone || null });
                await refreshUser();
                toast.success("Timezone saved.");
              } catch {
                toast.error("Failed to save timezone.");
              } finally {
                setTimezoneSaving(false);
              }
            }}
          >
            {timezoneSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

`;

panels = panels
  .replace(/^function EmployeeProfileBannerSection/m, "export function EmployeeProfileBannerSection")
  .replace(/^function TimesheetPolicySection/m, "export function TimesheetPolicySection")
  .replace(/^function UserAccessSection/m, "export function UserAccessSection")
  .replace(/^function EmailNotificationsSection/m, "export function EmailNotificationsSection");

const out = `${imports}\n${constants}\n\n${tzPanel}${panels}`;
fs.writeFileSync(outPath, out);
console.log("Wrote", out.split("\n").length, "lines to SettingsPanels.tsx");
