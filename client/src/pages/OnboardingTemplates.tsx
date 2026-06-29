import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  ListChecks,
  GripVertical,
  X,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface TemplateSectionAssignee { employeeId: string; firstName: string; lastName: string; avatar: string | null; }
interface TemplateTask { id: string; sectionId: string; taskName: string; sortOrder: number; requiresAssignment?: boolean; }
interface TemplateSection { id: string; templateId: string; name: string; description: string | null; sortOrder: number; assignees?: TemplateSectionAssignee[]; tasks: TemplateTask[]; }
interface OnboardingTemplate { id: string; name: string; description: string | null; department: string | null; isActive: boolean; sections?: TemplateSection[]; }
interface EmployeeOption { id: string; first_name: string; last_name: string; avatar?: string | null; }

function getInitials(fn: string, ln: string) { return `${fn[0] ?? ""}${ln[0] ?? ""}`.toUpperCase(); }

// ── helpers ──────────────────────────────────────────────────────────────────
async function apiFetch<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await apiRequest(method, url, body);
  const text = await res.text();
  // 204 No Content (DELETE etc.) or empty body — avoid JSON.parse
  if (!text || res.status === 204) return undefined as T;
  try {
    const json = JSON.parse(text);
    return (json?.data ?? json) as T;
  } catch {
    return undefined as T;
  }
}

