import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { invalidateLeaveAndNotifications } from "@/lib/leaveQueryInvalidation";
import { sortLeaveBalancesByDisplayOrder } from "@/lib/leaveBalanceOrder";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Calendar, Paperclip, HelpCircle } from "lucide-react";
import { EmployeeAvatar, employeeInitials } from "@/components/EmployeeAvatar";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const MAX_ATTACHMENT_SIZE_MB = 5;
const ACCEPT_ATTACHMENT = ".pdf,.jpg,.jpeg,.png,.webp";

export interface LeaveTypeRow {
  id: string; policy_id: string; name: string; paid: boolean;
  accrual_type: string; accrual_rate: string | null; max_balance: number;
  carry_forward_allowed: boolean; requires_document: boolean;
  requires_approval: boolean; auto_approve_rules: any;
  hr_approval_required: boolean; min_days: number | null;
  max_days_per_request: number | null; blocked_during_notice: boolean;
  color: string; balance?: string; used?: string;
}

export function ApplyLeaveDialog({
  open,
  onClose,
  employeeId,
  submitForEmployeeId,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string | null;
  /** When set (e.g. HR on another's profile), request is submitted on behalf of this employee. */
  submitForEmployeeId?: string | null;
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ leaveTypeId: "", startDate: "", endDate: "", dayType: "full", reason: "", attachmentUrl: "" as string | null, notifyEmployeeIds: [] as string[] });
  const [loading, setLoading] = useState(false);

  const { data: leaveTypes = [], isError } = useQuery<LeaveTypeRow[]>({
    queryKey: ["/api/leave/types-for-employee", employeeId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/leave/types-for-employee/${employeeId}`);
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!employeeId && open,
  });

  const leaveTypesSorted = useMemo(() => sortLeaveBalancesByDisplayOrder(leaveTypes), [leaveTypes]);

  const { data: employeesList = [] } = useQuery<Array<{ id: string; first_name: string; last_name: string; work_email?: string }>>({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/employees");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) setForm({ leaveTypeId: "", startDate: "", endDate: "", dayType: "full", reason: "", attachmentUrl: null, notifyEmployeeIds: [] });
  }, [open]);

  const isHalfDay = form.dayType === "first_half" || form.dayType === "second_half" || form.dayType === "half";
  const dayCount = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    const s = new Date(form.startDate + "T00:00:00");
    const e = new Date(form.endDate + "T00:00:00");
    if (e < s) return 0;
    let c = 0;
    const cur = new Date(s);
    while (cur <= e) {
      if (cur.getDay() !== 0 && cur.getDay() !== 6) c++;
      cur.setDate(cur.getDate() + 1);
    }
    return isHalfDay ? c * 0.5 : c;
  }, [form.startDate, form.endDate, form.dayType, isHalfDay]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE_MB * 1024 * 1024) {
      toast.error(`File must be under ${MAX_ATTACHMENT_SIZE_MB}MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, attachmentUrl: reader.result as string }));
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const toggleNotifyEmployee = (id: string) => {
    setForm((f) => ({
      ...f,
      notifyEmployeeIds: f.notifyEmployeeIds.includes(id) ? f.notifyEmployeeIds.filter((x) => x !== id) : [...f.notifyEmployeeIds, id],
    }));
  };

  const selected = leaveTypesSorted.find((t) => t.id === form.leaveTypeId);

  const handleSubmit = async () => {
    if (!form.leaveTypeId || !form.startDate || !form.endDate) {
      toast.error("Fill all required fields");
      return;
    }
    if (form.endDate < form.startDate) {
      toast.error("End date cannot be before start date");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate,
        endDate: form.endDate,
        dayType: form.dayType,
        reason: form.reason,
        totalDays: dayCount,
        attachmentUrl: form.attachmentUrl || undefined,
        notifyEmployeeIds: form.notifyEmployeeIds.length ? form.notifyEmployeeIds : undefined,
      };
      if (submitForEmployeeId) body.employeeId = submitForEmployeeId;
      const result = await apiRequest("POST", "/api/leave/request", body);
      const data = await result.json();
      toast.success(data.autoApproved ? "Leave auto-approved!" : "Leave request submitted for approval");
      invalidateLeaveAndNotifications(qc);
      onClose();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || "Failed to submit request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" /> Apply for Leave
          </DialogTitle>
          <DialogDescription>
            {submitForEmployeeId && submitForEmployeeId !== employeeId
              ? "Submit a leave request on behalf of this employee."
              : "Submit a leave request for approval."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Leave Type *</Label>
            {!employeeId ? (
              <div className="rounded-lg border border-dashed border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  No employee linked. Contact HR.
                </p>
              </div>
            ) : isError ? (
              <div className="rounded-lg border border-dashed border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Failed to load leave types. Please try again or contact HR.
                </p>
              </div>
            ) : leaveTypesSorted.length === 0 ? (
              <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
                <p className="text-sm text-amber-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  No leave types available. HR needs to set up a policy for this role/department.
                </p>
              </div>
            ) : (
              <Select value={form.leaveTypeId} onValueChange={(v) => setForm({ ...form, leaveTypeId: v })}>
                <SelectTrigger><SelectValue placeholder="Select leave type..." /></SelectTrigger>
                <SelectContent>
                  {leaveTypesSorted.map((t) => {
                    const isUnpaid = t.paid === false;
                    const balRaw = parseFloat(t.balance || "0");
                    const bal = Number.isFinite(balRaw) ? Math.floor(balRaw * 2) / 2 : 0;
                    const balStr = Number.isInteger(bal) ? String(bal) : bal.toFixed(1);
                    const label = isUnpaid ? "Unlimited" : `Bal: ${balStr}${t.max_balance != null ? ` / ${t.max_balance}` : ""}`;
                    return (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2 truncate">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                          <span className="truncate">{t.name} {isUnpaid ? "(Unpaid)" : ""} — {label}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>End Date *</Label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} min={form.startDate || undefined} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Day Type</Label>
            <Select value={form.dayType} onValueChange={(v) => setForm({ ...form, dayType: v })}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full Day</SelectItem>
                <SelectItem value="first_half">1st Half</SelectItem>
                <SelectItem value="second_half">2nd Half</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {dayCount > 0 && (
            <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50 p-3">
              <p className="text-sm font-medium text-blue-700">Total: {dayCount} day{dayCount !== 1 ? "s" : ""}</p>
              {selected && selected.paid && (() => {
                const b = parseFloat(selected.balance || "0");
                const r = Number.isFinite(b) ? Math.floor(b * 2) / 2 : 0;
                return r < dayCount;
              })() && (
                <p className="text-xs text-red-600 mt-1">
                  Insufficient balance ({(() => {
                    const b = parseFloat(selected.balance || "0");
                    const r = Number.isFinite(b) ? Math.floor(b * 2) / 2 : 0;
                    return Number.isInteger(r) ? String(r) : r.toFixed(1);
                  })()} available)
                </p>
              )}
              {selected && !selected.paid && (
                <p className="text-xs text-muted-foreground mt-1">Unpaid leave (LWOP) — no balance deduction</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Add a note</Label>
            <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason for leave..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              Attach Supporting Document
              <span className="text-muted-foreground" title="Upload medical or other evidence (PDF, images). Optional unless required by leave type."><HelpCircle className="h-3.5 w-3.5" /></span>
            </Label>
            <input ref={fileInputRef} type="file" accept={ACCEPT_ATTACHMENT} className="hidden" onChange={handleFileChange} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Paperclip className="h-4 w-4" /> {form.attachmentUrl ? "Change file" : "Upload file"}
            </Button>
            {form.attachmentUrl && <p className="text-xs text-muted-foreground">File attached (under {MAX_ATTACHMENT_SIZE_MB}MB)</p>}
          </div>
          <div className="space-y-2">
            <Label>Notify others</Label>
            <p className="text-xs text-muted-foreground">Select employees to notify when you apply (they will see it in notifications).</p>
            <Select value="" onValueChange={(v) => v && toggleNotifyEmployee(v)}>
              <SelectTrigger><SelectValue placeholder="Select employees to notify..." /></SelectTrigger>
              <SelectContent>
                {employeesList
                  .filter((emp) => emp.id !== employeeId && !form.notifyEmployeeIds.includes(emp.id))
                  .map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </SelectItem>
                  ))}
                {employeesList.filter((emp) => emp.id !== employeeId).length === 0 && <SelectItem value="__none__" disabled>No other employees</SelectItem>}
              </SelectContent>
            </Select>
            {form.notifyEmployeeIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {form.notifyEmployeeIds.map((id) => {
                  const emp = employeesList.find((e) => e.id === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-sm">
                      <EmployeeAvatar
                        employeeId={id}
                        fallbackInitials={emp ? employeeInitials(emp.first_name, emp.last_name) : "?"}
                        className="h-5 w-5 rounded-full shrink-0"
                        fallbackClassName="text-[9px]"
                      />
                      {emp ? `${emp.first_name} ${emp.last_name}` : id}
                      <button type="button" className="hover:text-destructive" onClick={() => toggleNotifyEmployee(id)} aria-label="Remove">×</button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          {selected?.requires_document && !form.attachmentUrl && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> This leave type requires a supporting document.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || dayCount <= 0 || !form.leaveTypeId || (!!selected?.requires_document && !form.attachmentUrl)}
          >
            {loading ? "Submitting..." : "Apply time off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
