import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { EmployeeSelect } from "@/components/EmployeeSelect";
import {
  Clock, Plus, Edit2, Trash2, Users, Calendar, CheckCircle, XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// ==================== TYPES ====================

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  weekly_pattern: boolean[];
  is_active: boolean;
  active_employees?: number;
}

interface EmployeeShift {
  id: string;
  employee_id: string;
  shift_id: string;
  effective_from: string;
  effective_to: string | null;
  shift_name: string;
  start_time: string;
  end_time: string;
  first_name: string;
  last_name: string;
  emp_code: string;
  department: string;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatTime12(t: string): string {
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  const ampm = hr >= 12 ? "PM" : "AM";
  return `${hr === 0 ? 12 : hr > 12 ? hr - 12 : hr}:${m} ${ampm}`;
}

// ==================== MAIN COMPONENT ====================

export default function Shifts() {
  const queryClient = useQueryClient();
  const { isAdmin, isHR } = useAuth();
  const canManage = isAdmin || isHR;

  const [shiftDialog, setShiftDialog] = useState<{ open: boolean; shift: Shift | null }>({ open: false, shift: null });
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignForm, setAssignForm] = useState({ employeeId: "", shiftId: "", effectiveFrom: new Date().toISOString().split("T")[0], effectiveTo: "" });

  // ==================== QUERIES ====================

  const { data: shifts = [] } = useQuery<Shift[]>({
    queryKey: ["/api/attendance/shifts"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/attendance/shifts");
      const json = await r.json();
      return Array.isArray(json?.data) ? json.data : [];
    },
  });

  const { data: assignments = [] } = useQuery<EmployeeShift[]>({
    queryKey: ["/api/attendance/employee-shifts"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/attendance/employee-shifts");
      const json = await r.json();
      return Array.isArray(json?.data) ? json.data : [];
    },
  });

  // ==================== MUTATIONS ====================