export default function OnboardingTemplates() {
  const qc = useQueryClient();

  // ── list ──────────────────────────────────────────────────────────────────
  const { data: templates = [], isLoading } = useQuery<OnboardingTemplate[]>({
    queryKey: ["/api/onboarding-templates"],
    queryFn: () => apiFetch("GET", "/api/onboarding-templates"),
  });

  // ── selected template detail ──────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: detail } = useQuery<OnboardingTemplate>({
    queryKey: ["/api/onboarding-templates", selectedId],
    queryFn: () => apiFetch("GET", `/api/onboarding-templates/${selectedId}`),
    enabled: !!selectedId,
  });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (id: string) => setExpandedSections(p => ({ ...p, [id]: !p[id] }));

  // ── template create/edit modal ────────────────────────────────────────────
  const [tplModal, setTplModal] = useState<{ open: boolean; editing: OnboardingTemplate | null }>({ open: false, editing: null });
  const [tplForm, setTplForm] = useState({ name: "", description: "", department: "" });

  function openCreateTemplate() {
    setTplForm({ name: "", description: "", department: "" });
    setTplModal({ open: true, editing: null });
  }
  function openEditTemplate(t: OnboardingTemplate) {
    setTplForm({ name: t.name, description: t.description ?? "", department: t.department ?? "" });
    setTplModal({ open: true, editing: t });
  }

  const saveTplMutation = useMutation({
    mutationFn: async () => {
      const body = { name: tplForm.name.trim(), description: tplForm.description.trim() || undefined, department: tplForm.department.trim() || undefined };
      if (tplModal.editing) return apiFetch("PUT", `/api/onboarding-templates/${tplModal.editing.id}`, body);
      return apiFetch("POST", "/api/onboarding-templates", body);
    },
    onSuccess: (saved: any) => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding-templates"] });
      toast.success(tplModal.editing ? "Template updated" : "Template created");
      setTplModal({ open: false, editing: null });
      setSelectedId(saved.id ?? selectedId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── delete template ───────────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const deleteTplMutation = useMutation({
    mutationFn: (id: string) => apiFetch("DELETE", `/api/onboarding-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding-templates"] });
      if (selectedId === deleteConfirm) setSelectedId(null);
      toast.success("Template deleted");
      setDeleteConfirm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── section create/edit ───────────────────────────────────────────────────
  const [secModal, setSecModal] = useState<{ open: boolean; editing: TemplateSection | null }>({ open: false, editing: null });
  const [secForm, setSecForm] = useState({ name: "", description: "" });

  function openAddSection() {
    setSecForm({ name: "", description: "" });
    setSecModal({ open: true, editing: null });
  }
  function openEditSection(s: TemplateSection) {
    setSecForm({ name: s.name, description: s.description ?? "" });
    setSecModal({ open: true, editing: s });
  }

  const saveSecMutation = useMutation({
    mutationFn: async () => {
      const body = { name: secForm.name.trim(), description: secForm.description.trim() || undefined };
      if (secModal.editing) return apiFetch("PUT", `/api/onboarding-templates/${selectedId}/sections/${secModal.editing.id}`, body);
      return apiFetch("POST", `/api/onboarding-templates/${selectedId}/sections`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding-templates", selectedId] });
      toast.success(secModal.editing ? "Section updated" : "Section added");
      setSecModal({ open: false, editing: null });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSecMutation = useMutation({
    mutationFn: ({ sectionId }: { sectionId: string }) =>
      apiFetch("DELETE", `/api/onboarding-templates/${selectedId}/sections/${sectionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding-templates", selectedId] });
      toast.success("Section removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── task create/edit ──────────────────────────────────────────────────────
  const [taskModal, setTaskModal] = useState<{ open: boolean; sectionId: string | null; editing: TemplateTask | null }>({ open: false, sectionId: null, editing: null });
  const [taskForm, setTaskForm] = useState({ taskName: "", requiresAssignment: false });

  function openAddTask(sectionId: string) {
    setTaskForm({ taskName: "", requiresAssignment: false });
    setTaskModal({ open: true, sectionId, editing: null });
  }
  function openEditTask(sectionId: string, t: TemplateTask) {
    setTaskForm({ taskName: t.taskName, requiresAssignment: t.requiresAssignment !== false });
    setTaskModal({ open: true, sectionId, editing: t });
  }

  const saveTaskMutation = useMutation({
    mutationFn: async () => {
      const { sectionId, editing } = taskModal;
      const body = { taskName: taskForm.taskName.trim(), requiresAssignment: taskForm.requiresAssignment };
      if (editing) return apiFetch("PUT", `/api/onboarding-templates/${selectedId}/sections/${sectionId}/tasks/${editing.id}`, body);
      return apiFetch("POST", `/api/onboarding-templates/${selectedId}/sections/${sectionId}/tasks`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding-templates", selectedId] });
      toast.success(taskModal.editing ? "Task updated" : "Task added");
      setTaskModal({ open: false, sectionId: null, editing: null });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: ({ sectionId, taskId }: { sectionId: string; taskId: string }) =>
      apiFetch("DELETE", `/api/onboarding-templates/${selectedId}/sections/${sectionId}/tasks/${taskId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding-templates", selectedId] });
      toast.success("Task removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── section default assignees ─────────────────────────────────────────────
  const [assigneeSearch, setAssigneeSearch] = useState<{ sectionId: string | null; query: string }>({ sectionId: null, query: "" });
  const { data: assigneeResults = [] } = useQuery<EmployeeOption[]>({
    queryKey: ["/api/employees", "tpl-assignee", assigneeSearch.query],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/employees?q=${encodeURIComponent(assigneeSearch.query)}&limit=10&orgChart=1`);
      const j = await res.json();
      return Array.isArray(j?.data) ? j.data : [];
    },
    enabled: !!assigneeSearch.sectionId && assigneeSearch.query.trim().length >= 1,
  });

  const addAssigneeMutation = useMutation({
    mutationFn: ({ sectionId, employeeId }: { sectionId: string; employeeId: string }) =>
      apiFetch("POST", `/api/onboarding-templates/${selectedId}/sections/${sectionId}/assignees`, { employeeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding-templates", selectedId] });
      setAssigneeSearch({ sectionId: null, query: "" });
      toast.success("Default assignee added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAssigneeMutation = useMutation({
    mutationFn: ({ sectionId, employeeId }: { sectionId: string; employeeId: string }) =>
      apiFetch("DELETE", `/api/onboarding-templates/${selectedId}/sections/${sectionId}/assignees/${employeeId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/onboarding-templates", selectedId] });
      toast.success("Default assignee removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sections: TemplateSection[] = detail?.sections ?? [];

  return (
    <Layout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* ── Left sidebar: template list ── */}
        <div className="w-80 border-r bg-white flex flex-col">
          <div className="p-4 border-b flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Link href="/settings">
                <Button variant="ghost" size="sm" className="text-muted-foreground -ml-1">
                  <ChevronLeft className="h-4 w-4 mr-0.5" />
                  Settings
                </Button>
              </Link>
              <Button size="sm" onClick={openCreateTemplate}><Plus className="h-4 w-4 mr-1" />New</Button>
            </div>
            <h1 className="font-semibold text-gray-900">Onboarding Templates</h1>
            <p className="text-xs text-gray-500">Shared across all regions — changes apply company-wide.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isLoading && <p className="text-sm text-gray-500 p-2">Loading…</p>}
            {!isLoading && templates.length === 0 && (
              <p className="text-sm text-gray-500 p-2 text-center">No templates yet. Create one to get started.</p>
            )}
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left rounded-lg px-3 py-2.5 border transition-colors ${selectedId === t.id ? "bg-blue-50 border-blue-200" : "bg-white border-transparent hover:bg-gray-50 hover:border-gray-200"}`}
              >
                <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                {t.department && <p className="text-xs text-gray-500 mt-0.5">{t.department}</p>}
              </button>
            ))}
          </div>
        </div>

        {/* ── Right panel: template detail ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ListChecks className="h-12 w-12 mb-3" />
              <p className="text-base font-medium">Select a template to view or edit</p>
            </div>
          ) : !detail ? (
            <div className="p-6 text-gray-400 text-sm">Loading…</div>
          ) : (
            <div className="p-6 max-w-3xl">
              {/* Template header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{detail.name}</h2>
                  {detail.department && <Badge variant="secondary" className="mt-1">{detail.department}</Badge>}
                  {detail.description && <p className="text-sm text-gray-500 mt-1">{detail.description}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0 ml-4">
                  <Button size="sm" variant="outline" onClick={() => openEditTemplate(detail)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => setDeleteConfirm(detail.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                  </Button>
                </div>
              </div>

              {/* Sections */}
              <div className="space-y-3">
                {sections.map((s, idx) => {
                  const expanded = expandedSections[s.id] !== false;
                  return (
                    <Card key={s.id} className="shadow-sm">
                      <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => toggleSection(s.id)}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex-shrink-0">{idx + 1}</span>
                            <CardTitle className="text-sm font-medium truncate">{s.name}</CardTitle>
                            {s.description && <span className="text-xs text-gray-400 truncate hidden sm:block">— {s.description}</span>}
                          </div>
                          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                            <Badge variant="outline" className="text-xs">{s.tasks.length} task{s.tasks.length !== 1 ? "s" : ""}</Badge>
                            {(s.assignees?.length ?? 0) > 0 && (
                              <Badge variant="outline" className="text-xs">{s.assignees!.length} assignee{s.assignees!.length !== 1 ? "s" : ""}</Badge>
                            )}
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={e => { e.stopPropagation(); openEditSection(s); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={e => { e.stopPropagation(); deleteSecMutation.mutate({ sectionId: s.id }); }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                            {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                          </div>
                        </div>
                      </CardHeader>
                      {expanded && (
                        <CardContent className="pt-0 pb-3 px-4">
                          {/* Default assignees */}
                          <div className="mb-4 pb-3 border-b">
                            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                              <UserPlus className="h-3.5 w-3.5" />
                              Default assignees
                              <span className="font-normal text-gray-400">— auto-added when onboarding is initiated</span>
                            </p>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {(s.assignees ?? []).length === 0 && (
                                <p className="text-xs text-gray-400 italic">No default assignees</p>
                              )}
                              {(s.assignees ?? []).map(a => (
                                <div key={a.employeeId} className="flex items-center gap-1.5 pl-1 pr-1.5 py-0.5 rounded-full bg-gray-100 text-xs">
                                  <Avatar className="h-5 w-5">
                                    <AvatarImage src={a.avatar ?? undefined} />
                                    <AvatarFallback className="text-[8px]">{getInitials(a.firstName, a.lastName)}</AvatarFallback>
                                  </Avatar>
                                  <span>{a.firstName} {a.lastName}</span>
                                  <button
                                    type="button"
                                    className="text-gray-400 hover:text-red-500 ml-0.5"
                                    onClick={() => removeAssigneeMutation.mutate({ sectionId: s.id, employeeId: a.employeeId })}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <div className="relative max-w-xs">
                              <Input
                                className="h-8 text-xs"
                                placeholder="Search employee to add…"
                                value={assigneeSearch.sectionId === s.id ? assigneeSearch.query : ""}
                                onChange={e => setAssigneeSearch({ sectionId: s.id, query: e.target.value })}
                                onFocus={() => setAssigneeSearch(p => ({ ...p, sectionId: s.id }))}
                              />
                              {assigneeSearch.sectionId === s.id && assigneeSearch.query.length > 0 && assigneeResults.length > 0 && (
                                <div className="absolute z-20 top-full mt-1 w-full bg-white border rounded-md shadow-lg max-h-40 overflow-y-auto">
                                  {assigneeResults
                                    .filter(emp => !(s.assignees ?? []).some(a => a.employeeId === emp.id))
                                    .map(emp => (
                                      <button
                                        key={emp.id}
                                        type="button"
                                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                                        onClick={() => addAssigneeMutation.mutate({ sectionId: s.id, employeeId: emp.id })}
                                      >
                                        <Avatar className="h-6 w-6">
                                          <AvatarImage src={emp.avatar ?? undefined} />
                                          <AvatarFallback className="text-[10px]">{getInitials(emp.first_name, emp.last_name)}</AvatarFallback>
                                        </Avatar>
                                        <span>{emp.first_name} {emp.last_name}</span>
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1 mb-2">
                            {s.tasks.length === 0 && <p className="text-xs text-gray-400 italic py-1">No tasks yet</p>}
                            {s.tasks.map(t => (
                              <div key={t.id} className="flex items-center gap-2 group py-1 px-2 rounded hover:bg-gray-50">
                                <GripVertical className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                                <span className="text-sm text-gray-700 flex-1">{t.taskName}</span>
                                {t.requiresAssignment !== false && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Required</span>
                                )}
                                <div className="hidden group-hover:flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditTask(s.id, t)}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => deleteTaskMutation.mutate({ sectionId: s.id, taskId: t.id })}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-700 h-7 px-2" onClick={() => openAddTask(s.id)}>
                            <Plus className="h-3.5 w-3.5 mr-1" />Add task
                          </Button>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
                <Button variant="outline" className="w-full border-dashed" onClick={openAddSection}>
                  <Plus className="h-4 w-4 mr-1" />Add section
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Template modal ── */}
      <Dialog open={tplModal.open} onOpenChange={o => setTplModal(p => ({ ...p, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tplModal.editing ? "Edit Template" : "New Onboarding Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name *</Label>
              <Input className="mt-1" placeholder="e.g. Finance - Employee Onboarding" value={tplForm.name} onChange={e => setTplForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>Department</Label>
              <Input className="mt-1" placeholder="e.g. Finance, IT, Sales…" value={tplForm.department} onChange={e => setTplForm(p => ({ ...p, department: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea className="mt-1" rows={2} placeholder="Optional description" value={tplForm.description} onChange={e => setTplForm(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTplModal(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button disabled={!tplForm.name.trim() || saveTplMutation.isPending} onClick={() => saveTplMutation.mutate()}>
              {saveTplMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Section modal ── */}
      <Dialog open={secModal.open} onOpenChange={o => setSecModal(p => ({ ...p, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{secModal.editing ? "Edit Section" : "Add Section"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Section Name *</Label>
              <Input className="mt-1" placeholder="e.g. System Access" value={secForm.name} onChange={e => setSecForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea className="mt-1" rows={2} placeholder="Instructions shown to HR during initiation" value={secForm.description} onChange={e => setSecForm(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecModal(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button disabled={!secForm.name.trim() || saveSecMutation.isPending} onClick={() => saveSecMutation.mutate()}>
              {saveSecMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Task modal ── */}
      <Dialog open={taskModal.open} onOpenChange={o => setTaskModal(p => ({ ...p, open: o }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{taskModal.editing ? "Edit Task" : "Add Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Task Name *</Label>
              <Input className="mt-1" placeholder="e.g. Create Microsoft Account" value={taskForm.taskName} onChange={e => setTaskForm(p => ({ ...p, taskName: e.target.value }))} />
              <p className="text-xs text-muted-foreground mt-1.5">
                If the title includes <strong>pseudonym</strong> or <strong>also known as</strong> (or similar), the text saved in assignment details when someone completes this task is copied to the employee profile field &quot;Also known as (pseudonym)&quot;. Turn on &quot;Require assignment&quot; so they must enter that name before completing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="task-requires-assignment"
                checked={taskForm.requiresAssignment}
                onChange={e => setTaskForm(p => ({ ...p, requiresAssignment: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="task-requires-assignment" className="text-sm font-normal cursor-pointer">
                Require assignment/comment before completion
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskModal(p => ({ ...p, open: false }))}>Cancel</Button>
            <Button disabled={!taskForm.taskName.trim() || saveTaskMutation.isPending} onClick={() => saveTaskMutation.mutate()}>
              {saveTaskMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={o => { if (!o) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>This template will be deactivated. Existing onboarding records are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteConfirm && deleteTplMutation.mutate(deleteConfirm)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
