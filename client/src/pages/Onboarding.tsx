import Layout from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  CheckCircle,
  Circle,
  UserPlus,
  ArrowRight,
  Building2,
  Plus,
  Package,
  ChevronDown,
  ChevronUp,
  Lock,
  Search,
  X,
  Trash2,
  Clock,
  Calendar,
  Activity,
  Loader2,
  Check,
  Users,
  ClipboardList,
  Pencil,
} from "lucide-react";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatAutoDisplay } from "@/lib/dateUtils";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface OnboardingRecord {
  id: string;
  employeeId?: string;
  name: string;
  role: string;
  department: string;
  startDate: string;
  email?: string;
  avatar?: string;
  status: string;
  taskCount: number;
  completedCount: number;
  createdAt?: string;
  completedAt?: string;
  templateName?: string;
}

function isRequiredOnboardingTask(task: OnboardingTask): boolean {
  return task.requiresAssignment === true;
}

function isRequiredTaskSatisfied(task: OnboardingTask): boolean {
  if (!isRequiredOnboardingTask(task)) return true;
  if (!task.completed) return false;
  if (isSpecialTask(task.task) && !task.assignmentDetails?.trim()) return false;
  return true;
}

function allRequiredTasksSatisfied(tasks: OnboardingTask[]): boolean {
  const required = tasks.filter(isRequiredOnboardingTask);
  if (required.length === 0) return true;
  return required.every(isRequiredTaskSatisfied);
}

export interface OnboardingTask {
  id: string;
  task: string;
  taskKey: string;
  category: string;
  completed: boolean;
  completedAt?: string;
  assignmentDetails?: string;
  requiresAssignment?: boolean;
}

interface InitiateTaskItem {
  taskName: string;
  requiresAssignment?: boolean;
}

interface InitiateSection {
  templateSectionId: string | null;
  name: string;
  description: string | null;
  sortOrder: number;
  assignees: { id: string; first_name: string; last_name: string; avatar?: string | null }[];
  tasks: InitiateTaskItem[];
  expanded: boolean;
  newTaskDraft: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined, tz?: string | null, df?: string | null): string {
  if (!dateStr) return "—";
  return formatAutoDisplay(dateStr, tz ?? null, df ?? null);
}

function getInitials(fn?: string | null, ln?: string | null): string {
  return `${fn?.[0] ?? ""}${ln?.[0] ?? ""}`.toUpperCase() || "?";
}

function mapTemplateAssignees(assignees: any[] | undefined): { id: string; first_name: string; last_name: string; avatar?: string | null }[] {
  return (assignees ?? []).map(a => ({
    id: a.employeeId ?? a.employee_id ?? a.id,
    first_name: a.firstName ?? a.first_name ?? "",
    last_name: a.lastName ?? a.last_name ?? "",
    avatar: a.avatar ?? null,
  }));
}

function isSpecialTask(taskName: string) {
  const n = (taskName ?? "").toLowerCase();
  return n.includes("microsoft") || n.includes("work email") || n.includes("laptop") || n.includes("notebook") || n.includes("desktop");
}

function invalidateEmployeeAssetsCache(queryClient: ReturnType<typeof useQueryClient>, employeeId?: string | null) {
  if (!employeeId) return;
  queryClient.invalidateQueries({ queryKey: ["/api/assets/systems/user", employeeId] });
  window.dispatchEvent(new CustomEvent("employee-updated", { detail: { employeeId } }));
}

function toRecord(r: any): OnboardingRecord {
  const name =
    r.hireName ?? r.hire_name ??
    (r.firstName != null && r.lastName != null
      ? `${String(r.firstName).trim()} ${String(r.lastName).trim()}`.trim()
      : null) ??
    (r.first_name != null && r.last_name != null
      ? `${String(r.first_name).trim()} ${String(r.last_name).trim()}`.trim()
      : null) ??
    "Unknown";
  return {
    id: r.id,
    employeeId: r.employeeId ?? r.employee_id,
    name: name || "Unknown",
    role: r.hireRole ?? r.hire_role ?? r.jobTitle ?? r.job_title ?? "",
    department: r.hireDepartment ?? r.hire_department ?? r.department ?? "Other",
    startDate: r.startDate ?? r.start_date ?? r.joinDate ?? r.join_date ?? "",
    email: r.hireEmail ?? r.hire_email ?? r.workEmail ?? r.work_email,
    avatar: r.avatar ?? undefined,
    status: r.status ?? "in_progress",
    taskCount: r.taskCount ?? r.task_count ?? 0,
    completedCount: r.completedCount ?? r.completed_count ?? 0,
    createdAt: r.createdAt ?? r.created_at,
    completedAt: r.completedAt ?? r.completed_at,
    templateName: r.templateName ?? r.template_name ?? undefined,
  };
}

function safeTaskName(raw: string | undefined | null): string {
  if (!raw) return "";
  const s = raw.trim();
  if (!s.startsWith("{")) return s;
  try {
    const p = JSON.parse(s);
    if (p && typeof p.taskName === "string") return p.taskName;
  } catch { /* keep raw */ }
  return s;
}