  const shiftMutation = useMutation({
    mutationFn: async (data: { id?: string; name: string; startTime: string; endTime: string; graceMinutes: number; weeklyPattern: boolean[]; isActive: boolean }) => {
      if (data.id) {
        const r = await apiRequest("PATCH", `/api/attendance/shifts/${data.id}`, data);
        return r.json();
      }
      const r = await apiRequest("POST", "/api/attendance/shifts", data);
      return r.json();
    },
    onSuccess: () => {
      toast.success("Shift saved");
      setShiftDialog({ open: false, shift: null });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/shifts"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to save shift"),
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/attendance/shifts/${id}`); },
    onSuccess: () => {
      toast.success("Shift deleted");
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/shifts"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to delete"),
  });

  const assignMutation = useMutation({
    mutationFn: async (data: typeof assignForm) => {
      const r = await apiRequest("POST", "/api/attendance/employee-shifts", {
        employeeId: data.employeeId,
        shiftId: data.shiftId,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo || null,
      });
      return r.json();
    },
    onSuccess: () => {
      toast.success("Shift assigned");
      setAssignDialog(false);
      setAssignForm({ employeeId: "", shiftId: "", effectiveFrom: new Date().toISOString().split("T")[0], effectiveTo: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/employee-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/shifts"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to assign"),
  });

  const removeAssignMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/attendance/employee-shifts/${id}`); },
    onSuccess: () => {
      toast.success("Assignment removed");
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/employee-shifts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/shifts"] });
    },
  });

  // ==================== RENDER ====================

  return (
    <Layout>
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Shift Management</h1>
          <p className="text-muted-foreground text-sm">Create shifts and assign them to employees.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAssignDialog(true)}>
              <Users className="h-4 w-4 mr-2" /> Assign Shift
            </Button>
            <Button onClick={() => setShiftDialog({ open: true, shift: null })}>
              <Plus className="h-4 w-4 mr-2" /> Create Shift
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="shifts" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
        </TabsList>

        {/* ==================== SHIFTS TAB ==================== */}
        <TabsContent value="shifts">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shifts.length === 0 ? (
              <Card className="col-span-full border-dashed">
                <CardContent className="p-12 text-center text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No shifts created yet</p>
                  <p className="text-sm mt-1">Create your first shift to start tracking attendance.</p>
                  {canManage && (
                    <Button className="mt-4" onClick={() => setShiftDialog({ open: true, shift: null })}>
                      <Plus className="h-4 w-4 mr-2" /> Create Shift
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : shifts.map((shift) => {
              const pattern = Array.isArray(shift.weekly_pattern)
                ? shift.weekly_pattern
                : (typeof shift.weekly_pattern === "string" ? JSON.parse(shift.weekly_pattern) : []);
              return (
                <Card key={shift.id} className={`border ${!shift.is_active ? "opacity-60" : ""}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary" />
                          {shift.name}
                        </CardTitle>
                        <CardDescription className="font-mono mt-1">
                          {formatTime12(shift.start_time)} — {formatTime12(shift.end_time)}
                        </CardDescription>
                      </div>
                      <Badge variant={shift.is_active ? "default" : "secondary"}>
                        {shift.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-1">
                      {DAY_LABELS.map((day, i) => (
                        <div
                          key={day}
                          className={`flex-1 text-center text-xs py-1 rounded ${pattern[i] ? "bg-primary/10 text-primary font-medium" : "bg-muted text-muted-foreground"}`}
                        >
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Grace: {shift.grace_minutes} min</span>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" /> {shift.active_employees ?? 0} employees
                      </span>
                    </div>
                    {canManage && (
                      <div className="flex gap-2 pt-2 border-t">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setShiftDialog({ open: true, shift })}>
                          <Edit2 className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => deleteShiftMutation.mutate(shift.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ==================== ASSIGNMENTS TAB ==================== */}
        <TabsContent value="assignments">
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Employee</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Timing</TableHead>
                  <TableHead>Effective From</TableHead>
                  <TableHead>Effective To</TableHead>
                  {canManage && <TableHead className="w-[80px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
{(!Array.isArray(assignments) || assignments.length === 0) ? (
                    <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center py-8 text-muted-foreground">No shift assignments yet</TableCell></TableRow>
                  ) : assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div><p className="font-medium text-sm">{a.first_name} {a.last_name}</p><p className="text-xs text-muted-foreground">{a.emp_code} · {a.department}</p></div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{a.shift_name}</Badge></TableCell>
                    <TableCell className="font-mono text-sm">{formatTime12(a.start_time)} — {formatTime12(a.end_time)}</TableCell>
                    <TableCell className="text-sm">{a.effective_from}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.effective_to || "Ongoing"}</TableCell>
                    {canManage && (
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => removeAssignMutation.mutate(a.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ==================== SHIFT CREATE/EDIT DIALOG ==================== */}
      <ShiftFormDialog
        open={shiftDialog.open}
        shift={shiftDialog.shift}
        onClose={() => setShiftDialog({ open: false, shift: null })}
        onSave={(data) => shiftMutation.mutate(data)}
        loading={shiftMutation.isPending}
      />

      {/* ==================== ASSIGN SHIFT DIALOG ==================== */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Assign Shift to Employee</DialogTitle>
            <DialogDescription>Select an employee and shift with effective dates.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <EmployeeSelect value={assignForm.employeeId} onChange={(id) => setAssignForm({ ...assignForm, employeeId: id })} />
            </div>
            <div className="space-y-2">
              <Label>Shift *</Label>
              <Select value={assignForm.shiftId} onValueChange={(v) => setAssignForm({ ...assignForm, shiftId: v })}>
                <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                <SelectContent>
                  {shifts.filter((s) => s.is_active).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({formatTime12(s.start_time)} — {formatTime12(s.end_time)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Effective From *</Label>
                <Input type="date" value={assignForm.effectiveFrom} onChange={(e) => setAssignForm({ ...assignForm, effectiveFrom: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Effective To</Label>
                <Input type="date" value={assignForm.effectiveTo} onChange={(e) => setAssignForm({ ...assignForm, effectiveTo: e.target.value })} />
                <p className="text-xs text-muted-foreground">Leave empty for ongoing</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(false)}>Cancel</Button>
            <Button onClick={() => assignMutation.mutate(assignForm)} disabled={!assignForm.employeeId || !assignForm.shiftId || assignMutation.isPending}>
              {assignMutation.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

// ==================== SHIFT FORM DIALOG ====================

function ShiftFormDialog({
  open, shift, onClose, onSave, loading,
}: {
  open: boolean;
  shift: Shift | null;
  onClose: () => void;
  onSave: (data: any) => void;
  loading: boolean;
}) {
  const isEdit = !!shift?.id;
  const [form, setForm] = useState({
    name: shift?.name || "",
    startTime: shift?.start_time || "09:00",
    endTime: shift?.end_time || "17:00",
    graceMinutes: shift?.grace_minutes ?? 15,
    weeklyPattern: shift?.weekly_pattern
      ? (Array.isArray(shift.weekly_pattern) ? shift.weekly_pattern : JSON.parse(shift.weekly_pattern as any))
      : [true, true, true, true, true, false, false],
    isActive: shift?.is_active ?? true,
  });

  // Reset when dialog opens with different shift
  useState(() => {
    if (open && shift) {
      const pattern = Array.isArray(shift.weekly_pattern) ? shift.weekly_pattern : JSON.parse(shift.weekly_pattern as any);
      setForm({
        name: shift.name, startTime: shift.start_time, endTime: shift.end_time,
        graceMinutes: shift.grace_minutes, weeklyPattern: pattern, isActive: shift.is_active,
      });
    }
  });

  const handleSubmit = () => {
    if (!form.name.trim() || !form.startTime || !form.endTime) {
      toast.error("Name, start time, and end time are required");
      return;
    }
    onSave({ id: shift?.id, ...form });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Shift" : "Create Shift"}</DialogTitle>
          <DialogDescription>Define the shift timing and working days.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Shift Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Morning Shift" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time *</Label>
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>End Time *</Label>
              <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Grace Period (minutes)</Label>
            <Input type="number" min={0} max={120} value={form.graceMinutes} onChange={(e) => setForm({ ...form, graceMinutes: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="space-y-2">
            <Label>Working Days</Label>
            <div className="flex gap-2">
              {DAY_LABELS.map((day, i) => (
                <div
                  key={day}
                  onClick={() => {
                    const next = [...form.weeklyPattern];
                    next[i] = !next[i];
                    setForm({ ...form, weeklyPattern: next });
                  }}
                  className={`flex-1 text-center text-xs py-2 rounded cursor-pointer border transition-colors ${form.weeklyPattern[i] ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/50"}`}
                >
                  {day}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={form.isActive} onCheckedChange={(c) => setForm({ ...form, isActive: !!c })} />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>{loading ? "Saving..." : isEdit ? "Update" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
