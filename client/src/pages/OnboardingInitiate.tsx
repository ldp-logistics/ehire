import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  ChevronUp,
  ChevronDown,
  Plus,
  X,
  Lock,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TemplateTask { id: string; taskName: string; sortOrder: number; }
interface TemplateSection {
  id: string; name: string; description: string | null; sortOrder: number;
  assignees?: { employeeId: string; firstName: string; lastName: string; avatar?: string | null }[];
  tasks: TemplateTask[];
}
interface OnboardingTemplate { id: string; name: string; description: string | null; department: string | null; sections?: TemplateSection[]; }
interface EmployeeOption { id: string; first_name: string; last_name: string; avatar?: string | null; job_title?: string | null; department?: string | null; }

// Section state as managed in this component
interface InitiateSection {
  templateSectionId: string | null;
  name: string;
  description: string | null;
  sortOrder: number;
  assignees: EmployeeOption[];
  tasks: string[];
  expanded: boolean;
  newTaskDraft: string;
}

// ── helper ────────────────────────────────────────────────────────────────────
async function apiFetch<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await apiRequest(method, url, body);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message ?? json?.error?.message ?? "Request failed");
  return (json?.data ?? json) as T;
}

function getInitials(fn: string, ln: string) { return `${fn[0] ?? ""}${ln[0] ?? ""}`.toUpperCase(); }

