import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateOnly } from "../types";
import type { EmployeeData } from "../types";

/** Human-readable exit type (matches offboarding: resignation, termination, contract_end, etc.) */
function formatExitTypeLabel(v?: string | null): string {
  if (!v?.trim()) return "—";
  const s = v.trim().toLowerCase().replace(/_/g, " ");
  const map: Record<string, string> = {
    resignation: "Resignation",
    termination: "Termination",
    "contract end": "Contract end",
    release: "Release",
    terminated: "Terminated",
  };
  return map[s] ?? s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface ProfileExitTabProps {
  employee: EmployeeData;
  isEditing?: boolean;
  editData?: {
    resignationDate: string;
    lastWorkingDate: string;
    exitType: string;
    eligibleForRehire: string;
    resignationReason: string;
  };
  onEditChange?: (field: string, value: string) => void;
  isSaving?: boolean;
}

function ProfileExitTab({
  employee,
  isEditing = false,
  editData,
  onEditChange,
  isSaving = false,
}: ProfileExitTabProps) {
  return (
    <Card className="border border-red-500/20 shadow-sm bg-red-500/10">
      <CardHeader>
        <CardTitle className="text-destructive">Separation Details</CardTitle>
      </CardHeader>
      <CardContent>
        {!isEditing ? (
          <div className="grid grid-cols-2 gap-y-4 gap-x-8">
          <div>
            <p className="text-xs text-muted-foreground">Resignation Date</p>
            <p className="font-medium text-foreground">{formatDateOnly(employee.resignationDate) || "N/A"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last Working Date</p>
            <p className="font-medium text-foreground">{formatDateOnly(employee.lastWorkingDate) || "N/A"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Exit type</p>
            <Badge variant="outline" className="bg-red-500/10 text-destructive border-destructive/20">{formatExitTypeLabel(employee.exitType)}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Eligible for Rehire</p>
            <p className="font-medium text-foreground">{employee.eligibleForRehire != null ? (employee.eligibleForRehire ? "Yes" : "No") : "Yes"}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Reason</p>
            <p className="font-medium text-foreground">{employee.resignationReason || "—"}</p>
          </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-y-4 gap-x-8">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Resignation Date</p>
              <Input
                type="date"
                value={editData?.resignationDate || ""}
                onChange={(e) => onEditChange?.("resignationDate", e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Last Working Date</p>
              <Input
                type="date"
                value={editData?.lastWorkingDate || ""}
                onChange={(e) => onEditChange?.("lastWorkingDate", e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Exit Type</p>
              <Select
                value={editData?.exitType || "Release"}
                onValueChange={(v) => onEditChange?.("exitType", v)}
                disabled={isSaving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Release">Release</SelectItem>
                  <SelectItem value="Terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Eligible for Rehire</p>
              <Select
                value={editData?.eligibleForRehire || "yes"}
                onValueChange={(v) => onEditChange?.("eligibleForRehire", v)}
                disabled={isSaving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Reason</p>
              <Textarea
                rows={3}
                value={editData?.resignationReason || ""}
                onChange={(e) => onEditChange?.("resignationReason", e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ProfileExitTab;
