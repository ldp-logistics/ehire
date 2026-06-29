import Layout from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  LogOut, Search, Calendar, Clock, CheckCircle, XCircle,
  AlertTriangle, ChevronRight, User, Briefcase, Shield,
  Package, FileText, MessageSquare, Ban, RotateCcw, CircleDot,
  ClipboardList, Timer, Users, ArrowRight, Building2, Loader2, Pencil, Trash2, UserPlus,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useSearch } from "wouter";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { EmployeeSelect } from "@/components/EmployeeSelect";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTimeDisplay, formatLeaveDisplayDate } from "@/lib/dateUtils";

// ==================== TYPES ====================

interface OffboardingRecord {
  id: string;
  employee_id: string;
  initiated_by: string;
  offboarding_type: string;
  reason: string | null;
  notice_required: boolean;
  notice_period_days: number | null;
  initiated_at: string;
  resignation_date: string | null;
  exit_date: string;
  status: string;
  completed_at: string | null;
  remarks: string | null;
  // Joined
  first_name: string;
  last_name: string;
  work_email: string;
  emp_id: string;
  department: string;
  job_title: string;
  avatar: string | null;
  initiator_first_name: string;
  initiator_last_name: string;
  total_tasks: number;
  done_tasks: number;
}

interface OffboardingDetail extends OffboardingRecord {
  employment_status: string;
  tasks: OffboardingTask[];
  assets: AssetRow[];
  audit_log: AuditEntry[];
}

interface OffboardingTask {
  id: string;
  offboarding_id: string;
  task_type: string;
  title: string;
  assigned_to: string | null;
  status: string;
  completed_at: string | null;
  notes: string | null;
  related_asset_id: string | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
}

interface AssetRow {
  id: string;
  asset_id: string;
  asset_name?: string | null;
  user_name: string;
  ram: string | null;
  storage: string | null;
  processor: string | null;
  status: string;
  assigned_date: string | null;
}

interface AuditEntry {
  id: string;
  offboarding_id: string;
  action: string;
  performed_by: string | null;
  /** Resolved server-side: employee name or login email when performed_by is an id */
  performed_by_display?: string | null;
  details: string | null;
  previous_value: string | null;
  new_value: string | null;
  created_at: string;
}

type EmpOption = { id: string; first_name: string; last_name: string; department?: string; employee_id?: string; work_email?: string };

// ==================== HELPERS ====================