function mapTemplateAssignees(assignees: any[] | undefined): EmployeeOption[] {
  return (assignees ?? []).map(a => ({
    id: a.employeeId ?? a.employee_id ?? a.id,
    first_name: a.firstName ?? a.first_name ?? "",
    last_name: a.lastName ?? a.last_name ?? "",
    avatar: a.avatar ?? null,
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function OnboardingInitiate() {
  const params = useParams<{ employeeId: string }>();
  const employeeId = params.employeeId;
  const [, setLocation] = useLocation();

  // templateId comes from ?templateId=xxx
  const templateId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("templateId") ?? ""
    : "";

  // ── Fetch template ─────────────────────────────────────────────────────────
  const { data: template, isLoading: tplLoading } = useQuery<OnboardingTemplate>({
    queryKey: ["/api/onboarding-templates", templateId],
    queryFn: () => apiFetch("GET", `/api/onboarding-templates/${templateId}`),
    enabled: !!templateId,
  });

  // ── Fetch employee info ────────────────────────────────────────────────────
  const { data: employeeRaw } = useQuery<any>({
    queryKey: ["/api/employees", employeeId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/employees/${employeeId}`);
      const j = await res.json();
      return j?.data ?? j;
    },
    enabled: !!employeeId,
  });
  const employeeName = employeeRaw
    ? `${employeeRaw.first_name ?? employeeRaw.firstName ?? ""} ${employeeRaw.last_name ?? employeeRaw.lastName ?? ""}`.trim()
    : "…";

  // ── Sections state ─────────────────────────────────────────────────────────
  const [sections, setSections] = useState<InitiateSection[]>([]);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (template?.sections && !initialised) {
      setSections(
        template.sections.map((s, i) => ({
          templateSectionId: s.id,
          name: s.name,
          description: s.description,
          sortOrder: i,
          assignees: mapTemplateAssignees(s.assignees),
          tasks: s.tasks.map(t => t.taskName),
          expanded: true,
          newTaskDraft: "",
        }))
      );
      setInitialised(true);
    }
  }, [template, initialised]);

  function updateSection(idx: number, patch: Partial<InitiateSection>) {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  // ── Employee search for assignees ──────────────────────────────────────────
  const [assigneeSearch, setAssigneeSearch] = useState<{ sectionIdx: number | null; query: string }>({ sectionIdx: null, query: "" });
  const { data: searchResults = [] } = useQuery<EmployeeOption[]>({
    queryKey: ["/api/employees", "search", assigneeSearch.query],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/employees?q=${encodeURIComponent(assigneeSearch.query)}&limit=10`);
      const j = await res.json();
      return Array.isArray(j?.data) ? j.data : [];
    },
    enabled: assigneeSearch.sectionIdx !== null && assigneeSearch.query.trim().length >= 1,
  });

  function addAssignee(sectionIdx: number, emp: EmployeeOption) {
    setSections(prev => prev.map((s, i) => {
      if (i !== sectionIdx) return s;
      if (s.assignees.some(a => a.id === emp.id)) return s;
      return { ...s, assignees: [...s.assignees, emp] };
    }));
    setAssigneeSearch({ sectionIdx: null, query: "" });
  }

  function removeAssignee(sectionIdx: number, empId: string) {
    setSections(prev => prev.map((s, i) =>
      i === sectionIdx ? { ...s, assignees: s.assignees.filter(a => a.id !== empId) } : s
    ));
  }

  // ── Task management ────────────────────────────────────────────────────────
  function addTask(sectionIdx: number) {
    const draft = sections[sectionIdx]?.newTaskDraft.trim();
    if (!draft) return;
    setSections(prev => prev.map((s, i) =>
      i === sectionIdx ? { ...s, tasks: [...s.tasks, draft], newTaskDraft: "" } : s
    ));
  }

  function removeTask(sectionIdx: number, taskIdx: number) {
    setSections(prev => prev.map((s, i) =>
      i === sectionIdx ? { ...s, tasks: s.tasks.filter((_, ti) => ti !== taskIdx) } : s
    ));
  }

  // ── Initiate ───────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);

  async function handleInitiate() {
    if (!employeeId) { toast.error("No employee selected"); return; }
    if (!sections.length) { toast.error("No sections to initiate with"); return; }
    setSubmitting(true);
    try {
      const body = {
        employeeId,
        templateId: templateId || null,
        sections: sections.map(s => ({
          templateSectionId: s.templateSectionId,
          name: s.name,
          description: s.description,
          sortOrder: s.sortOrder,
          assigneeIds: s.assignees.map(a => a.id),
          tasks: s.tasks,
        })),
      };
      const record = await apiFetch<{ id: string }>("POST", "/api/onboarding/initiate", body);
      toast.success("Onboarding initiated successfully!");
      setLocation(`/onboarding?recordId=${record.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to initiate onboarding");
    } finally {
      setSubmitting(false);
    }
  }

  if (!templateId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">No template selected. <button className="text-blue-600 underline" onClick={() => setLocation("/employees")}>Go back</button></p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top bar ── */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <button onClick={() => setLocation("/employees")} className="hover:text-gray-700">Employees</button>
          <span className="text-gray-300">/</span>
          <span className="text-gray-700 font-medium">Onboarding</span>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/employees")}>Cancel</Button>
          <Button size="sm" disabled={submitting || sections.length === 0} onClick={handleInitiate}>
            {submitting ? "Initiating…" : "Initiate"}
          </Button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-3xl mx-auto py-8 px-4">
        {/* Employee badge */}
        {employeeRaw && (
          <div className="flex items-center gap-3 mb-6 p-4 bg-white rounded-lg border shadow-sm">
            <Avatar className="h-10 w-10">
              <AvatarImage src={employeeRaw.avatar ?? undefined} />
              <AvatarFallback>{getInitials(employeeRaw.first_name ?? employeeRaw.firstName ?? "?", employeeRaw.last_name ?? employeeRaw.lastName ?? "?")}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-gray-900 text-sm">{employeeName}</p>
              <p className="text-xs text-gray-500">{employeeRaw.job_title ?? employeeRaw.jobTitle ?? ""}{employeeRaw.department ? ` · ${employeeRaw.department}` : ""}</p>
            </div>
            {template && <Badge variant="secondary" className="ml-auto text-xs">{template.name}</Badge>}
          </div>
        )}

        {tplLoading && <p className="text-gray-400 text-sm">Loading template…</p>}

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((section, idx) => (
            <div key={idx} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              {/* Section header */}
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => updateSection(idx, { expanded: !section.expanded })}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold flex-shrink-0">{idx + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{section.name}</h3>
                      <Lock className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                    </div>
                    {section.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{section.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  {/* Assignee avatars */}
                  <div className="flex -space-x-1.5">
                    {section.assignees.slice(0, 4).map(a => (
                      <Avatar key={a.id} className="h-7 w-7 ring-2 ring-white">
                        <AvatarImage src={a.avatar ?? undefined} />
                        <AvatarFallback className="text-[10px]">{getInitials(a.first_name, a.last_name)}</AvatarFallback>
                      </Avatar>
                    ))}
                    {section.assignees.length > 4 && (
                      <div className="h-7 w-7 rounded-full bg-gray-200 ring-2 ring-white flex items-center justify-center text-[10px] font-medium text-gray-600">+{section.assignees.length - 4}</div>
                    )}
                  </div>
                  {section.expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </div>
              </div>

              {section.expanded && (
                <div className="px-5 pb-5 border-t">
                  {/* Assignees */}
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Assignees</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {section.assignees.map(a => (
                        <div key={a.id} className="flex items-center gap-1.5 bg-gray-100 rounded-full pl-1 pr-2 py-0.5">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={a.avatar ?? undefined} />
                            <AvatarFallback className="text-[9px]">{getInitials(a.first_name, a.last_name)}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-gray-700">{a.first_name} {a.last_name}</span>
                          <button onClick={() => removeAssignee(idx, a.id)} className="text-gray-400 hover:text-gray-600 ml-0.5">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {/* Search assignees */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <Input
                        className="pl-8 h-8 text-xs"
                        placeholder="Add assignee — search by name…"
                        value={assigneeSearch.sectionIdx === idx ? assigneeSearch.query : ""}
                        onFocus={() => setAssigneeSearch(p => ({ ...p, sectionIdx: idx }))}
                        onChange={e => setAssigneeSearch({ sectionIdx: idx, query: e.target.value })}
                      />
                      {assigneeSearch.sectionIdx === idx && assigneeSearch.query.length > 0 && searchResults.length > 0 && (
                        <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                          {searchResults.map(emp => (
                            <button
                              key={emp.id}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 text-sm"
                              onMouseDown={(e) => { e.preventDefault(); addAssignee(idx, emp); }}
                            >
                              <Avatar className="h-6 w-6 flex-shrink-0">
                                <AvatarImage src={emp.avatar ?? undefined} />
                                <AvatarFallback className="text-[9px]">{getInitials(emp.first_name, emp.last_name)}</AvatarFallback>
                              </Avatar>
                              <span className="text-gray-900">{emp.first_name} {emp.last_name}</span>
                              {emp.job_title && <span className="text-gray-400 text-xs ml-auto">{emp.job_title}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tasks */}
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tasks</p>
                    <div className="space-y-1">
                      {section.tasks.map((task, ti) => (
                        <div key={ti} className="flex items-center gap-2 group py-1 px-2 rounded hover:bg-gray-50">
                          <div className="h-4 w-4 rounded border border-gray-300 flex-shrink-0" />
                          <span className="text-sm text-gray-700 flex-1">{task}</span>
                          <button
                            className="hidden group-hover:block text-gray-400 hover:text-red-500"
                            onClick={() => removeTask(idx, ti)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    {/* Add task inline */}
                    <div className="flex gap-2 mt-2">
                      <Input
                        className="h-8 text-xs flex-1"
                        placeholder="+ Add task"
                        value={section.newTaskDraft}
                        onChange={e => updateSection(idx, { newTaskDraft: e.target.value })}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTask(idx); } }}
                      />
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-blue-600" onClick={() => addTask(idx)}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Initiate CTA at bottom */}
        {sections.length > 0 && (
          <div className="mt-8 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setLocation("/employees")}>Cancel</Button>
            <Button disabled={submitting} onClick={handleInitiate}>
              {submitting ? "Initiating…" : "Initiate Onboarding"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