function toTask(t: any): OnboardingTask {
  const rawName = t.taskName ?? t.task_name ?? "";
  return {
    id: t.id,
    task: safeTaskName(rawName),
    taskKey: t.id,
    category: t.category || "General",
    completed: t.completed === true || t.completed === "true",
    completedAt: t.completedAt ?? t.completed_at,
    assignmentDetails: t.assignmentDetails ?? t.assignment_details ?? undefined,
    requiresAssignment: t.requiresAssignment === true || t.requiresAssignment === "true",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD ONBOARDING WIZARD
// ─────────────────────────────────────────────────────────────────────────────

interface AddOnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  preFilledEmployeeId?: string | null;
  onSuccess: (recordId: string) => void;
}

function AddOnboardingWizard({ open, onClose, preFilledEmployeeId, onSuccess }: AddOnboardingWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(preFilledEmployeeId ? 2 : 1);
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [sections, setSections] = useState<InitiateSection[]>([]);
  const [sectionsInit, setSectionsInit] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState<{ sectionIdx: number | null; query: string }>({ sectionIdx: null, query: "" });
  const [submitting, setSubmitting] = useState(false);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setStep(preFilledEmployeeId ? 2 : 1);
      setSelectedEmployee(null);
      setEmployeeSearch("");
      setTemplateId("");
      setSections([]);
      setSectionsInit(false);
    }
  }, [open, preFilledEmployeeId]);

  // Fetch pre-filled employee details
  const { data: preFilledEmp } = useQuery<any>({
    queryKey: ["/api/employees", preFilledEmployeeId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/employees/${preFilledEmployeeId}`);
      const j = await res.json();
      return j?.data ?? j;
    },
    enabled: open && !!preFilledEmployeeId,
  });

  const activeEmployeeId = preFilledEmployeeId ?? selectedEmployee?.id;
  const activeEmployee = preFilledEmployeeId ? preFilledEmp : selectedEmployee;

  // Employee search for step 1
  const { data: empSearchResults = [] } = useQuery<any[]>({
    queryKey: ["/api/employees", "wizard-search", employeeSearch],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/employees?q=${encodeURIComponent(employeeSearch)}&limit=12`);
      const j = await res.json();
      return Array.isArray(j?.data) ? j.data : [];
    },
    enabled: open && !preFilledEmployeeId && employeeSearch.trim().length >= 1,
  });

  // Templates for step 2
  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ["/api/onboarding-templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/onboarding-templates");
      const j = await res.json();
      return Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
    },
    enabled: open && step >= 2,
  });

  // Template detail for step 3
  const { data: templateDetail, isLoading: templateLoading } = useQuery<any>({
    queryKey: ["/api/onboarding-templates", templateId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/onboarding-templates/${templateId}`);
      const j = await res.json();
      return j?.data ?? j;
    },
    enabled: open && step === 3 && !!templateId,
  });

  useEffect(() => {
    if (templateDetail?.sections && step === 3 && !sectionsInit) {
      setSections(
        templateDetail.sections.map((s: any, i: number) => ({
          templateSectionId: s.id,
          name: s.name,
          description: s.description ?? null,
          sortOrder: i,
          assignees: mapTemplateAssignees(s.assignees ?? s.defaultAssignees),
          tasks: (s.tasks ?? []).map((t: any) => {
            const name = safeTaskName(typeof t === "string" ? t : (t.taskName ?? t.task_name ?? ""));
            const nameLower = name.toLowerCase();
            const isSpecial = nameLower.includes("microsoft") || nameLower.includes("work email") || nameLower.includes("laptop") || nameLower.includes("notebook");
            return {
              taskName: name,
              requiresAssignment: isSpecial || (typeof t !== "string" && t?.requiresAssignment === true),
            };
          }),
          expanded: true,
          newTaskDraft: "",
        }))
      );
      setSectionsInit(true);
    }
  }, [templateDetail, step, sectionsInit]);

  // Assignee search for step 3
  const { data: assigneeResults = [] } = useQuery<any[]>({
    queryKey: ["/api/employees", "assignee-search", assigneeSearch.query],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/employees?q=${encodeURIComponent(assigneeSearch.query)}&limit=10`);
      const j = await res.json();
      return Array.isArray(j?.data) ? j.data : [];
    },
    enabled: assigneeSearch.sectionIdx !== null && assigneeSearch.query.trim().length >= 1,
  });

  function updateSection(idx: number, patch: Partial<InitiateSection>) {
    setSections(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function addAssignee(idx: number, emp: any) {
    setSections(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      if (s.assignees.some(a => a.id === emp.id)) return s;
      return { ...s, assignees: [...s.assignees, emp] };
    }));
    setAssigneeSearch({ sectionIdx: null, query: "" });
  }
  function removeAssignee(idx: number, empId: string) {
    setSections(prev => prev.map((s, i) =>
      i === idx ? { ...s, assignees: s.assignees.filter(a => a.id !== empId) } : s
    ));
  }
  function addTask(idx: number) {
    const draft = sections[idx]?.newTaskDraft.trim();
    if (!draft) return;
    setSections(prev => prev.map((s, i) =>
      i === idx ? { ...s, tasks: [...s.tasks, { taskName: draft, requiresAssignment: false }], newTaskDraft: "" } : s
    ));
  }
  function removeTask(idx: number, taskIdx: number) {
    setSections(prev => prev.map((s, i) =>
      i === idx ? { ...s, tasks: s.tasks.filter((_, ti) => ti !== taskIdx) } : s
    ));
  }

  async function handleSubmit() {
    if (!activeEmployeeId || !templateId) return;
    if (!sections.length) { toast.error("No sections to initiate with"); return; }
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/onboarding/initiate", {
        employeeId: activeEmployeeId,
        templateId,
        sections: sections.map(s => ({
          templateSectionId: s.templateSectionId,
          name: s.name,
          description: s.description,
          sortOrder: s.sortOrder,
          assigneeIds: s.assignees.map(a => a.id),
          tasks: s.tasks,
        })),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? json?.error?.message ?? "Failed to initiate");
      const record = json?.data ?? json;
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      toast.success("Onboarding initiated successfully!");
      onSuccess(record?.id);
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to initiate onboarding");
    } finally {
      setSubmitting(false);
    }
  }

  const empName = activeEmployee
    ? `${activeEmployee.first_name ?? activeEmployee.firstName ?? ""} ${activeEmployee.last_name ?? activeEmployee.lastName ?? ""}`.trim()
    : "";
  const totalTasks = sections.reduce((n, s) => n + s.tasks.length, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>Start Onboarding</DialogTitle>
          <DialogDescription>
            {step === 1 && "Select the new hire to onboard."}
            {step === 2 && (empName ? `Choose a checklist template for ${empName}.` : "Choose a checklist template.")}
            {step === 3 && "Assign owners to each section and adjust tasks."}
          </DialogDescription>
          {/* Step indicator */}
          <div className="flex items-center gap-1 mt-3">
            {([1, 2, 3] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-colors ${
                  step > s ? "bg-primary text-primary-foreground" :
                  step === s ? "bg-primary/15 text-primary border border-primary" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {step > s ? <Check className="h-3 w-3" /> : s}
                </div>
                <span className={`text-xs hidden sm:block ${step === s ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {s === 1 ? "Employee" : s === 2 ? "Template" : "Customize"}
                </span>
                {i < 2 && <div className="w-6 h-px bg-border mx-1" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ── Step 1: Employee ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search employees…"
                  value={employeeSearch}
                  onChange={e => setEmployeeSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {selectedEmployee && (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-primary bg-primary/5">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={selectedEmployee.avatar} />
                    <AvatarFallback>{getInitials(selectedEmployee.first_name, selectedEmployee.last_name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{selectedEmployee.first_name} {selectedEmployee.last_name}</p>
                    <p className="text-xs text-muted-foreground">{selectedEmployee.job_title} · {selectedEmployee.department}</p>
                  </div>
                  <Check className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {empSearchResults.map((emp: any) => (
                  <button
                    key={emp.id}
                    type="button"
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left hover:bg-muted/60 transition-colors ${selectedEmployee?.id === emp.id ? "bg-primary/10" : ""}`}
                    onClick={() => setSelectedEmployee(emp)}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={emp.avatar} />
                      <AvatarFallback className="text-xs">{getInitials(emp.first_name, emp.last_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{emp.job_title} · {emp.department}</p>
                    </div>
                  </button>
                ))}
                {employeeSearch.trim() && empSearchResults.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No employees found</p>
                )}
                {!employeeSearch.trim() && (
                  <p className="text-sm text-muted-foreground text-center py-6">Type a name to search employees</p>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Template ── */}
          {step === 2 && (
            <div className="space-y-3">
              {activeEmployee && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border mb-4">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={activeEmployee.avatar} />
                    <AvatarFallback className="text-xs">{getInitials(activeEmployee.first_name ?? activeEmployee.firstName, activeEmployee.last_name ?? activeEmployee.lastName)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{empName}</p>
                    <p className="text-xs text-muted-foreground">{activeEmployee.job_title ?? activeEmployee.jobTitle} · {activeEmployee.department}</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Available templates</p>
              <div className="grid gap-2">
                {(templates as any[]).map((t: any) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                      templateId === t.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                    }`}
                  >
                    <div className={`mt-0.5 flex-shrink-0 h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors ${templateId === t.id ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
                      {templateId === t.id && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{t.name}</p>
                      {t.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.description}</p>}
                      {t.sectionCount != null && (
                        <p className="text-xs text-muted-foreground mt-1">{t.sectionCount} section{t.sectionCount !== 1 ? "s" : ""}</p>
                      )}
                    </div>
                  </button>
                ))}
                {templates.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No templates available</p>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Customize ── */}
          {step === 3 && (
            <div className="space-y-3">
              {templateLoading && (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading template…</span>
                </div>
              )}
              {!templateLoading && sections.map((section, idx) => (
                <div key={idx} className="border border-border rounded-xl overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 text-left"
                    onClick={() => updateSection(idx, { expanded: !section.expanded })}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">{idx + 1}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold">{section.name}</span>
                          <Lock className="h-3 w-3 text-amber-500 flex-shrink-0" />
                        </div>
                        {section.description && <p className="text-xs text-muted-foreground truncate">{section.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <div className="flex -space-x-1.5">
                        {section.assignees.slice(0, 3).map(a => (
                          <Avatar key={a.id} className="h-5 w-5 ring-2 ring-background">
                            <AvatarFallback className="text-[8px]">{getInitials(a.first_name, a.last_name)}</AvatarFallback>
                          </Avatar>
                        ))}
                        {section.assignees.length > 3 && (
                          <div className="h-5 w-5 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[8px]">+{section.assignees.length - 3}</div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">{section.tasks.length} tasks</Badge>
                      {section.expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                  </button>

                  {section.expanded && (
                    <div className="border-t px-4 py-3 space-y-4">
                      {/* Assignees */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Assignees</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {section.assignees.map(a => (
                            <span key={a.id} className="inline-flex items-center gap-1 bg-muted rounded-full pl-1.5 pr-1.5 py-0.5 text-xs">
                              <Avatar className="h-4 w-4"><AvatarFallback className="text-[7px]">{getInitials(a.first_name, a.last_name)}</AvatarFallback></Avatar>
                              {a.first_name} {a.last_name}
                              <button type="button" onClick={() => removeAssignee(idx, a.id)} className="ml-0.5 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                            </span>
                          ))}
                        </div>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                          <Input
                            className="pl-6 h-7 text-xs"
                            placeholder="Search to add assignee…"
                            value={assigneeSearch.sectionIdx === idx ? assigneeSearch.query : ""}
                            onFocus={() => setAssigneeSearch({ sectionIdx: idx, query: "" })}
                            onChange={e => setAssigneeSearch({ sectionIdx: idx, query: e.target.value })}
                          />
                          {assigneeSearch.sectionIdx === idx && assigneeSearch.query.length > 0 && assigneeResults.length > 0 && (
                            <div className="absolute z-20 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                              {assigneeResults.map(emp => (
                                <button
                                  key={emp.id}
                                  type="button"
                                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted text-sm"
                                  onMouseDown={e => { e.preventDefault(); addAssignee(idx, emp); }}
                                >
                                  <Avatar className="h-5 w-5"><AvatarFallback className="text-[8px]">{getInitials(emp.first_name, emp.last_name)}</AvatarFallback></Avatar>
                                  {emp.first_name} {emp.last_name}
                                  <span className="text-xs text-muted-foreground ml-auto">{emp.department}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Tasks */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Tasks</p>
                        <div className="space-y-1 mb-2">
                          {section.tasks.map((task, ti) => (
                            <div key={ti} className="flex items-center gap-2 group py-0.5">
                              <div className="h-3.5 w-3.5 rounded border border-border flex-shrink-0 bg-muted" />
                              <span className="text-sm flex-1">{task.taskName}</span>
                              {task.requiresAssignment && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Required</span>
                              )}
                              <button type="button" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity" onClick={() => removeTask(idx, ti)}>
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            className="h-7 text-xs flex-1"
                            placeholder="+ Add task to section"
                            value={section.newTaskDraft}
                            onChange={e => updateSection(idx, { newTaskDraft: e.target.value })}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTask(idx); } }}
                          />
                          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => addTask(idx)}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-muted/20 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-muted-foreground">
            {step === 3 && `${sections.length} section${sections.length !== 1 ? "s" : ""} · ${totalTasks} task${totalTasks !== 1 ? "s" : ""}`}
          </div>
          <div className="flex gap-2">
            {step > (preFilledEmployeeId ? 2 : 1) && (
              <Button variant="outline" size="sm" onClick={() => { setStep(prev => (prev - 1) as any); setSectionsInit(false); }}>
                Back
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            {step < 3 ? (
              <Button
                size="sm"
                disabled={(step === 1 && !selectedEmployee) || (step === 2 && !templateId)}
                onClick={() => {
                  if (step === 2) setSectionsInit(false);
                  setStep(prev => (prev + 1) as any);
                }}
              >
                Next <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={submitting || !sections.length}
                onClick={handleSubmit}
              >
                {submitting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Initiating…</> : "Send Checklist"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK DETAIL DIALOG
// ─────────────────────────────────────────────────────────────────────────────

interface TaskDetailDialogProps {
  open: boolean;
  task: OnboardingTask | null;
  onClose: () => void;
  onSave: (value: string) => void;
  isSaving: boolean;
  stockItems: any[];
}

function TaskDetailDialog({ open, task, onClose, onSave, isSaving, stockItems }: TaskDetailDialogProps) {
  const [value, setValue] = useState(task?.assignmentDetails ?? "");
  useEffect(() => { setValue(task?.assignmentDetails ?? ""); }, [task]);

  const taskName = (task?.task ?? "").toLowerCase();
  const isWorkEmail = taskName.includes("microsoft") || taskName.includes("work email") || taskName.includes("company microsoft account");
  const isLaptop = taskName.includes("laptop") || taskName.includes("notebook") || taskName.includes("desktop");

  const availableLaptops = stockItems.filter(s =>
    (s.available ?? s.quantity ?? 0) > 0 &&
    (s.category === "Systems" || (s.name ?? "").toLowerCase().includes("laptop") || (s.name ?? "").toLowerCase().includes("notebook"))
  );
  const allAvailable = stockItems.filter(s => (s.available ?? s.quantity ?? 0) > 0);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isWorkEmail ? "Work Email / Microsoft Account" : isLaptop ? "Laptop Assignment" : (task?.task ?? "Notes")}
          </DialogTitle>
          <DialogDescription>
            {isWorkEmail
              ? "Enter the employee's Microsoft account email. This updates the work email on their profile."
              : isLaptop
                ? "Select from stock or enter laptop details manually."
                : "Optionally add notes or details for this task."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {isLaptop && allAvailable.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm">Select from stock</Label>
              <Select
                value={(availableLaptops.length > 0 ? availableLaptops : allAvailable).some((s: any) => `${s.name} (${s.id})` === value) ? value : ""}
                onValueChange={setValue}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose from Asset Management…" />
                </SelectTrigger>
                <SelectContent>
                  {(availableLaptops.length > 0 ? availableLaptops : allAvailable).map((s: any) => (
                    <SelectItem key={s.id} value={`${s.name} (${s.id})`}>
                      {s.name} — {s.available ?? s.quantity} available
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Or enter manually below</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm">
              {isWorkEmail ? "Microsoft account email" : isLaptop ? (allAvailable.length > 0 ? "Manual entry" : "Laptop details") : "Notes (optional)"}
            </Label>
            <Input
              type={isWorkEmail ? "email" : "text"}
              placeholder={isWorkEmail ? "john.doe@company.com" : isLaptop ? "e.g. Dell XPS 15 – Serial #A12345" : "e.g. Completed, reference #123, any notes…"}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (value.trim()) onSave(value.trim()); } }}
              autoFocus={!isLaptop || allAvailable.length === 0}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => onSave(value.trim())} disabled={!value.trim() || isSaving}>
            {isSaving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING DETAIL PANEL (Sheet)
// ─────────────────────────────────────────────────────────────────────────────

interface DetailPanelProps {
  open: boolean;
  onClose: () => void;
  record: OnboardingRecord | null;
  rawRecord: any;
  isAdminOrHR: boolean;
  isLoading: boolean;
  progress: number;
  completedCount: number;
  totalTasks: number;
  requiredCompleted: number;
  requiredTotal: number;
  canFinishOnboarding: boolean;
  templateName: string | null;
  onComplete: () => void;
  onDelete: () => void;
  onUpdateChecklist: () => void;
  isCompleting: boolean;
  isReopening: boolean;
  // task handlers
  onTaskClick: (task: OnboardingTask) => void;
  onToggleTask: (task: OnboardingTask) => void;
  onAddTask: (taskName: string, sectionId: string | null) => void;
  onRemoveTask: (taskId: string) => void;
  // assignee handlers (assigneeDisplay for optimistic UI when adding)
  onAddAssignee: (sectionId: string, employeeId: string, assigneeDisplay?: { id: string; first_name?: string; last_name?: string }) => void;
  onRemoveAssignee: (sectionId: string, employeeId: string) => void;
  isTogglingTask: boolean;
  isAddingTask: boolean;
  isRemovingTask: boolean;
  isAddingAssignee: boolean;
  isRemovingAssignee: boolean;
}

function DetailPanel({
  open, onClose, record, rawRecord, isAdminOrHR, isLoading,
  progress, completedCount, totalTasks, requiredCompleted, requiredTotal, canFinishOnboarding,
  templateName, onComplete, onDelete, onUpdateChecklist, isCompleting, isReopening,
  onTaskClick, onToggleTask, onAddTask, onRemoveTask,
  onAddAssignee, onRemoveAssignee,
  isTogglingTask, isAddingTask, isRemovingTask, isAddingAssignee, isRemovingAssignee,
}: DetailPanelProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("checklist");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [addTaskForm, setAddTaskForm] = useState({ value: "", sectionId: "" });
  const [recordAssigneeSearch, setRecordAssigneeSearch] = useState<{ sectionId: string | null; query: string }>({ sectionId: null, query: "" });

  useEffect(() => { if (open) setActiveTab("checklist"); }, [open, record?.id]);

  const { data: assigneeSearchResults = [] } = useQuery<any[]>({
    queryKey: ["/api/employees", "panel-assignee", recordAssigneeSearch.query],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/employees?q=${encodeURIComponent(recordAssigneeSearch.query)}&limit=8`);
      const j = await res.json();
      return Array.isArray(j?.data) ? j.data : [];
    },
    enabled: recordAssigneeSearch.sectionId !== null && recordAssigneeSearch.query.trim().length >= 1,
  });

  const rawSections: any[] = Array.isArray(rawRecord?.sections) ? rawRecord.sections : [];
  const hasSections = rawSections.length > 0;
  const flatTasks: OnboardingTask[] = Array.isArray(rawRecord?.tasks) ? rawRecord.tasks.map(toTask) : [];

  const allTasks: OnboardingTask[] = hasSections
    ? rawSections.flatMap((s: any) => (Array.isArray(s.tasks) ? s.tasks.map(toTask) : []))
    : flatTasks;

  const isSectionExpanded = (id: string) => expandedSections[id] !== false;
  const toggleSection = (id: string) => setExpandedSections(p => ({ ...p, [id]: !isSectionExpanded(id) }));

  // Build timeline events from available data
  const timelineEvents = useMemo(() => {
    const events: { date: string; label: string; icon: "start" | "task" | "done" | "update" }[] = [];
    if (record?.createdAt) {
      const tpl = templateName ? ` (${templateName})` : "";
      events.push({ date: record.createdAt, label: `Onboarding initiated${tpl}`, icon: "start" });
    }
    for (const t of allTasks) {
      if (t.completed && t.completedAt) events.push({ date: t.completedAt, label: t.task, icon: "task" });
    }
    const reopenedAt = rawRecord?.checklistReopenedAt ?? rawRecord?.checklist_reopened_at;
    if (reopenedAt) events.push({ date: reopenedAt, label: "Checklist updated (reopened)", icon: "update" });
    const completedAt = record?.completedAt;
    if (completedAt && record?.status === "completed") {
      events.push({ date: completedAt, label: "Onboarding completed", icon: "done" });
    } else if (completedAt && record?.status !== "completed") {
      events.push({ date: completedAt, label: "Previously completed", icon: "done" });
    }
    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [record, allTasks, templateName, rawRecord]);

  if (!record) return null;

  const isEditable = record.status !== "completed";
  const canComplete = canFinishOnboarding && isEditable;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <SheetHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-start gap-4">
            <Avatar className="h-12 w-12 flex-shrink-0">
              <AvatarImage src={record.avatar} />
              <AvatarFallback className="text-lg font-semibold">{record.name[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg leading-tight">{record.name}</SheetTitle>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="text-sm text-muted-foreground">{record.role}</span>
                {record.department && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />{record.department}
                    </span>
                  </>
                )}
                {record.startDate && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />Starts {formatDate(record.startDate, user?.timeZone ?? null, user?.dateFormat ?? null)}
                    </span>
                  </>
                )}
                {templateName && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ClipboardList className="h-3 w-3" />{templateName}
                    </span>
                  </>
                )}
              </div>
              {/* Progress bar */}
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {requiredTotal > 0
                      ? `Required: ${requiredCompleted}/${requiredTotal} done`
                      : `${completedCount} of ${totalTasks} tasks done`}
                    {requiredTotal > 0 && totalTasks > requiredTotal && (
                      <span className="text-muted-foreground/70"> · {completedCount}/{totalTasks} overall</span>
                    )}
                  </span>
                  <span className="font-medium text-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <Badge variant={record.status === "completed" ? "default" : "secondary"} className={record.status === "completed" ? "bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800" : ""}>
                {record.status === "completed" ? "Completed" : "In Progress"}
              </Badge>
            </div>
          </div>
          {isAdminOrHR && (
            <div className="flex gap-2 mt-3 flex-wrap">
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/5" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
              </Button>
              {record.status === "completed" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  disabled={isReopening}
                  onClick={onUpdateChecklist}
                >
                  {isReopening ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5 mr-1.5" />}
                  Update checklist
                </Button>
              )}
              {isEditable && (
                <Button
                  size="sm"
                  className="ml-auto"
                  disabled={!canComplete || isCompleting}
                  onClick={onComplete}
                  title={!canComplete ? "Complete all required items first" : undefined}
                >
                  {isCompleting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 mr-1.5" />}
                  Complete Onboarding
                </Button>
              )}
            </div>
          )}
        </SheetHeader>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-3 w-auto justify-start rounded-lg h-9 shrink-0">
            <TabsTrigger value="checklist" className="text-xs gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" /> Checklist
              {totalTasks > 0 && (
                <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{completedCount}/{totalTasks}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Timeline
            </TabsTrigger>
          </TabsList>

          {/* ── Checklist Tab ── */}
          <TabsContent value="checklist" className="flex-1 overflow-y-auto px-6 py-4 mt-0 space-y-3">
            {isLoading && (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Loading…</span>
              </div>
            )}

            {!isLoading && record.status === "completed" && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3 text-sm mb-1">
                <p className="font-medium text-emerald-800 dark:text-emerald-300">Onboarding completed</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {templateName ? <>Assigned checklist: <strong>{templateName}</strong>. </> : null}
                  Use <strong>Update checklist</strong> above to add items that arrive later.
                </p>
              </div>
            )}

            {!isLoading && hasSections && rawSections.map((sec: any, idx: number) => {
              const secTasks: OnboardingTask[] = Array.isArray(sec.tasks) ? sec.tasks.map(toTask) : [];
              const secAssignees: any[] = Array.isArray(sec.assignees) ? sec.assignees : [];
              const secDone = secTasks.filter(t => t.completed).length;
              const expanded = isSectionExpanded(sec.id);

              return (
                <div key={sec.id} className="border border-border rounded-xl overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 text-left select-none"
                    onClick={() => toggleSection(sec.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">{idx + 1}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-foreground">{sec.name}</span>
                          <Lock className="h-3 w-3 text-amber-500/80 flex-shrink-0" />
                        </div>
                        {sec.description && <p className="text-xs text-muted-foreground truncate">{sec.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      {secAssignees.length > 0 && (
                        <div className="flex -space-x-1.5">
                          {secAssignees.slice(0, 4).map((a: any) => (
                            <Avatar key={a.id ?? a.employee_id} className="h-5 w-5 ring-2 ring-background">
                              <AvatarImage src={a.avatar ?? undefined} />
                              <AvatarFallback className="text-[8px]">{getInitials(a.firstName ?? a.first_name, a.lastName ?? a.last_name)}</AvatarFallback>
                            </Avatar>
                          ))}
                          {secAssignees.length > 4 && (
                            <div className="h-5 w-5 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[8px]">+{secAssignees.length - 4}</div>
                          )}
                        </div>
                      )}
                      <span className={`text-xs font-medium tabular-nums ${secDone === secTasks.length && secTasks.length > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {secDone}/{secTasks.length}
                      </span>
                      {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t px-4 py-3">
                      {/* Section Assignees */}
                      <div className="mb-3 pb-3 border-b border-dashed">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Assignees</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {secAssignees.map((a: any) => {
                            const empId = a.employeeId ?? a.employee_id ?? a.id;
                            const name = [a.firstName ?? a.first_name, a.lastName ?? a.last_name].filter(Boolean).join(" ") || "Unknown";
                            return (
                              <div key={empId} className="inline-flex items-center gap-1 rounded-full bg-muted pl-1.5 pr-1 py-0.5 text-xs">
                                <Avatar className="h-4 w-4">
                                  <AvatarImage src={a.avatar} />
                                  <AvatarFallback className="text-[7px]">{name[0]}</AvatarFallback>
                                </Avatar>
                                <span>{name}</span>
                                {isAdminOrHR && isEditable && (
                                  <button type="button" disabled={isRemovingAssignee} onClick={() => onRemoveAssignee(sec.id, empId)} className="rounded-full p-0.5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive ml-0.5">
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {isAdminOrHR && isEditable && (
                            <div className="relative">
                              <Input
                                placeholder="+ Add assignee"
                                className="h-6 text-xs w-32 px-2"
                                value={recordAssigneeSearch.sectionId === sec.id ? recordAssigneeSearch.query : ""}
                                onFocus={() => setRecordAssigneeSearch({ sectionId: sec.id, query: "" })}
                                onChange={e => setRecordAssigneeSearch({ sectionId: sec.id, query: e.target.value })}
                                onKeyDown={e => e.stopPropagation()}
                              />
                              {recordAssigneeSearch.sectionId === sec.id && recordAssigneeSearch.query.length > 0 && assigneeSearchResults.length > 0 && (
                                <div className="absolute left-0 top-full mt-1 z-20 w-56 rounded-lg border bg-popover shadow-md py-1 max-h-40 overflow-y-auto">
                                  {assigneeSearchResults
                                    .filter((emp: any) => !secAssignees.some((a: any) => (a.employeeId ?? a.employee_id ?? a.id) === emp.id))
                                    .map((emp: any) => (
                                      <button
                                        key={emp.id}
                                        type="button"
                                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted flex items-center gap-2"
                                        disabled={isAddingAssignee}
                                        onClick={e => { e.stopPropagation(); onAddAssignee(sec.id, emp.id, { id: emp.id, first_name: emp.first_name, last_name: emp.last_name }); setRecordAssigneeSearch({ sectionId: null, query: "" }); }}
                                      >
                                        <Avatar className="h-5 w-5">
                                          <AvatarImage src={emp.avatar} />
                                          <AvatarFallback className="text-[8px]">{getInitials(emp.first_name, emp.last_name)}</AvatarFallback>
                                        </Avatar>
                                        {emp.first_name} {emp.last_name}
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Tasks */}
                      <div className="space-y-0.5">
                        {secTasks.length === 0 && <p className="text-xs text-muted-foreground italic py-2">No tasks in this section</p>}
                        {secTasks.map(item => (
                          <div
                            key={item.taskKey}
                            className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50 cursor-pointer group border border-transparent hover:border-border/50 transition-all"
                            onClick={() => onTaskClick(item)}
                          >
                            <button
                              type="button"
                              className={`flex-shrink-0 transition-colors ${item.completed ? "text-emerald-500" : "text-muted-foreground/40 group-hover:text-muted-foreground"}`}
                              onClick={e => { e.stopPropagation(); if (isEditable) onToggleTask(item); }}
                              disabled={!isEditable || isTogglingTask}
                            >
                              {item.completed ? <CheckCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm block ${item.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.task}</span>
                              {item.assignmentDetails && <p className="text-xs text-muted-foreground mt-0.5 truncate">→ {item.assignmentDetails}</p>}
                            </div>
                            {isRequiredOnboardingTask(item) && !isRequiredTaskSatisfied(item) && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 flex-shrink-0">Required</span>
                            )}
                            {isEditable && (
                              <Badge variant="outline" className="text-[10px] flex-shrink-0">{item.assignmentDetails ? "Edit" : "Assign"}</Badge>
                            )}
                            {isAdminOrHR && isEditable && (
                              <button
                                type="button"
                                className="flex-shrink-0 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={e => { e.stopPropagation(); onRemoveTask(item.id); }}
                                disabled={isRemovingTask}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {isAdminOrHR && isEditable && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-dashed">
                          <Input
                            placeholder="+ Add task to section"
                            value={addTaskForm.sectionId === sec.id ? addTaskForm.value : ""}
                            onChange={e => setAddTaskForm({ value: e.target.value, sectionId: sec.id })}
                            onFocus={() => setAddTaskForm(p => ({ ...p, sectionId: sec.id }))}
                            onKeyDown={e => {
                              if (e.key === "Enter" && addTaskForm.value.trim() && addTaskForm.sectionId === sec.id) {
                                onAddTask(addTaskForm.value.trim(), sec.id);
                                setAddTaskForm({ value: "", sectionId: "" });
                              }
                            }}
                            className="flex-1 h-7 text-xs"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            disabled={!addTaskForm.value.trim() || addTaskForm.sectionId !== sec.id || isAddingTask}
                            onClick={() => {
                              if (addTaskForm.value.trim() && addTaskForm.sectionId === sec.id) {
                                onAddTask(addTaskForm.value.trim(), sec.id);
                                setAddTaskForm({ value: "", sectionId: "" });
                              }
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Legacy flat tasks */}
            {!isLoading && !hasSections && (
              <div className="space-y-1">
                {flatTasks.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No checklist items</p>
                  </div>
                )}
                {flatTasks.map(item => (
                  <div
                    key={item.taskKey}
                    className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer group border border-transparent hover:border-border/50"
                    onClick={() => onTaskClick(item)}
                  >
                    <button
                      type="button"
                      className={`flex-shrink-0 ${item.completed ? "text-emerald-500" : "text-muted-foreground/40 group-hover:text-muted-foreground"}`}
                      onClick={e => { e.stopPropagation(); if (isEditable) onToggleTask(item); }}
                      disabled={!isEditable || isTogglingTask}
                    >
                      {item.completed ? <CheckCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm ${item.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.task}</span>
                      {item.assignmentDetails && <p className="text-xs text-muted-foreground mt-0.5 truncate">→ {item.assignmentDetails}</p>}
                    </div>
                    {isRequiredOnboardingTask(item) && !isRequiredTaskSatisfied(item) && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 flex-shrink-0">Required</span>
                    )}
                    {isEditable && (
                      <Badge variant="outline" className="text-[10px] flex-shrink-0">{item.assignmentDetails ? "Edit" : "Assign"}</Badge>
                    )}
                    {isAdminOrHR && isEditable && (
                      <button
                        type="button"
                        className="flex-shrink-0 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                        onClick={e => { e.stopPropagation(); onRemoveTask(item.id); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                {isAdminOrHR && isEditable && (
                  <div className="flex items-center gap-2 pt-3 border-t border-dashed mt-2">
                    <Input
                      placeholder="Add custom task…"
                      value={addTaskForm.sectionId === "" ? addTaskForm.value : ""}
                      onChange={e => setAddTaskForm({ value: e.target.value, sectionId: "" })}
                      onFocus={() => setAddTaskForm(p => ({ ...p, sectionId: "" }))}
                      onKeyDown={e => {
                        if (e.key === "Enter" && addTaskForm.value.trim() && addTaskForm.sectionId === "") {
                          onAddTask(addTaskForm.value.trim(), null);
                          setAddTaskForm({ value: "", sectionId: "" });
                        }
                      }}
                      className="flex-1 h-8 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!addTaskForm.value.trim() || addTaskForm.sectionId !== "" || isAddingTask}
                      onClick={() => {
                        if (addTaskForm.value.trim()) {
                          onAddTask(addTaskForm.value.trim(), null);
                          setAddTaskForm({ value: "", sectionId: "" });
                        }
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── Timeline Tab ── */}
          <TabsContent value="timeline" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
            {timelineEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center text-muted-foreground">
                <Clock className="h-10 w-10 opacity-30" />
                <p className="text-sm">No activity yet</p>
              </div>
            ) : (
              <div className="relative pl-5 space-y-0">
                <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
                {timelineEvents.map((ev, i) => (
                  <div key={i} className="relative pb-5 last:pb-0">
                    <div className={`absolute left-[-15px] top-0.5 h-4 w-4 rounded-full border-2 border-background flex items-center justify-center ${
                      ev.icon === "done" ? "bg-emerald-500" :
                      ev.icon === "start" ? "bg-primary" :
                      "bg-muted-foreground/50"
                    }`}>
                      {ev.icon === "done" && <Check className="h-2 w-2 text-white" />}
                      {ev.icon === "start" && <UserPlus className="h-2 w-2 text-white" />}
                      {ev.icon === "task" && <CheckCircle className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <div className="pl-2">
                      <p className={`text-sm font-medium ${ev.icon === "done" ? "text-emerald-600 dark:text-emerald-400" : ev.icon === "start" ? "text-primary" : "text-foreground"}`}>
                        {ev.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(ev.date, user?.timeZone ?? null, user?.dateFormat ?? null)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ONBOARDING PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(s => s.addNotification);
  const { user, isAdmin, isHR } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = typeof search === "string" ? new URLSearchParams(search) : new URLSearchParams();

  const isAdminOrHR = isAdmin || isHR;

  const recordIdFromUrl = searchParams.get("recordId");
  const employeeIdFromUrl = searchParams.get("employeeId");

  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardEmployeeId, setWizardEmployeeId] = useState<string | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<OnboardingRecord | null>(null);
  const [taskDetailState, setTaskDetailState] = useState<{ open: boolean; task: OnboardingTask | null }>({ open: false, task: null });
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all");

  // ── Data Fetching ──
  const { data: recordsRaw = [], isLoading: listLoading } = useQuery({
    queryKey: ["/api/onboarding"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/onboarding");
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    },
  });

  const records: OnboardingRecord[] = useMemo(
    () => (Array.isArray(recordsRaw) ? recordsRaw.map(toRecord) : []),
    [recordsRaw]
  );

  const { data: selectedRecordRaw, isLoading: detailLoading } = useQuery({
    queryKey: ["/api/onboarding", selectedRecordId],
    queryFn: async () => {
      if (!selectedRecordId) return null;
      const res = await apiRequest("GET", `/api/onboarding/${selectedRecordId}`);
      const json = await res.json();
      return json?.data ?? json;
    },
    enabled: !!selectedRecordId,
  });

  const selectedRecord = selectedRecordRaw ? toRecord(selectedRecordRaw) : null;

  // Check if ?employeeId already has a record
  const { data: existingByEmployee, isError: noRecordForEmployee, isFetched: existingFetched } = useQuery<{ id: string }>({
    queryKey: ["/api/onboarding/employee", employeeIdFromUrl],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/onboarding/employee/${employeeIdFromUrl}`);
      if (!res.ok) throw new Error("no record");
      const json = await res.json();
      const data = json?.data ?? json;
      if (data?.id) return { id: data.id };
      throw new Error("no record");
    },
    enabled: isAdminOrHR && !!employeeIdFromUrl,
    retry: false,
  });

  // Stock items for task assignment
  const [taskDetailStockEnabled, setTaskDetailStockEnabled] = useState(false);
  const { data: stockItems = [] } = useQuery({
    queryKey: ["/api/assets/stock"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/assets/stock");
      const data = await res.json();
      return Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    },
    enabled: taskDetailStockEnabled,
  });

  // ── Effects ──
  useEffect(() => {
    if (employeeIdFromUrl && existingByEmployee?.id) {
      setSelectedRecordId(existingByEmployee.id);
      window.history.replaceState({}, "", "/onboarding");
    }
  }, [employeeIdFromUrl, existingByEmployee?.id]);

  useEffect(() => {
    if (employeeIdFromUrl && existingFetched && noRecordForEmployee && isAdminOrHR) {
      setWizardEmployeeId(employeeIdFromUrl);
      setWizardOpen(true);
      window.history.replaceState({}, "", "/onboarding");
    }
  }, [employeeIdFromUrl, existingFetched, noRecordForEmployee, isAdminOrHR]);

  useEffect(() => {
    if (recordIdFromUrl && records.some(r => r.id === recordIdFromUrl)) {
      setSelectedRecordId(recordIdFromUrl);
      window.history.replaceState({}, "", "/onboarding");
    }
  }, [records, recordIdFromUrl]);

  // ── Derived data ──
  const departments = useMemo(() => {
    const depts = Array.from(new Set(records.map(r => r.department).filter(Boolean))).sort();
    return depts;
  }, [records]);

  const filterRecords = (list: OnboardingRecord[]) => {
    let result = list;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q)
      );
    }
    if (deptFilter !== "all") result = result.filter(r => r.department === deptFilter);
    return result;
  };

  const myEmployeeId = user?.employeeId;
  const activeRecords = records.filter(r => r.status === "in_progress");
  const completedRecords = records.filter(r => r.status === "completed");

  const myTaskRecords = useMemo(() => {
    if (!selectedRecordRaw?.sections) return activeRecords;
    return activeRecords;
  }, [activeRecords, myEmployeeId, selectedRecordRaw]);

  const tabRecords = useMemo(() => {
    if (activeTab === "completed") return filterRecords(completedRecords);
    if (activeTab === "active") return filterRecords(activeRecords);
    return filterRecords(records);
  }, [activeTab, records, activeRecords, completedRecords, searchQuery, deptFilter]);

  // ── Compute progress for selected record ──
  const rawSections = Array.isArray(selectedRecordRaw?.sections) ? selectedRecordRaw.sections : [];
  const hasSections = rawSections.length > 0;
  const flatTasks: OnboardingTask[] = Array.isArray(selectedRecordRaw?.tasks) ? selectedRecordRaw.tasks.map(toTask) : [];
  const allTasksForProgress: OnboardingTask[] = hasSections
    ? rawSections.flatMap((s: any) => (Array.isArray(s.tasks) ? s.tasks.map(toTask) : []))
    : flatTasks;
  const totalTasks = allTasksForProgress.length;
  const completedCount = allTasksForProgress.filter(t => t.completed).length;
  const requiredTasks = allTasksForProgress.filter(isRequiredOnboardingTask);
  const requiredTotal = requiredTasks.length;
  const requiredCompleted = requiredTasks.filter(isRequiredTaskSatisfied).length;
  const canFinishOnboarding = allRequiredTasksSatisfied(allTasksForProgress);
  const progress = requiredTotal > 0
    ? Math.round((requiredCompleted / requiredTotal) * 100)
    : (totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0);
  const templateNameForRecord =
    selectedRecordRaw?.templateName ?? selectedRecordRaw?.template_name ?? selectedRecord?.templateName ?? null;

  // ── Stats ──
  const stats = useMemo(() => ({
    active: activeRecords.length,
    completed: completedRecords.length,
    total: records.length,
    dueThisWeek: activeRecords.filter(r => {
      if (!r.startDate) return false;
      const d = new Date(r.startDate);
      const now = new Date();
      const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    }).length,
  }), [records, activeRecords, completedRecords]);

  // ── Mutations ──
  const toggleTaskMutation = useMutation({
    mutationFn: async ({ recordId, taskId, completed }: { recordId: string; taskId: string; completed: boolean }) => {
      const res = await apiRequest("PATCH", `/api/onboarding/${recordId}/tasks/${taskId}`, { completed });
      return res.json();
    },
    onMutate: async ({ recordId, taskId, completed }) => {
      const queryKey = ["/api/onboarding", recordId] as const;
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey) as any;
      if (!prev) return { prev: null };
      const updated = JSON.parse(JSON.stringify(prev));
      const apply = (t: any) => { if (t?.id === taskId) { t.completed = completed; t.completed_at = completed ? new Date().toISOString() : null; return true; } return false; };
      if (Array.isArray(updated.sections)) { for (const s of updated.sections) { if (Array.isArray(s.tasks) && s.tasks.some(apply)) break; } }
      if (Array.isArray(updated.tasks)) updated.tasks.forEach(apply);
      queryClient.setQueryData(queryKey, updated);
      const listKey = ["/api/onboarding"] as const;
      const prevList = queryClient.getQueryData(listKey) as any[];
      if (Array.isArray(prevList)) {
        queryClient.setQueryData(listKey, prevList.map((r: any) => r.id !== recordId ? r : { ...r, completed_count: Math.max(0, (r.completed_count ?? 0) + (completed ? 1 : -1)) }));
      }
      return { prev, prevList };
    },
    onError: (err: Error, vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/onboarding", vars.recordId], ctx.prev);
      if (ctx?.prevList) queryClient.setQueryData(["/api/onboarding"], ctx.prevList);
      toast.error(err.message || "Failed to update task");
    },
    onSettled: (_, __, { recordId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding", recordId] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      const rec = queryClient.getQueryData(["/api/onboarding", recordId]) as { employeeId?: string; employee_id?: string } | undefined;
      invalidateEmployeeAssetsCache(queryClient, rec?.employeeId ?? rec?.employee_id);
    },
  });

  const updateTaskDetailsMutation = useMutation({
    mutationFn: async ({ recordId, taskId, assignmentDetails }: { recordId: string; taskId: string; assignmentDetails: string }) => {
      const res = await apiRequest("PATCH", `/api/onboarding/${recordId}/tasks/${taskId}`, { assignmentDetails });
      return res.json();
    },
    onMutate: async ({ recordId, taskId, assignmentDetails }) => {
      const queryKey = ["/api/onboarding", recordId] as const;
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey) as any;
      if (!prev) return { prev: null };
      const updated = JSON.parse(JSON.stringify(prev));
      const apply = (t: any) => { if (t?.id === taskId) { t.assignmentDetails = assignmentDetails; return true; } return false; };
      if (Array.isArray(updated.sections)) { for (const s of updated.sections) { if (Array.isArray(s.tasks) && s.tasks.some(apply)) break; } }
      if (Array.isArray(updated.tasks)) updated.tasks.forEach(apply);
      queryClient.setQueryData(queryKey, updated);
      setTaskDetailState({ open: false, task: null });
      return { prev };
    },
    onSuccess: () => {
      if (selectedRecordId) {
        queryClient.invalidateQueries({ queryKey: ["/api/onboarding", selectedRecordId] });
        queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
        invalidateEmployeeAssetsCache(queryClient, selectedRecord?.employeeId);
      }
      toast.success("Assignment details saved");
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/onboarding", selectedRecordId!], ctx.prev);
      toast.error(err.message || "Failed to save");
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: async ({ recordId, taskName, sectionId }: { recordId: string; taskName: string; sectionId: string | null }) => {
      const res = await apiRequest("POST", `/api/onboarding/${recordId}/tasks`, { taskName, sectionId, requiresAssignment: false });
      return res.json();
    },
    onSuccess: () => {
      if (selectedRecordId) {
        queryClient.invalidateQueries({ queryKey: ["/api/onboarding", selectedRecordId] });
        queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      }
      toast.success("Task added");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to add task"),
  });

  const removeTaskMutation = useMutation({
    mutationFn: async ({ recordId, taskId }: { recordId: string; taskId: string }) => {
      const res = await apiRequest("DELETE", `/api/onboarding/${recordId}/tasks/${taskId}`);
      if (res.status === 204) return;
      return res.json();
    },
    onMutate: async ({ recordId, taskId }) => {
      const queryKey = ["/api/onboarding", recordId] as const;
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey) as any;
      if (!prev) return { prev: null };
      let wasCompleted = false;
      const findTask = (arr: any[]) => { const t = arr.find((x: any) => x?.id === taskId); if (t) wasCompleted = t.completed === true || t.completed === "true"; return !!t; };
      if (Array.isArray(prev.sections)) { for (const s of prev.sections) { if (Array.isArray(s.tasks) && s.tasks.some(findTask)) break; } }
      if (!wasCompleted && Array.isArray(prev.tasks)) prev.tasks.some(findTask);

      const updated = JSON.parse(JSON.stringify(prev));
      const remove = (arr: any[]) => { const i = arr.findIndex((t: any) => t?.id === taskId); if (i >= 0) arr.splice(i, 1); };
      if (Array.isArray(updated.sections)) { for (const s of updated.sections) { if (Array.isArray(s.tasks)) remove(s.tasks); } }
      if (Array.isArray(updated.tasks)) remove(updated.tasks);
      queryClient.setQueryData(queryKey, updated);
      const listKey = ["/api/onboarding"] as const;
      const prevList = queryClient.getQueryData(listKey) as any[];
      if (Array.isArray(prevList)) {
        queryClient.setQueryData(listKey, prevList.map((r: any) => r.id !== recordId ? r : {
          ...r,
          completed_count: Math.max(0, (r.completed_count ?? 0) - (wasCompleted ? 1 : 0)),
          task_count: Math.max(0, (r.task_count ?? 0) - 1),
        }));
      }
      return { prev, prevList };
    },
    onSuccess: (_, { recordId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding", recordId] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      toast.success("Task removed");
    },
    onError: (err: Error, { recordId }, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/onboarding", recordId], ctx.prev);
      if (ctx?.prevList) queryClient.setQueryData(["/api/onboarding"], ctx.prevList);
      toast.error(err.message || "Failed to remove task");
    },
  });

  const addAssigneeMutation = useMutation({
    mutationFn: async ({ recordId, sectionId, employeeId }: { recordId: string; sectionId: string; employeeId: string; assigneeDisplay?: { id: string; first_name?: string; last_name?: string } }) => {
      const res = await apiRequest("POST", `/api/onboarding/${recordId}/sections/${sectionId}/assignees`, { employeeId });
      if (res.status === 204) return;
      return res.json();
    },
    onMutate: async ({ recordId, sectionId, employeeId, assigneeDisplay }: { recordId: string; sectionId: string; employeeId: string; assigneeDisplay?: { id: string; first_name?: string; last_name?: string } }) => {
      const queryKey = ["/api/onboarding", recordId] as const;
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey) as any;
      if (!prev?.sections) return { prev: null };
      const updated = JSON.parse(JSON.stringify(prev));
      const sec = updated.sections.find((s: any) => s.id === sectionId);
      if (sec) {
        sec.assignees = sec.assignees || [];
        sec.assignees.push({
          id: employeeId,
          employee_id: employeeId,
          employeeId,
          first_name: assigneeDisplay?.first_name ?? "",
          last_name: assigneeDisplay?.last_name ?? "",
          firstName: assigneeDisplay?.first_name,
          lastName: assigneeDisplay?.last_name,
        });
        queryClient.setQueryData(queryKey, updated);
      }
      return { prev };
    },
    onSuccess: (_, { recordId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding", recordId] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/assignment-visibility"] });
      toast.success("Assignee added");
    },
    onError: (err: Error, { recordId }, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/onboarding", recordId], ctx.prev);
      toast.error(err.message || "Failed to add assignee");
    },
  });

  const removeAssigneeMutation = useMutation({
    mutationFn: async ({ recordId, sectionId, employeeId }: { recordId: string; sectionId: string; employeeId: string }) => {
      const res = await apiRequest("DELETE", `/api/onboarding/${recordId}/sections/${sectionId}/assignees/${employeeId}`);
      if (res.status === 204) return;
      return res.json();
    },
    onMutate: async ({ recordId, sectionId, employeeId }) => {
      const queryKey = ["/api/onboarding", recordId] as const;
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey) as any;
      if (!prev?.sections) return { prev: null };
      const updated = JSON.parse(JSON.stringify(prev));
      const sec = updated.sections.find((s: any) => s.id === sectionId);
      if (sec && Array.isArray(sec.assignees)) {
        sec.assignees = sec.assignees.filter((a: any) => (a.employeeId ?? a.employee_id ?? a.id) !== employeeId);
        queryClient.setQueryData(queryKey, updated);
      }
      return { prev };
    },
    onSuccess: (_, { recordId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding", recordId] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/assignment-visibility"] });
      toast.success("Assignee removed");
    },
    onError: (err: Error, { recordId }, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/onboarding", recordId], ctx.prev);
      toast.error(err.message || "Failed to remove assignee");
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (payload: { recordId: string; record: OnboardingRecord }) => {
      const res = await apiRequest("PATCH", `/api/onboarding/${payload.recordId}`, { status: "completed", completedAt: new Date().toISOString() });
      await res.json();
      return payload;
    },
    onMutate: async ({ recordId }) => {
      const queryKey = ["/api/onboarding", recordId] as const;
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey) as any;
      if (!prev) return { prev: null };
      queryClient.setQueryData(queryKey, { ...prev, status: "completed", completedAt: new Date().toISOString() });
      const listKey = ["/api/onboarding"] as const;
      const prevList = queryClient.getQueryData(listKey) as any[];
      if (Array.isArray(prevList)) {
        queryClient.setQueryData(listKey, prevList.map((r: any) => r.id !== recordId ? r : { ...r, status: "completed" }));
      }
      setSelectedRecordId(null);
      return { prev, prevList, recordId };
    },
    onError: (err: Error, { recordId }, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/onboarding", recordId], ctx.prev);
      if (ctx?.prevList) queryClient.setQueryData(["/api/onboarding"], ctx.prevList);
      if (ctx?.recordId) setSelectedRecordId(ctx.recordId);
      toast.error(err.message || "Failed to complete");
    },
    onSuccess: async ({ recordId, record: rec }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding", recordId] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/assignment-visibility"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      addNotification({
        type: "onboarding",
        title: "Onboarding Completed",
        message: `${rec.name} (${rec.role}, ${rec.department}) has completed onboarding.`,
        roles: ["admin", "hr"],
        link: `/onboarding?recordId=${encodeURIComponent(recordId)}`,
        icon: "UserPlus",
      });
      toast.success(`Onboarding completed for ${rec.name}`, { description: "HR has been notified." });
      if (rec.employeeId) {
        queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
        window.dispatchEvent(new CustomEvent("employee-updated", { detail: { employeeId: rec.employeeId } }));
      }
    },
  });

  const reopenChecklistMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const res = await apiRequest("POST", `/api/onboarding/${recordId}/reopen-checklist`);
      const json = await res.json();
      return json?.data ?? json;
    },
    onSuccess: (_, recordId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding", recordId] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      toast.success("Checklist reopened — you can add new items");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update checklist"),
  });

  const deleteRecordMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const res = await apiRequest("DELETE", `/api/onboarding/${recordId}`);
      if (res.status !== 204) await res.json();
    },
    onSuccess: (_, recordId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      if (selectedRecordId === recordId) setSelectedRecordId(null);
      setRecordToDelete(null);
      toast.success("Onboarding removed");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete"),
  });

  // ── Handlers ──
  function handleToggleTask(task: OnboardingTask) {
    if (!selectedRecordId) return;
    if (task.requiresAssignment && isSpecialTask(task.task) && !task.assignmentDetails?.trim()) {
      toast.error("Save assignment details first for this task");
      return;
    }
    toggleTaskMutation.mutate({ recordId: selectedRecordId, taskId: task.id, completed: !task.completed });
  }

  function handleTaskClick(task: OnboardingTask) {
    const taskNameLower = task.task.toLowerCase();
    const isLaptop = taskNameLower.includes("laptop") || taskNameLower.includes("notebook");
    if (isLaptop) setTaskDetailStockEnabled(true);
    setTaskDetailState({ open: true, task });
  }

  function handleSaveTaskDetails(value: string) {
    if (!taskDetailState.task || !selectedRecordId) return;
    updateTaskDetailsMutation.mutate({ recordId: selectedRecordId, taskId: taskDetailState.task.id, assignmentDetails: value });
  }

  function handleComplete() {
    if (!selectedRecordId || !selectedRecord) return;
    if (!canFinishOnboarding) { toast.error("Complete all required checklist items first"); return; }
    completeMutation.mutate({ recordId: selectedRecordId, record: selectedRecord });
  }

  function handleUpdateChecklist() {
    if (!selectedRecordId) return;
    reopenChecklistMutation.mutate(selectedRecordId);
  }

  function handleAddTask(taskName: string, sectionId: string | null) {
    if (!selectedRecordId) return;
    addTaskMutation.mutate({ recordId: selectedRecordId, taskName, sectionId });
  }

  function handleRemoveTask(taskId: string) {
    if (!selectedRecordId) return;
    removeTaskMutation.mutate({ recordId: selectedRecordId, taskId });
  }

  function handleAddAssignee(sectionId: string, employeeId: string, assigneeDisplay?: { id: string; first_name?: string; last_name?: string }) {
    if (!selectedRecordId) return;
    addAssigneeMutation.mutate({ recordId: selectedRecordId, sectionId, employeeId, assigneeDisplay });
  }

  function handleRemoveAssignee(sectionId: string, employeeId: string) {
    if (!selectedRecordId) return;
    removeAssigneeMutation.mutate({ recordId: selectedRecordId, sectionId, employeeId });
  }

  // ── Table row component ──
  function RecordRow({ r }: { r: OnboardingRecord }) {
    const pct = r.taskCount > 0 ? Math.round((r.completedCount / r.taskCount) * 100) : 0;
    return (
      <tr
        className={`group border-b border-border cursor-pointer transition-colors hover:bg-muted/40 ${selectedRecordId === r.id ? "bg-primary/5" : ""}`}
        onClick={() => setSelectedRecordId(r.id)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage src={r.avatar} />
              <AvatarFallback className="text-xs font-semibold">{r.name[0]}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{r.name}</p>
              <p className="text-xs text-muted-foreground truncate">{r.role || "—"}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />{r.department || "—"}
          </span>
        </td>
        <td className="px-4 py-3 hidden lg:table-cell">
          <span className="text-xs text-muted-foreground">{r.startDate ? formatDate(r.startDate, user?.timeZone ?? null, user?.dateFormat ?? null) : "—"}</span>
        </td>
        <td className="px-4 py-3 w-32 hidden sm:table-cell">
          <div className="space-y-1">
            <Progress value={pct} className="h-1.5" />
            <p className="text-[10px] text-muted-foreground text-right tabular-nums">{r.completedCount}/{r.taskCount}</p>
          </div>
        </td>
        <td className="px-4 py-3">
          <Badge
            variant={r.status === "completed" ? "default" : "secondary"}
            className={`text-xs ${r.status === "completed" ? "bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800" : ""}`}
          >
            {r.status === "completed" ? "Completed" : "In Progress"}
          </Badge>
        </td>
        <td className="px-4 py-3">
          {isAdminOrHR && (
            <button
              type="button"
              className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
              onClick={e => { e.stopPropagation(); setRecordToDelete(r); }}
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <Layout>
      {/* ── Page Header ── */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Onboarding</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track and manage new hire checklists</p>
        </div>
        {isAdminOrHR && (
          <Button onClick={() => { setWizardEmployeeId(null); setWizardOpen(true); }}>
            <UserPlus className="h-4 w-4 mr-2" /> Start Onboarding
          </Button>
        )}
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: "In Progress", value: stats.active, icon: <Clock className="h-4 w-4 text-blue-500" />, color: "text-blue-600" },
          { label: "Starting This Week", value: stats.dueThisWeek, icon: <Calendar className="h-4 w-4 text-amber-500" />, color: "text-amber-600" },
          { label: "Completed", value: stats.completed, icon: <CheckCircle className="h-4 w-4 text-emerald-500" />, color: "text-emerald-600" },
          { label: "Total Hires", value: stats.total, icon: <Users className="h-4 w-4 text-muted-foreground" />, color: "text-foreground" },
        ].map(stat => (
          <Card key={stat.label} className="border border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                {stat.icon}
              </div>
              <div>
                <p className={`text-xl font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs + Table ── */}
      <Card className="border border-border">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Tab header with search + filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 pt-4 pb-3 border-b">
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs px-3">All <span className="ml-1.5 text-[10px] font-semibold tabular-nums bg-muted px-1.5 py-0.5 rounded-full">{records.length}</span></TabsTrigger>
              <TabsTrigger value="active" className="text-xs px-3">In Progress <span className="ml-1.5 text-[10px] font-semibold tabular-nums bg-muted px-1.5 py-0.5 rounded-full">{activeRecords.length}</span></TabsTrigger>
              <TabsTrigger value="completed" className="text-xs px-3">Completed <span className="ml-1.5 text-[10px] font-semibold tabular-nums bg-muted px-1.5 py-0.5 rounded-full">{completedRecords.length}</span></TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-sm w-48"
                  placeholder="Search hires…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              {departments.length > 1 && (
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                  <SelectTrigger className="h-8 text-xs w-36">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {(["all", "active", "completed"] as const).map(tab => (
            <TabsContent key={tab} value={tab} className="mt-0">
              {listLoading ? (
                <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading…</span>
                </div>
              ) : tabRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                  <ClipboardList className="h-12 w-12 opacity-20" />
                  <div className="text-center">
                    <p className="text-sm font-medium">
                      {searchQuery || deptFilter !== "all" ? "No results match your filters" : tab === "completed" ? "No completed onboardings yet" : tab === "active" ? "No active onboardings" : "No onboardings yet"}
                    </p>
                    {!searchQuery && deptFilter === "all" && isAdminOrHR && tab !== "completed" && (
                      <p className="text-xs mt-1">Click "Start Onboarding" to begin</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">New Hire</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Department</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Start Date</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-32 hidden sm:table-cell">Progress</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-2.5 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {tabRecords.map(r => <RecordRow key={r.id} r={r} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </Card>

      {/* ── Detail Sheet ── */}
      <DetailPanel
        open={!!selectedRecordId}
        onClose={() => setSelectedRecordId(null)}
        record={selectedRecord}
        rawRecord={selectedRecordRaw}
        isAdminOrHR={isAdminOrHR}
        isLoading={detailLoading}
        progress={progress}
        completedCount={completedCount}
        totalTasks={totalTasks}
        requiredCompleted={requiredCompleted}
        requiredTotal={requiredTotal}
        canFinishOnboarding={canFinishOnboarding}
        templateName={templateNameForRecord}
        onComplete={handleComplete}
        onDelete={() => selectedRecord && setRecordToDelete(selectedRecord)}
        onUpdateChecklist={handleUpdateChecklist}
        isCompleting={completeMutation.isPending}
        isReopening={reopenChecklistMutation.isPending}
        onTaskClick={handleTaskClick}
        onToggleTask={handleToggleTask}
        onAddTask={handleAddTask}
        onRemoveTask={handleRemoveTask}
        onAddAssignee={handleAddAssignee}
        onRemoveAssignee={handleRemoveAssignee}
        isTogglingTask={toggleTaskMutation.isPending}
        isAddingTask={addTaskMutation.isPending}
        isRemovingTask={removeTaskMutation.isPending}
        isAddingAssignee={addAssigneeMutation.isPending}
        isRemovingAssignee={removeAssigneeMutation.isPending}
      />

      {/* ── Add Onboarding Wizard ── */}
      <AddOnboardingWizard
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); setWizardEmployeeId(null); }}
        preFilledEmployeeId={wizardEmployeeId}
        onSuccess={(recordId) => {
          setSelectedRecordId(recordId);
          setWizardOpen(false);
          setWizardEmployeeId(null);
        }}
      />

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!recordToDelete} onOpenChange={v => { if (!v) setRecordToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete onboarding?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the onboarding checklist for <strong>{recordToDelete?.name}</strong>. Progress and task details cannot be recovered. The employee record is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => recordToDelete && deleteRecordMutation.mutate(recordToDelete.id)}
              disabled={deleteRecordMutation.isPending}
            >
              {deleteRecordMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Deleting…</> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Task Detail Dialog ── */}
      <TaskDetailDialog
        open={taskDetailState.open}
        task={taskDetailState.task}
        onClose={() => setTaskDetailState({ open: false, task: null })}
        onSave={handleSaveTaskDetails}
        isSaving={updateTaskDetailsMutation.isPending}
        stockItems={stockItems as any[]}
      />
    </Layout>
  );
}
