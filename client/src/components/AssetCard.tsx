import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Laptop, Monitor, Cpu, MemoryStick, HardDrive, Calendar, User,
  Server, Printer, Headphones, Keyboard, Smartphone, Tablet, Trash2,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { formatLeaveDisplayDate } from "@/lib/dateUtils";

// ==================== TYPES ====================

export interface AssetData {
  id: string;
  asset_id: string;
  asset_name?: string | null;
  asset_category?: string | null;
  user_name?: string;
  user_email?: string;
  user_id?: string;
  employee_id?: string;
  first_name?: string;
  last_name?: string;
  department?: string;
  ram?: string | null;
  storage?: string | null;
  processor?: string | null;
  generation?: string | null;
  status: string;
  assigned_date?: string | null;
  notes?: string | null;
}

// ==================== HELPERS ====================

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  assigned: { label: "Assigned", variant: "default" },
  home: { label: "Home", variant: "secondary" },
  repair: { label: "In Repair", variant: "destructive" },
  returned: { label: "Returned", variant: "outline" },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || { label: status, variant: "outline" as const };
}

function getCategoryIcon(category?: string | null, name?: string | null) {
  const lc = (category || name || "").toLowerCase();
  if (lc.includes("laptop") || lc.includes("notebook")) return Laptop;
  if (lc.includes("monitor") || lc.includes("display")) return Monitor;
  if (lc.includes("phone") || lc.includes("mobile")) return Smartphone;
  if (lc.includes("tablet") || lc.includes("ipad")) return Tablet;
  if (lc.includes("server")) return Server;
  if (lc.includes("printer")) return Printer;
  if (lc.includes("headphone") || lc.includes("headset")) return Headphones;
  if (lc.includes("keyboard")) return Keyboard;
  return Laptop; // default
}

function resolveAssetName(asset: AssetData): string {
  if (asset.asset_name) return asset.asset_name;
  // Fallback: try to build a reasonable name from specs
  const parts: string[] = [];
  if (asset.processor) parts.push(asset.processor);
  if (asset.generation) parts.push(asset.generation);
  if (parts.length > 0) return parts.join(" ");
  return "System";
}

function formatDate(d?: string | null, tz?: string | null, df?: string | null): string {
  if (!d) return "";
  return formatLeaveDisplayDate(d, tz ?? null, df ?? null);
}

function buildSpecChips(asset: AssetData): { icon: typeof Cpu; label: string; value: string }[] {
  const chips: { icon: typeof Cpu; label: string; value: string }[] = [];
  if (asset.processor) {
    chips.push({ icon: Cpu, label: "CPU", value: `${asset.processor}${asset.generation ? ` ${asset.generation}` : ""}` });
  }
  if (asset.ram) {
    chips.push({ icon: MemoryStick, label: "RAM", value: asset.ram });
  }
  if (asset.storage) {
    chips.push({ icon: HardDrive, label: "Storage", value: asset.storage });
  }
  return chips;
}

// ==================== ASSET CARD ====================

interface AssetCardProps {
  asset: AssetData;
  /** Whether to show the assigned employee info (false for employee profile views) */
  showEmployee?: boolean;
  /** Compact layout for inline usage */
  compact?: boolean;
  /** Show remove control (e.g. IT on employee profile) */
  showRemove?: boolean;
  onRemove?: (asset: AssetData) => void;
  removeDisabled?: boolean;
}

export function AssetCard({
  asset,
  showEmployee = false,
  compact = false,
  showRemove = false,
  onRemove,
  removeDisabled = false,
}: AssetCardProps) {
  const { user } = useAuth();
  const [detailOpen, setDetailOpen] = useState(false);
  const Icon = getCategoryIcon(asset.asset_category, asset.asset_name);
  const statusCfg = getStatusConfig(asset.status);
  const displayName = resolveAssetName(asset);
  const specs = buildSpecChips(asset);
  const category = asset.asset_category || "System";

  return (
    <>
      <div
        className="border border-border rounded-lg p-4 hover:bg-muted/30 hover:border-primary/30 transition-all cursor-pointer group"
        onClick={() => setDetailOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setDetailOpen(true); }}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
              <Icon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{category}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
            {showRemove && onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={removeDisabled}
                aria-label="Remove asset"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(asset);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {!compact && specs.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
            {specs.map((spec) => (
              <div key={spec.label} className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
                <spec.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground leading-none">{spec.label}</p>
                  <p className="text-xs font-medium">{spec.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {compact && specs.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {specs.map((s) => s.value).join(" · ")}
          </p>
        )}

        <div className="flex items-center justify-between mt-2">
          {asset.assigned_date && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{formatDate(asset.assigned_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</span>
            </div>
          )}
          {showEmployee && asset.user_name && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span>{asset.user_name}{asset.employee_id ? ` (${asset.employee_id})` : ""}</span>
            </div>
          )}
        </div>

        {!compact && asset.notes && (
          <p className="text-xs text-muted-foreground mt-2 bg-muted/30 rounded p-2 line-clamp-2">{asset.notes}</p>
        )}
      </div>

      <AssetDetailModal asset={asset} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </>
  );
}

// ==================== ASSET DETAIL MODAL ====================

interface AssetDetailModalProps {
  asset: AssetData;
  open: boolean;
  onClose: () => void;
}

export function AssetDetailModal({ asset, open, onClose }: AssetDetailModalProps) {
  const { user } = useAuth();
  const Icon = getCategoryIcon(asset.asset_category, asset.asset_name);
  const statusCfg = getStatusConfig(asset.status);
  const displayName = resolveAssetName(asset);
  const specs = buildSpecChips(asset);
  const category = asset.asset_category || "System";
  const employeeName = asset.first_name && asset.last_name
    ? `${asset.first_name} ${asset.last_name}`
    : asset.user_name || "—";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Icon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <span>{displayName}</span>
              <p className="text-xs text-muted-foreground font-normal mt-0.5">{category}</p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Asset details</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>

          <Separator />

          {/* Specs */}
          {specs.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Specifications</p>
              <div className="grid grid-cols-3 gap-3">
                {specs.map((spec) => (
                  <div key={spec.label} className="bg-muted/50 rounded-lg p-3 text-center">
                    <spec.icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                    <p className="text-[10px] text-muted-foreground">{spec.label}</p>
                    <p className="text-sm font-semibold">{spec.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Assignment Info */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Assignment</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Assigned To</p>
                <p className="font-medium">{employeeName}</p>
                {asset.employee_id && (
                  <p className="text-xs text-muted-foreground">{asset.employee_id}</p>
                )}
              </div>
              {asset.department && (
                <div>
                  <p className="text-xs text-muted-foreground">Department</p>
                  <p className="font-medium">{asset.department}</p>
                </div>
              )}
              {asset.assigned_date && (
                <div>
                  <p className="text-xs text-muted-foreground">Assigned Date</p>
                  <p className="font-medium">{formatDate(asset.assigned_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</p>
                </div>
              )}
              {asset.user_email && (
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium text-xs truncate">{asset.user_email}</p>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {asset.notes && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Notes</p>
                <p className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{asset.notes}</p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