const statusBadge: Record<string, { label: string; className: string }> = {
  initiated: { label: "Initiated", className: "bg-blue-100 text-blue-700 border-blue-200" },
  in_notice: { label: "In Notice", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700 border-green-200" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const typeBadge: Record<string, { label: string; className: string }> = {
  resignation: { label: "Resignation", className: "bg-orange-100 text-orange-700 border-orange-200" },
  termination: { label: "Termination", className: "bg-red-100 text-red-700 border-red-200" },
  contract_end: { label: "Contract End", className: "bg-purple-100 text-purple-700 border-purple-200" },
};

const taskTypeIcon: Record<string, typeof Package> = {
  asset_return: Package,
  handover: ArrowRight,
  knowledge_transfer: FileText,
  final_settlement: Briefcase,
  exit_interview: MessageSquare,
};

const taskTypeLabel: Record<string, string> = {
  asset_return: "Asset Return",
  handover: "Handover",
  knowledge_transfer: "Knowledge Transfer",
  final_settlement: "Final Settlement",
  exit_interview: "Exit Interview",
};

function daysUntil(dateStr: string): number {
  if (!dateStr) return 0;
  const datePart = String(dateStr).trim().slice(0, 10);
  const exit = new Date(datePart + "T12:00:00");
  if (isNaN(exit.getTime())) return 0;
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const diff = Math.ceil((exit.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Number.isFinite(diff) ? diff : 0;
}

function formatDate(d: string | null, tz?: string | null, df?: string | null): string {
  if (!d) return "-";
  return formatLeaveDisplayDate(d, tz ?? null, df ?? null);
}

function toDateInputValue(d: string | null | undefined): string {
  if (!d) return "";
  return String(d).slice(0, 10);
}

function formatDateTime(d: string | null, tz?: string | null, df?: string | null): string {
  if (!d) return "-";
  return formatDateTimeDisplay(d, tz ?? null, df ?? null);
}

// ==================== INITIATE DIALOG ====================

function InitiateDialog({
  open,
  onClose,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  employees: EmpOption[];
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    employeeId: "",
    offboardingType: "resignation" as string,
    reason: "",
    noticeRequired: true,
    noticePeriodDays: "30",
    resignationDate: "",
    exitDateOverride: "",
    remarks: "",
  });
  const [loading, setLoading] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setForm({
        employeeId: "",
        offboardingType: "resignation",
        reason: "",
        noticeRequired: true,
        noticePeriodDays: "30",
        resignationDate: new Date().toISOString().split("T")[0],
        exitDateOverride: "",
        remarks: "",
      });
    }
  }, [open]);

  const computedExitDate = useMemo(() => {
    if (form.exitDateOverride) return form.exitDateOverride;
    if (!form.noticeRequired) return new Date().toISOString().split("T")[0];
    const d = new Date();
    d.setDate(d.getDate() + (parseInt(form.noticePeriodDays) || 0));
    return d.toISOString().split("T")[0];
  }, [form.noticeRequired, form.noticePeriodDays, form.exitDateOverride]);

  const handleSubmit = async () => {
    if (!form.employeeId) { toast.error("Select an employee"); return; }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/offboarding/initiate", {
        employeeId: form.employeeId,
        offboardingType: form.offboardingType,
        reason: form.reason || null,
        noticeRequired: form.noticeRequired,
        noticePeriodDays: form.noticeRequired ? parseInt(form.noticePeriodDays) || 0 : null,
        resignationDate: form.resignationDate || null,
        exitDateOverride: form.exitDateOverride || null,
        remarks: form.remarks || null,
      });
      toast.success("Offboarding initiated");
      queryClient.invalidateQueries({ queryKey: ["/api/offboarding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to initiate offboarding");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-red-500" /> Initiate Offboarding
          </DialogTitle>
          <DialogDescription>Start the offboarding process for an employee.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <EmployeeSelect
                value={form.employeeId}
                onChange={(id) => setForm({ ...form, employeeId: id })}
                employees={employees}
                placeholder="Search employee..."
              />
            </div>

            <div className="space-y-2">
              <Label>Offboarding Type *</Label>
              <Select value={form.offboardingType} onValueChange={(v) => setForm({ ...form, offboardingType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="resignation">Resignation</SelectItem>
                  <SelectItem value="termination">Termination</SelectItem>
                  <SelectItem value="contract_end">Contract End</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Reason for offboarding..."
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Notice Period Required</Label>
                <p className="text-xs text-muted-foreground">
                  If enabled, employee remains active until exit date.
                </p>
              </div>
              <Switch
                checked={form.noticeRequired}
                onCheckedChange={(v) => setForm({ ...form, noticeRequired: v })}
              />
            </div>

            {form.noticeRequired && (
              <div className="space-y-2">
                <Label>Notice Period (days)</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.noticePeriodDays}
                  onChange={(e) => setForm({ ...form, noticePeriodDays: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Resignation Date</Label>
              <Input
                type="date"
                value={form.resignationDate}
                onChange={(e) => setForm({ ...form, resignationDate: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Date the employee submitted their resignation (kab resign diya).
              </p>
            </div>

            <div className="space-y-2">
              <Label>Exit Date Override (optional)</Label>
              <Input
                type="date"
                value={form.exitDateOverride}
                onChange={(e) => setForm({ ...form, exitDateOverride: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Last working day — leave blank to auto-calculate from notice period.
              </p>
            </div>

            {/* Exit date preview */}
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-amber-700">
                <Calendar className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Calculated Exit Date: {formatDate(computedExitDate, user?.timeZone ?? null, user?.dateFormat ?? null)}
                </span>
              </div>
              {!form.noticeRequired && (
                <p className="text-xs text-amber-600 mt-1">
                  No notice — offboarding will complete immediately.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={loading}>
            {loading ? "Initiating..." : "Initiate Offboarding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== TASK NOTES DIALOG (optional notes per task) ====================

function TaskNotesDialog({
  open,
  onClose,
  task,
  onSave,
  isSaving,
}: {
  open: boolean;
  onClose: () => void;
  task: OffboardingTask | null;
  onSave: (notes: string, status?: "completed" | "waived") => void;
  isSaving: boolean;
}) {
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [action, setAction] = useState<"notes_only" | "completed" | "waived">("notes_only");
  useEffect(() => {
    setNotes(task?.notes ?? "");
    setAction("notes_only");
  }, [task]);

  if (!task) return null;

  const handleSave = () => {
    if (action === "completed") onSave(notes, "completed");
    else if (action === "waived") onSave(notes, "waived");
    else onSave(notes);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Task: {task.title}</DialogTitle>
          <DialogDescription>Add or edit notes. Optionally mark as Done or Waive.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Handover completed with John on 12 Jan…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="ghost" className="text-slate-600" onClick={() => { setAction("waived"); handleSave(); }} disabled={isSaving}>
            Waive
          </Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={() => { setAction("completed"); handleSave(); }} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Done"}
          </Button>
          <Button onClick={() => { setAction("notes_only"); onSave(notes); }} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Save notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== CANCEL TERMINATION DIALOG ====================

function CancelTerminationDialog({
  open,
  onOpenChange,
  recordId,
  employeeId,
  employeeName,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string;
  employeeId: string;
  employeeName: string;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/offboarding/${recordId}/cancel`, { reason: reason || null });
    },
    onSuccess: () => {
      toast.success("Termination cancelled");
      queryClient.invalidateQueries({ queryKey: ["/api/offboarding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/assignment-visibility"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      onSuccess();
      onOpenChange(false);
      setReason("");
    },
    onError: (err: any) => toast.error(err?.message || "Failed to cancel"),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel termination?</AlertDialogTitle>
          <AlertDialogDescription>
            This will cancel the offboarding for <strong>{employeeName}</strong>. The employee&apos;s exit date and status will be reverted so you can initiate offboarding for the correct person if needed. This action is audited.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <Label className="text-sm text-muted-foreground">Reason (optional)</Label>
          <Textarea
            className="mt-1"
            placeholder="e.g. Wrong employee selected"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => { e.preventDefault(); cancelMutation.mutate(); }}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Cancelling…</> : "Cancel termination"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ==================== DELETE RECORD DIALOG ====================

function DeleteRecordDialog({
  open,
  onOpenChange,
  recordId,
  employeeId,
  employeeName,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string;
  employeeId: string;
  employeeName: string;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/offboarding/${recordId}`);
    },
    onSuccess: () => {
      toast.success("Offboarding record deleted");
      queryClient.invalidateQueries({ queryKey: ["/api/offboarding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/assignment-visibility"] });
      onSuccess();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err?.message || "Failed to delete"),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete offboarding record?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the offboarding record for <strong>{employeeName}</strong> (tasks and audit log). This cannot be undone. Employee exit info is not reverted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => { e.preventDefault(); deleteMutation.mutate(); }}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Deleting…</> : "Delete record"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ==================== DETAIL SHEET ====================

function DetailSheet({
  open,
  onClose,
  employeeId,
  employees,
  onRequestCancel,
  onRequestDelete,
  isAdminOrHR,
  currentUserEmployeeId,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string | null;
  employees: EmpOption[];
  onRequestCancel?: (record: OffboardingDetail) => void;
  onRequestDelete?: (record: OffboardingDetail) => void;
  isAdminOrHR: boolean;
  currentUserEmployeeId: string | null;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("tasks");
  const [exitDateEdit, setExitDateEdit] = useState("");
  const [exitDateReason, setExitDateReason] = useState("");
  const [resignationDateEdit, setResignationDateEdit] = useState("");
  const [resignationDateReason, setResignationDateReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [taskNotesOpen, setTaskNotesOpen] = useState<OffboardingTask | null>(null);
  const [assignPopoverTaskId, setAssignPopoverTaskId] = useState<string | null>(null);

  const { data: detail, isLoading } = useQuery<OffboardingDetail>({
    queryKey: ["/api/offboarding", employeeId, "details"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/offboarding/employee/${employeeId}/details`);
      const json = await res.json();
      return json?.data ?? json;
    },
    enabled: !!employeeId && open,
  });

  useEffect(() => {
    if (detail) {
      setExitDateEdit(toDateInputValue(detail.exit_date));
      setResignationDateEdit(toDateInputValue(detail.resignation_date));
    }
  }, [detail]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/offboarding/${detail!.id}/complete`);
    },
    onSuccess: () => {
      toast.success("Offboarding completed");
      queryClient.invalidateQueries({ queryKey: ["/api/offboarding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/assignment-visibility"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.message || "Failed to complete"),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/offboarding/${detail!.id}/cancel`, { reason: cancelReason || null });
    },
    onSuccess: () => {
      toast.success("Offboarding cancelled");
      queryClient.invalidateQueries({ queryKey: ["/api/offboarding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/assignment-visibility"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.message || "Failed to cancel"),
  });

  const resignationDateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/offboarding/${detail!.id}/resignation-date`, {
        resignationDate: resignationDateEdit || null,
        reason: resignationDateReason || null,
      });
    },
    onSuccess: () => {
      toast.success("Resignation date updated");
      queryClient.invalidateQueries({ queryKey: ["/api/offboarding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offboarding", employeeId, "details"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update resignation date"),
  });

  const exitDateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/offboarding/${detail!.id}/exit-date`, {
        exitDate: exitDateEdit,
        reason: exitDateReason || null,
      });
    },
    onSuccess: () => {
      toast.success("Exit date updated");
      queryClient.invalidateQueries({ queryKey: ["/api/offboarding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offboarding", employeeId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setExitDateReason("");
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update exit date"),
  });

  const detailQueryKey = ["/api/offboarding", employeeId, "details"] as const;

  const taskMutation = useMutation({
    mutationFn: async ({ taskId, status, notes, assignedTo }: { taskId: string; status?: string; notes?: string; assignedTo?: string | null }) => {
      const body: Record<string, unknown> = {};
      if (status !== undefined) body.status = status;
      if (notes !== undefined) body.notes = notes;
      if (assignedTo !== undefined) body.assignedTo = assignedTo;
      await apiRequest("PATCH", `/api/offboarding/tasks/${taskId}`, body);
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: detailQueryKey });
      const prev = queryClient.getQueryData<OffboardingDetail>(detailQueryKey);
      const prevList = queryClient.getQueryData<OffboardingRecord[]>(["/api/offboarding"]);
      if (!prev?.tasks) return { prev, prevList };

      const updatedTasks = prev.tasks.map((t: OffboardingTask) => {
        if (t.id !== variables.taskId) return t;
        const next = { ...t };
        if (variables.status !== undefined) {
          next.status = variables.status;
          if (variables.status === "completed" || variables.status === "waived") next.completed_at = new Date().toISOString();
        }
        if (variables.notes !== undefined) next.notes = variables.notes;
        if (variables.assignedTo !== undefined) {
          next.assigned_to = variables.assignedTo;
          next.assignee_first_name = (variables as any).assigneeFirstName ?? null;
          next.assignee_last_name = (variables as any).assigneeLastName ?? null;
        }
        return next;
      });

      const wasDone = prev.tasks.some((t: OffboardingTask) => t.id === variables.taskId && (t.status === "completed" || t.status === "waived"));
      const nowDone = variables.status === "completed" || variables.status === "waived";
      const doneDelta = !wasDone && nowDone ? 1 : 0;

      queryClient.setQueryData<OffboardingDetail>(detailQueryKey, {
        ...prev,
        tasks: updatedTasks,
        done_tasks: prev.done_tasks + doneDelta,
      });

      if (Array.isArray(prevList) && doneDelta !== 0) {
        queryClient.setQueryData(
          ["/api/offboarding"],
          prevList.map((r) => r.id === prev.id ? { ...r, done_tasks: r.done_tasks + doneDelta } : r)
        );
      }
      return { prev, prevList };
    },
    onError: (_err, _variables, context) => {
      if (context?.prev) queryClient.setQueryData(detailQueryKey, context.prev);
      if (context?.prevList) queryClient.setQueryData(["/api/offboarding"], context.prevList);
      toast.error("Failed to update task");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offboarding"] });
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/assignment-visibility"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const handleTaskNotesSave = (notes: string, status?: "completed" | "waived") => {
    if (!taskNotesOpen) return;
    taskMutation.mutate({
      taskId: taskNotesOpen.id,
      notes: notes || undefined,
      status: status ?? taskNotesOpen.status,
    }, { onSettled: () => setTaskNotesOpen(null) });
  };

  const days = detail ? daysUntil(detail.exit_date) : 0;
  const isActive = detail && (detail.status === "initiated" || detail.status === "in_notice");
  const allTasksDone = detail && detail.tasks?.length > 0 && detail.tasks.every((t: OffboardingTask) => t.status === "completed" || t.status === "waived");
  const canComplete = isActive && (days <= 0 || allTasksDone);
  const taskProgress = detail && detail.total_tasks > 0
    ? Math.round((detail.done_tasks / detail.total_tasks) * 100)
    : 0;

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent className="sm:max-w-2xl flex flex-col p-0 gap-0 overflow-hidden">
          {isLoading || !detail ? (
            <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {/* Header */}
              <SheetHeader className="border-b p-6 pb-4 shrink-0">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="text-sm font-semibold">
                        {detail.first_name[0]}{detail.last_name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <SheetTitle className="text-lg font-semibold">{detail.first_name} {detail.last_name}</SheetTitle>
                      <p className="text-sm text-muted-foreground">{detail.job_title} · {detail.department}</p>
                      <p className="text-xs text-muted-foreground">{detail.emp_id} · {detail.work_email}</p>
                    </div>
                  </div>
                  <div className="text-right space-y-1 flex flex-col items-end">
                    <Badge className={statusBadge[detail.status]?.className || ""}>
                      {statusBadge[detail.status]?.label || detail.status}
                    </Badge>
                    <Badge variant="outline" className={typeBadge[detail.offboarding_type]?.className || ""}>
                      {typeBadge[detail.offboarding_type]?.label || detail.offboarding_type}
                    </Badge>
                    {isActive && isAdminOrHR && onRequestCancel && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onRequestCancel(detail)}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancel termination
                      </Button>
                    )}
                  </div>
                </div>

              {/* Countdown & progress */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Resignation Date</p>
                  <p className="text-sm font-semibold">{formatDate(detail.resignation_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Exit Date</p>
                  <p className="text-sm font-semibold">{formatDate(detail.exit_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Days Remaining</p>
                  <p className={`text-sm font-semibold ${days <= 0 ? "text-red-600" : days <= 7 ? "text-amber-600" : ""}`}>
                    {days <= 0 ? "Past due" : `${days} day${days === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Tasks</p>
                  <p className="text-sm font-semibold">{detail.done_tasks}/{detail.total_tasks}</p>
                </div>
              </div>
              <Progress value={taskProgress} className="mt-3 h-1.5" />
              </SheetHeader>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6 pb-4">
              <TabsList className="w-full grid grid-cols-4 mb-4">
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="assets">Assets</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger>
              </TabsList>

              {/* TASKS TAB */}
              <TabsContent value="tasks" className="mt-0">
                <ScrollArea className="h-[42vh] w-full">
                  <div className="space-y-2 pr-2">
                    {detail.tasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No tasks generated.</p>
                    ) : (
                      detail.tasks.map((task) => {
                        const Icon = taskTypeIcon[task.task_type] || ClipboardList;
                        return (
                          <div
                            key={task.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                              task.status === "completed"
                                ? "bg-green-50/50 border-green-200"
                                : task.status === "waived"
                                ? "bg-slate-50 border-slate-200 opacity-60"
                                : "bg-card border-border hover:bg-muted/40"
                            }`}
                          >
                            <div className={`shrink-0 ${
                              task.status === "completed" ? "text-green-600" :
                              task.status === "waived" ? "text-slate-400" : "text-muted-foreground"
                            }`}>
                              {task.status === "completed" ? <CheckCircle className="h-5 w-5" /> :
                               task.status === "waived" ? <Ban className="h-5 w-5" /> :
                               <Icon className="h-5 w-5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${task.status !== "pending" ? "line-through text-muted-foreground" : ""}`}>
                                {task.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {taskTypeLabel[task.task_type] || task.task_type}
                                {task.assignee_first_name && ` · Assigned to ${task.assignee_first_name} ${task.assignee_last_name}`}
                                {task.completed_at && ` · Done ${formatDateTime(task.completed_at, user?.timeZone ?? null, user?.dateFormat ?? null)}`}
                              </p>
                              {task.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{task.notes}</p>}
                            </div>
                            <div className="flex gap-1 shrink-0 items-center flex-wrap">
                              {isAdminOrHR && (
                              <Popover open={assignPopoverTaskId === task.id} onOpenChange={(open) => { setAssignPopoverTaskId(open ? task.id : null); }}>
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                    title="Assign task"
                                  >
                                    {task.assigned_to ? (
                                      <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {task.assignee_first_name} {task.assignee_last_name}</span>
                                    ) : (
                                      <span className="flex items-center gap-1"><UserPlus className="h-3.5 w-3.5" /> Assign</span>
                                    )}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-1" align="end">
                                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                                    {employees.filter((e) => e.id !== detail?.employee_id).map((emp) => (
                                      <Button
                                        key={emp.id}
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-start h-8 text-xs"
                                        disabled={taskMutation.isPending}
                                        onClick={() => {
                                          taskMutation.mutate({
                                            taskId: task.id,
                                            assignedTo: emp.id,
                                          });
                                          setAssignPopoverTaskId(null);
                                        }}
                                      >
                                        <Avatar className="h-5 w-5 mr-2">
                                          <AvatarFallback className="text-[8px]">{emp.first_name?.[0]}{emp.last_name?.[0]}</AvatarFallback>
                                        </Avatar>
                                        {emp.first_name} {emp.last_name}
                                      </Button>
                                    ))}
                                  </div>
                                  {task.assigned_to && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-full justify-start h-8 text-xs text-muted-foreground border-t mt-1"
                                      disabled={taskMutation.isPending}
                                      onClick={() => {
                                        taskMutation.mutate({ taskId: task.id, assignedTo: null });
                                        setAssignPopoverTaskId(null);
                                      }}
                                    >
                                      Clear assignee
                                    </Button>
                                  )}
                                </PopoverContent>
                              </Popover>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setTaskNotesOpen(task)}
                                title="Add or edit notes"
                              >
                                <Pencil className="h-3.5 w-3.5 mr-1" /> Notes
                              </Button>
                              {isActive && task.status === "pending" && (isAdminOrHR || task.assigned_to === currentUserEmployeeId) && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs text-green-700 hover:text-green-800 hover:bg-green-50"
                                    onClick={() => taskMutation.mutate({ taskId: task.id, status: "completed" })}
                                  >
                                    Done
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs text-slate-500 hover:text-slate-700"
                                    onClick={() => taskMutation.mutate({ taskId: task.id, status: "waived", notes: "Waived by HR" })}
                                  >
                                    Waive
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* ASSETS TAB */}
              <TabsContent value="assets" className="mt-0">
                <ScrollArea className="h-[42vh] w-full">
                  {detail.assets.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No assets assigned to this employee.</p>
                  ) : (
                    <div className="rounded-lg border overflow-hidden pr-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Asset</TableHead>
                            <TableHead>Specs</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.assets.map((a) => (
                            <TableRow key={a.id}>
                              <TableCell className="font-medium text-sm">
                                {(a.asset_name && String(a.asset_name).trim()) || a.asset_id}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {[a.processor, a.ram, a.storage].filter(Boolean).join(" · ") || "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={
                                  a.status === "assigned" || a.status === "home"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : a.status === "available"
                                    ? "bg-green-50 text-green-700 border-green-200"
                                    : ""
                                }>
                                  {a.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              {/* SETTINGS TAB */}
              <TabsContent value="settings" className="mt-0">
                <ScrollArea className="h-[42vh] w-full">
                  <div className="space-y-4 pr-2">
                    {isActive && isAdminOrHR && (
                      <Card>
                        <CardHeader className="py-3 px-4">
                          <CardTitle className="text-sm">Resignation Date</CardTitle>
                          <CardDescription className="text-xs">When the employee submitted resignation. Changes are audited.</CardDescription>
                        </CardHeader>
                        <CardContent className="px-4 pb-4 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Resignation Date</Label>
                              <Input
                                type="date"
                                value={resignationDateEdit}
                                onChange={(e) => setResignationDateEdit(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Reason for Change</Label>
                              <Input
                                value={resignationDateReason}
                                onChange={(e) => setResignationDateReason(e.target.value)}
                                placeholder="e.g. corrected from letter"
                              />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => resignationDateMutation.mutate()}
                            disabled={resignationDateMutation.isPending || resignationDateEdit === toDateInputValue(detail.resignation_date)}
                          >
                            Update Resignation Date
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                    {/* Exit date override (admin/hr only) */}
                    {isActive && isAdminOrHR && (
                      <Card>
                        <CardHeader className="py-3 px-4">
                          <CardTitle className="text-sm">Override Exit Date</CardTitle>
                          <CardDescription className="text-xs">Changes are fully audited.</CardDescription>
                        </CardHeader>
                        <CardContent className="px-4 pb-4 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">New Exit Date</Label>
                              <Input
                                type="date"
                                value={exitDateEdit}
                                onChange={(e) => setExitDateEdit(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Reason for Change</Label>
                              <Input
                                value={exitDateReason}
                                onChange={(e) => setExitDateReason(e.target.value)}
                                placeholder="e.g. extended notice"
                              />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => exitDateMutation.mutate()}
                            disabled={exitDateMutation.isPending || exitDateEdit === toDateInputValue(detail.exit_date)}
                          >
                            Update Exit Date
                          </Button>
                        </CardContent>
                      </Card>
                    )}

                    {/* Info card */}
                    <Card>
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm">Offboarding Info</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Initiated At</span><span>{formatDateTime(detail.initiated_at, user?.timeZone ?? null, user?.dateFormat ?? null)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Initiated By</span><span>{detail.initiator_first_name} {detail.initiator_last_name}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="capitalize">{detail.offboarding_type.replace("_", " ")}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Resignation Date</span><span>{formatDate(detail.resignation_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Exit Date</span><span>{formatDate(detail.exit_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Notice</span><span>{detail.notice_required ? `${detail.notice_period_days} days` : "None"}</span></div>
                        {detail.reason && <div className="flex justify-between"><span className="text-muted-foreground">Reason</span><span>{detail.reason}</span></div>}
                        {detail.remarks && <div className="flex justify-between"><span className="text-muted-foreground">Remarks</span><span>{detail.remarks}</span></div>}
                        {detail.completed_at && <div className="flex justify-between"><span className="text-muted-foreground">Completed At</span><span>{formatDateTime(detail.completed_at, user?.timeZone ?? null, user?.dateFormat ?? null)}</span></div>}
                      </CardContent>
                    </Card>

                    {/* Cancel offboarding (admin/hr only) */}
                    {isActive && isAdminOrHR && (
                      <Card className="border-red-200">
                        <CardHeader className="py-3 px-4">
                          <CardTitle className="text-sm text-red-700">Danger Zone</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          {!showCancelConfirm ? (
                            <Button variant="destructive" size="sm" onClick={() => setShowCancelConfirm(true)}>
                              <XCircle className="h-4 w-4 mr-1" /> Cancel Offboarding
                            </Button>
                          ) : (
                            <div className="space-y-2">
                              <Textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Reason for cancellation..."
                                rows={2}
                              />
                              <div className="flex gap-2">
                                <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                                  Confirm Cancel
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setShowCancelConfirm(false)}>
                                  Back
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Delete past record (admin/hr only) */}
                    {!isActive && isAdminOrHR && detail && (detail.status === "completed" || detail.status === "cancelled") && onRequestDelete && (
                      <Card className="border-red-200">
                        <CardHeader className="py-3 px-4">
                          <CardTitle className="text-sm text-red-700">Delete record</CardTitle>
                          <CardDescription className="text-xs">Permanently remove this offboarding record and its audit trail.</CardDescription>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <Button variant="destructive" size="sm" onClick={() => onRequestDelete(detail)}>
                            <Trash2 className="h-4 w-4 mr-1" /> Delete this record
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* AUDIT TAB */}
              <TabsContent value="audit" className="mt-0">
                <ScrollArea className="h-[42vh] w-full">
                  {detail.audit_log.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No audit entries.</p>
                  ) : (
                    <div className="relative border-l-2 border-muted ml-3 space-y-4 pr-2">
                      {detail.audit_log.map((entry) => (
                        <div key={entry.id} className="relative pl-6">
                          <div className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-background bg-muted" />
                          <p className="text-sm font-medium capitalize">{entry.action.replace(/_/g, " ")}</p>
                          <p className="text-xs text-muted-foreground">{entry.details}</p>
                          {entry.previous_value && (
                            <p className="text-xs text-muted-foreground">
                              Changed: {entry.previous_value} &rarr; {entry.new_value}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatDateTime(entry.created_at, user?.timeZone ?? null, user?.dateFormat ?? null)} · by{" "}
                            {!entry.performed_by || entry.performed_by === "system"
                              ? "System"
                              : entry.performed_by_display?.trim() || entry.performed_by}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>

            {/* Footer actions (admin/hr only) */}
            {isActive && isAdminOrHR && (
              <div className="border-t px-6 py-3 flex justify-end">
                <Button
                  variant="destructive"
                  disabled={!canComplete || completeMutation.isPending}
                  onClick={() => completeMutation.mutate()}
                >
                  {completeMutation.isPending ? "Completing..." : "Complete Offboarding"}
                  {!canComplete && days > 0 && <span className="ml-2 text-xs opacity-70">(Exit date in {days} day{days === 1 ? "" : "s"})</span>}
                </Button>
              </div>
            )}
          </>
        )}
        </SheetContent>
      </Sheet>
      <TaskNotesDialog
        open={!!taskNotesOpen}
        onClose={() => setTaskNotesOpen(null)}
        task={taskNotesOpen}
        onSave={handleTaskNotesSave}
        isSaving={taskMutation.isPending}
      />
    </>
  );
}

// ==================== MAIN PAGE ====================

export default function Offboarding() {
  const { user, effectiveRole } = useAuth();
  const isAdminOrHR = effectiveRole === "admin" || effectiveRole === "hr";
  const currentUserEmployeeId = user?.employeeId ?? null;

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [listTab, setListTab] = useState<"all" | "active" | "completed">("all");
  const [initiateOpen, setInitiateOpen] = useState(false);
  const [detailEmployeeId, setDetailEmployeeId] = useState<string | null>(null);
  const [cancelDialogRecord, setCancelDialogRecord] = useState<{ id: string; employeeId: string; name: string } | null>(null);
  const [deleteDialogRecord, setDeleteDialogRecord] = useState<{ id: string; employeeId: string; name: string } | null>(null);

  const obSearch = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(obSearch);
    const eid = params.get("employeeId");
    if (eid?.trim()) setDetailEmployeeId(eid.trim());
  }, [obSearch]);

  // Fetch offboarding records (API returns { success, data: array })
  const { data: records = [], isLoading } = useQuery<OffboardingRecord[]>({
    queryKey: ["/api/offboarding"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/offboarding");
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : [];
    },
  });

  // Fetch employees for initiate dialog (API returns array directly or { data } envelope)
  const { data: employeesRaw } = useQuery({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/employees");
      const json = await res.json();
      if (Array.isArray(json)) return json;
      return Array.isArray(json?.data) ? json.data : [];
    },
  });
  const employees: EmpOption[] = Array.isArray(employeesRaw) ? employeesRaw : [];

  const departments = useMemo(() => {
    const list = Array.isArray(records) ? records : [];
    return Array.from(new Set(list.map((r) => r.department).filter(Boolean))).sort() as string[];
  }, [records]);

  const filtered = useMemo(() => {
    const list = Array.isArray(records) ? records : [];
    return list.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (departmentFilter !== "all" && r.department !== departmentFilter) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return (
          r.first_name.toLowerCase().includes(s) ||
          r.last_name.toLowerCase().includes(s) ||
          (r.emp_id && r.emp_id.toLowerCase().includes(s)) ||
          (r.department && r.department.toLowerCase().includes(s))
        );
      }
      return true;
    });
  }, [records, statusFilter, departmentFilter, searchTerm]);

  const tabFiltered = useMemo(() => {
    if (listTab === "active") return filtered.filter((r) => r.status === "initiated" || r.status === "in_notice");
    if (listTab === "completed") return filtered.filter((r) => r.status === "completed");
    return filtered;
  }, [filtered, listTab]);

  // Stats
  const stats = useMemo(() => {
    const all = records;
    return {
      total: all.length,
      inNotice: all.filter((r) => r.status === "in_notice").length,
      initiated: all.filter((r) => r.status === "initiated").length,
      completed: all.filter((r) => r.status === "completed").length,
      dueSoon: all.filter((r) => {
        if (r.status !== "in_notice" && r.status !== "initiated") return false;
        return daysUntil(r.exit_date) <= 7 && daysUntil(r.exit_date) >= 0;
      }).length,
    };
  }, [records]);

  return (
    <Layout>
      <div className="mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">Offboarding</h1>
          <p className="text-sm text-muted-foreground">Manage employee exits, notice periods, and handovers.</p>
        </div>
        {isAdminOrHR && (
        <Button variant="destructive" onClick={() => setInitiateOpen(true)}>
          <LogOut className="h-4 w-4 mr-2" /> Initiate Offboarding
        </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Timer className="h-5 w-5 text-yellow-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.inNotice + stats.initiated}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.dueSoon}</p>
              <p className="text-xs text-muted-foreground">Due in 7 days</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Filters */}
      <Card className="border border-border mb-4">
        <Tabs value={listTab} onValueChange={(v) => setListTab(v as "all" | "active" | "completed")}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 pt-4 pb-3 border-b">
            <TabsList className="h-9">
              <TabsTrigger value="all" className="text-xs px-3">
                All <span className="ml-1.5 text-[10px] font-semibold tabular-nums bg-muted px-1.5 py-0.5 rounded-full">{filtered.length}</span>
              </TabsTrigger>
              <TabsTrigger value="active" className="text-xs px-3">
                Active <span className="ml-1.5 text-[10px] font-semibold tabular-nums bg-muted px-1.5 py-0.5 rounded-full">{filtered.filter((r) => r.status === "initiated" || r.status === "in_notice").length}</span>
              </TabsTrigger>
              <TabsTrigger value="completed" className="text-xs px-3">
                Completed <span className="ml-1.5 text-[10px] font-semibold tabular-nums bg-muted px-1.5 py-0.5 rounded-full">{filtered.filter((r) => r.status === "completed").length}</span>
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-sm w-48"
                  placeholder="Search name, ID, dept…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="initiated">Initiated</SelectItem>
                  <SelectItem value="in_notice">In Notice</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              {departments.length > 1 && (
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </Tabs>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : tabFiltered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <LogOut className="h-12 w-12 mb-3 opacity-40" />
            <p className="font-medium">No offboarding records</p>
            <p className="text-sm">
              {records.length === 0 ? "Initiate an offboarding to get started." : searchTerm || statusFilter !== "all" || departmentFilter !== "all" || listTab !== "all" ? "No records match your filters." : `No ${listTab} records.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Resignation</TableHead>
                <TableHead>Exit Date</TableHead>
                <TableHead>Days Left</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tabFiltered.map((r) => {
                const days = daysUntil(r.exit_date);
                const progress = r.total_tasks > 0 ? Math.round((r.done_tasks / r.total_tasks) * 100) : 0;
                const isActive = r.status === "initiated" || r.status === "in_notice";
                const isSelected = detailEmployeeId === r.employee_id;

                return (
                  <TableRow
                    key={r.id}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${isSelected ? "bg-primary/5" : ""}`}
                    onClick={() => setDetailEmployeeId(r.employee_id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{r.first_name[0]}{r.last_name[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{r.first_name} {r.last_name}</p>
                          <p className="text-xs text-muted-foreground">{r.emp_id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.department}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={typeBadge[r.offboarding_type]?.className || ""}>
                        {typeBadge[r.offboarding_type]?.label || r.offboarding_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(r.resignation_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</TableCell>
                    <TableCell className="text-sm">{formatDate(r.exit_date, user?.timeZone ?? null, user?.dateFormat ?? null)}</TableCell>
                    <TableCell>
                      {isActive ? (
                        <span className={`text-sm font-medium ${
                          days <= 0 ? "text-red-600" : days <= 7 ? "text-amber-600" : ""
                        }`}>
                          {days <= 0 ? "Past due" : `${days}d`}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[80px]">
                        <Progress value={progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground">{r.done_tasks}/{r.total_tasks}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusBadge[r.status]?.className || ""}>
                        {statusBadge[r.status]?.label || r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {isAdminOrHR && isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setCancelDialogRecord({ id: r.id, employeeId: r.employee_id, name: `${r.first_name} ${r.last_name}` })}
                            title="Cancel termination"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {isAdminOrHR && (r.status === "completed" || r.status === "cancelled") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteDialogRecord({ id: r.id, employeeId: r.employee_id, name: `${r.first_name} ${r.last_name}` })}
                            title="Delete record"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetailEmployeeId(r.employee_id)}
                        >
                          View <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialogs */}
      <InitiateDialog
        open={initiateOpen}
        onClose={() => setInitiateOpen(false)}
        employees={employees}
      />
      <DetailSheet
        open={!!detailEmployeeId}
        onClose={() => setDetailEmployeeId(null)}
        employeeId={detailEmployeeId}
        employees={employees}
        onRequestCancel={(record) => setCancelDialogRecord({ id: record.id, employeeId: record.employee_id, name: `${record.first_name} ${record.last_name}` })}
        onRequestDelete={(record) => setDeleteDialogRecord({ id: record.id, employeeId: record.employee_id, name: `${record.first_name} ${record.last_name}` })}
        isAdminOrHR={isAdminOrHR}
        currentUserEmployeeId={currentUserEmployeeId}
      />
      {cancelDialogRecord && (
        <CancelTerminationDialog
          open={!!cancelDialogRecord}
          onOpenChange={(open) => { if (!open) setCancelDialogRecord(null); }}
          recordId={cancelDialogRecord.id}
          employeeId={cancelDialogRecord.employeeId}
          employeeName={cancelDialogRecord.name}
          onSuccess={() => { if (detailEmployeeId === cancelDialogRecord.employeeId) setDetailEmployeeId(null); setCancelDialogRecord(null); }}
        />
      )}
      {deleteDialogRecord && (
        <DeleteRecordDialog
          open={!!deleteDialogRecord}
          onOpenChange={(open) => { if (!open) setDeleteDialogRecord(null); }}
          recordId={deleteDialogRecord.id}
          employeeId={deleteDialogRecord.employeeId}
          employeeName={deleteDialogRecord.name}
          onSuccess={() => { if (detailEmployeeId === deleteDialogRecord.employeeId) setDetailEmployeeId(null); setDeleteDialogRecord(null); }}
        />
      )}
    </Layout>
  );
}
