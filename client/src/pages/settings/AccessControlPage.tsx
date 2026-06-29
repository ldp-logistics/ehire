/**
 * Access Control — single hub for User Access + Multi-Region + Role Catalog.
 * Replaces the two separate settings pages with one premium, user-friendly interface.
 */
import Layout from "@/components/layout/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth, REGION_LABELS, type RegionCode } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  Search, Plus, Shield,   Globe, ChevronRight, X, Users, Building2,
  Pencil, Crown, UserCheck, AlertTriangle, MapPin,
  ArrowLeft, Briefcase, UserPlus, ShieldCheck, ChevronsUpDown,
  KeyRound, Trash2, ChevronDown, Info, CheckCircle2, Lock,
  Mail, Eye, EyeOff, ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type UserRow = {
  id: string;
  email: string;
  role: string;
  additionalRoles: string[];
  employeeId: string | null;
  isActive: boolean;
  allowedModules: string[];
  employeeName: string | null;
  jobTitle: string | null;
  department: string | null;
  branchId?: string | null;
  regionCode?: string | null;
  isSuperRegionAdmin?: boolean;
};

type EmployeeOption = {
  id: string; first_name: string; last_name: string;
  job_title: string; department: string; work_email?: string;
};

type BranchOption = { id: string; name: string; isActive?: boolean; regionCode?: string | null };

type RegionSummary = {
  code: RegionCode; label: string; isSuperRegion: boolean;
  branchCount: number; employeeCount: number; userCount: number;
};
type BranchRow = { id: string; name: string; regionCode: string | null; isActive: boolean; employeeCount: number };
type RegionOverview = {
  superRegionCode: RegionCode; regions: RegionSummary[]; branches: BranchRow[];
  superAdmins: { id: string; email: string; name: string | null }[];
  unassignedBranchCount: number; usersWithoutBranchCount: number; employeesWithoutRegionCount: number;
};
type UnassignedEmployee = {
  id: string; employeeId: string | null; name: string;
  jobTitle: string | null; department: string | null; branchId: string | null; branchName: string | null;
};
type RoleCatalogRow = {
  id: string; title: string; tagline: string; description: string;
  activeUserCount: number; userCount: number; orgDerived?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const ASSIGNABLE_ROLES = [
  "admin", "hr", "limited_hr", "it",
  "recruiter", "hiring_manager", "onboarding_specialist", "limited_recruiter",
  "employee",
] as const;

const SCOPE_GRANTS_UI = new Set(["global_hr", "global_it", "global_recruiter"]);
const PRIVILEGE_GRANTS_UI = new Set([
  "admin", "hr", "limited_hr", "it",
  "recruiter", "hiring_manager", "onboarding_specialist", "limited_recruiter",
]);

const PRIV_RANK: Record<string, number> = {
  admin: 10, hr: 8, limited_hr: 7, it: 6,
  recruiter: 5, hiring_manager: 4, onboarding_specialist: 4, limited_recruiter: 3, employee: 1,
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", hr: "HR", limited_hr: "Limited HR", it: "IT",
  recruiter: "Recruiter", hiring_manager: "Hiring Manager",
  onboarding_specialist: "Onboarding Specialist", limited_recruiter: "Limited Recruiter",
  manager: "Manager", employee: "Employee",
  global_hr: "Global HR", global_it: "Global IT", global_recruiter: "Global Recruiter",
};

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-violet-100 text-violet-700 border-violet-200",
  hr: "bg-emerald-100 text-emerald-700 border-emerald-200",
  limited_hr: "bg-emerald-50 text-emerald-600 border-emerald-200",
  recruiter: "bg-blue-100 text-blue-700 border-blue-200",
  limited_recruiter: "bg-blue-50 text-blue-600 border-blue-200",
  it: "bg-orange-100 text-orange-700 border-orange-200",
  hiring_manager: "bg-cyan-100 text-cyan-700 border-cyan-200",
  onboarding_specialist: "bg-pink-100 text-pink-700 border-pink-200",
  manager: "bg-slate-100 text-slate-600 border-slate-200",
  employee: "bg-slate-50 text-slate-400 border-slate-200",
  global_hr: "bg-teal-100 text-teal-700 border-teal-200",
  global_it: "bg-amber-100 text-amber-700 border-amber-200",
  global_recruiter: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

const FLAGS: Record<string, string> = { PK: "🇵🇰", US: "🇺🇸", "IN-N": "🇮🇳", "IN-S": "🇮🇳" };

const MODULE_GROUPS = [
  { title: "Overview", modules: [{ key: "dashboard", label: "Dashboard" }, { key: "news", label: "Company Feed" }, { key: "tasks", label: "Tasks" }] },
  { title: "People", modules: [{ key: "employees", label: "Employees" }, { key: "my-teams", label: "My Teams" }, { key: "recruitment", label: "Recruitment" }, { key: "onboarding", label: "Onboarding" }, { key: "offboarding", label: "Offboarding" }] },
  { title: "Operations", modules: [{ key: "timesheets", label: "Timesheets" }, { key: "leave", label: "Leave" }, { key: "assets", label: "Assets" }, { key: "it-support", label: "IT Support" }] },
  { title: "Finance", modules: [{ key: "payroll", label: "Payroll" }, { key: "loans", label: "Loans" }, { key: "expenses", label: "Expenses" }, { key: "benefits", label: "Benefits" }] },
];

const REGION_ORDER: RegionCode[] = ["PK", "US", "IN-N", "IN-S"];

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────
function getDisplayName(u: Pick<UserRow, "employeeName" | "email">): string {
  if (u.employeeName?.trim()) return u.employeeName.trim();
  return u.email.split("@")[0] ?? u.email;
}

function getInitials(u: Pick<UserRow, "employeeName" | "email">): string {
  const name = u.employeeName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return u.email.slice(0, 2).toUpperCase();
}

function avatarHue(id: string): string {
  const colors = [
    "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
    "bg-pink-500", "bg-cyan-500", "bg-indigo-500", "bg-amber-500",
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length]!;
}

function getAllRoles(u: UserRow): string[] {
  const set = new Set<string>();
  if (u.role && PRIVILEGE_GRANTS_UI.has(u.role)) set.add(u.role);
  for (const r of u.additionalRoles ?? []) {
    if (PRIVILEGE_GRANTS_UI.has(r) || SCOPE_GRANTS_UI.has(r)) set.add(r);
  }
  if (set.size === 0) set.add("employee");
  return Array.from(set).sort((a, b) => (PRIV_RANK[b] ?? 0) - (PRIV_RANK[a] ?? 0));
}

function getPrimary(u: UserRow): string {
  return getAllRoles(u)[0] ?? "employee";
}

function splitForUi(u: UserRow): { primary: string; additional: string[] } {
  const all = getAllRoles(u);
  return { primary: all[0] ?? "employee", additional: all.slice(1) };
}

function mergePrimaryChange(prevPrimary: string, newPrimary: string, prevAdditional: string[]): string[] {
  const set = new Set(prevAdditional.filter((r) => r !== "employee" && r !== "manager"));
  if (PRIVILEGE_GRANTS_UI.has(prevPrimary) && prevPrimary !== newPrimary) set.add(prevPrimary);
  set.delete(newPrimary);
  return Array.from(set);
}

function userHasGrant(u: UserRow, grant: string): boolean {
  return u.role === grant || (u.additionalRoles ?? []).includes(grant);
}

function isPkAutoSuper(u: UserRow): boolean {
  return userHasGrant(u, "admin") && u.regionCode === "PK";
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared mini components
// ─────────────────────────────────────────────────────────────────────────────
function RoleBadge({ role, sm }: { role: string; sm?: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border font-medium whitespace-nowrap",
      sm ? "text-[10px] px-1.5 py-0 h-[18px]" : "text-[11px] px-2 py-0.5",
      ROLE_BADGE[role] ?? "bg-slate-100 text-slate-600 border-slate-200",
    )}>{ROLE_LABELS[role] ?? role}</span>
  );
}

function UserAvatar({ user, size = "md" }: { user: Pick<UserRow, "id" | "employeeName" | "email" | "employeeId">; size?: "sm" | "md" | "lg" }) {
  const szCls = size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs";
  return (
    <Avatar className={cn(szCls, "shrink-0")}>
      {user.employeeId && (
        <AvatarImage src={`/api/employees/${user.employeeId}/avatar`} />
      )}
      <AvatarFallback className={cn("text-white font-semibold", avatarHue(user.id), szCls)}>
        {getInitials(user)}
      </AvatarFallback>
    </Avatar>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-px flex-1 bg-border/60" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2">{children}</span>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  );
}

function HelpText({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground mt-1">
      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-400" />
      <span>{children}</span>
    </p>
  );
}

function SearchableUserPicker({
  users, onSelect, placeholder, disabled,
}: {
  users: UserRow[]; onSelect: (id: string) => void; placeholder: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between h-9 text-sm font-normal" disabled={disabled}>
          <span className="truncate text-muted-foreground">{placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name or email…" />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>
            <CommandGroup>
              {users.map((u) => (
                <CommandItem key={u.id} value={`${u.email} ${u.employeeName ?? ""}`} onSelect={() => { onSelect(u.id); setOpen(false); }}>
                  <div className="flex flex-col min-w-0 w-full">
                    <span className="text-sm font-medium truncate">{getDisplayName(u)}</span>
                    <span className="text-xs text-muted-foreground truncate">{u.email} · {ROLE_LABELS[u.role] ?? u.role}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SearchableEmployeePicker({
  employees,
  value,
  onChange,
  disabled,
  placeholder = "Not linked to an employee",
}: {
  employees: EmployeeOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = employees.find((e) => e.id === value);
  const displayLabel = selected
    ? `${selected.first_name} ${selected.last_name}${selected.job_title ? ` · ${selected.job_title}` : ""}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between h-10 text-sm font-normal"
        >
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name, title, or department…" />
          <CommandList>
            <CommandEmpty>No employees found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__ not linked employee"
                onSelect={() => { onChange(""); setOpen(false); }}
              >
                <span className={cn(!value && "font-medium")}>Not linked to an employee</span>
              </CommandItem>
              {employees.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.first_name} ${e.last_name} ${e.job_title ?? ""} ${e.department ?? ""} ${e.work_email ?? ""}`}
                  onSelect={() => { onChange(e.id); setOpen(false); }}
                >
                  <span className="truncate">
                    {e.first_name} {e.last_name}{e.job_title ? ` · ${e.job_title}` : ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add User Drawer
// ─────────────────────────────────────────────────────────────────────────────
function AddUserDrawer({
  onClose,
  onSave,
  saving,
  employees,
  branches,
  isSuperViewer,
  userRegion,
  defaultRole,
}: {
  onClose: () => void;
  onSave: (data: { email: string; password: string; role: string; employeeId: string | null; branchId: string | null; authProvider: "local" | "microsoft" }) => void;
  saving: boolean;
  employees: EmployeeOption[];
  branches: BranchOption[];
  isSuperViewer: boolean;
  userRegion?: string | null;
  defaultRole?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState(defaultRole && defaultRole !== "employee" ? defaultRole : "employee");
  const [employeeId, setEmployeeId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [useMicrosoft, setUseMicrosoft] = useState(false);

  const selectableBranches = isSuperViewer ? branches : branches.filter((b) => b.regionCode === userRegion);
  const canSubmit = !!email && (useMicrosoft || password.length >= 8);

  useEffect(() => {
    if (employeeId) {
      const emp = employees.find((e) => e.id === employeeId);
      if (emp?.work_email) setEmail(emp.work_email);
    }
  }, [employeeId]);

  return (
    <DrawerShell title="Add New User" subtitle="Create a login account for a team member" onClose={onClose}>
      <div className="px-6 py-5 space-y-6">
        <SectionLabel>Who is this person?</SectionLabel>

        <div className="space-y-2">
          <Label>Link to Employee <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <SearchableEmployeePicker
            employees={employees}
            value={employeeId}
            onChange={setEmployeeId}
          />
          <HelpText>Linking lets the system show the employee's profile, name, and avatar alongside their login.</HelpText>
        </div>

        <div className="space-y-2">
          <Label>Email Address <span className="text-red-400">*</span></Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" className="h-10" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Password <span className="text-red-400">*</span></Label>
            {employeeId && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <Checkbox checked={useMicrosoft} onCheckedChange={(v) => setUseMicrosoft(!!v)} className="h-3.5 w-3.5" />
                Use Microsoft sign-in instead
              </label>
            )}
          </div>
          {!useMicrosoft ? (
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="h-10 pr-10"
              />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPw((v) => !v)}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
              <Mail className="h-4 w-4 shrink-0" />
              Employee will sign in with their Microsoft/Outlook account. No password needed.
            </div>
          )}
        </div>

        <SectionLabel>What can they do?</SectionLabel>

        <div className="space-y-2">
          <Label>Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_ROLES.filter((r) => r !== "employee" && !SCOPE_GRANTS_UI.has(r)).map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
              <SelectItem value="employee">Employee (view-only baseline)</SelectItem>
            </SelectContent>
          </Select>
          <HelpText>You can add more roles after the account is created.</HelpText>
        </div>

        <SectionLabel>Which region?</SectionLabel>

        <div className="space-y-2">
          <Label>Office / Branch</Label>
          <Select value={branchId || "__none__"} onValueChange={(v) => setBranchId(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-10"><SelectValue placeholder="Select branch" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                {employeeId ? "Inherit from linked employee's branch" : "No region (unassigned)"}
              </SelectItem>
              {selectableBranches.filter((b) => b.isActive !== false).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {FLAGS[b.regionCode ?? ""] ?? "📍"} {b.name}
                  {b.regionCode ? ` · ${REGION_LABELS[b.regionCode as RegionCode] ?? b.regionCode}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <HelpText>The branch determines which region's data this person can access.</HelpText>
        </div>
      </div>

      <DrawerFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button disabled={!canSubmit || saving} onClick={() => onSave({
          email: email.trim(), password, role,
          employeeId: employeeId || null, branchId: branchId || null,
          authProvider: useMicrosoft ? "microsoft" : "local",
        })}>
          {saving ? "Creating…" : "Create Account"}
        </Button>
      </DrawerFooter>
    </DrawerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit User Drawer — full capabilities
// ─────────────────────────────────────────────────────────────────────────────
function EditUserDrawer({
  user: u, onClose, onSave, saving, employees, branches,
  canManageSuper, onToggleSuper, superPending, onDeleteRequest, currentUserId,
}: {
  user: UserRow; onClose: () => void;
  onSave: (p: { role: string; additionalRoles: string[]; employeeId: string | null; branchId: string | null; isActive: boolean; allowedModules: string[] }) => void;
  saving: boolean; employees: EmployeeOption[]; branches: BranchOption[];
  canManageSuper: boolean; onToggleSuper: (id: string, grant: boolean) => void;
  superPending: boolean; onDeleteRequest: () => void; currentUserId?: string | null;
}) {
  const { primary, additional } = splitForUi(u);
  const [editRole, setEditRole] = useState(primary);
  const [editAdditional, setEditAdditional] = useState<string[]>(additional);
  const [editEmployee, setEditEmployee] = useState(u.employeeId ?? "");
  const [editBranch, setEditBranch] = useState(u.branchId ?? "");
  const [editActive, setEditActive] = useState(u.isActive);
  const [useRoleBased, setUseRoleBased] = useState((u.allowedModules ?? []).length === 0);
  const [editModules, setEditModules] = useState<string[]>(u.allowedModules ?? []);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const { primary: p, additional: a } = splitForUi(u);
    setEditRole(p); setEditAdditional(a);
    setEditEmployee(u.employeeId ?? ""); setEditBranch(u.branchId ?? "");
    setEditActive(u.isActive);
    const mods = u.allowedModules ?? [];
    setEditModules(mods); setUseRoleBased(mods.length === 0);
  }, [u.id]);

  const allSelected = new Set([editRole, ...editAdditional]);
  const toggleAdditional = (r: string, checked: boolean) =>
    setEditAdditional((p) => checked ? [...p, r] : p.filter((x) => x !== r));

  const handleSave = () => onSave({
    role: editRole,
    additionalRoles: editAdditional.filter((r) => r !== editRole),
    employeeId: editEmployee || null,
    branchId: editBranch || null,
    isActive: editActive,
    allowedModules: useRoleBased ? [] : editModules,
  });

  const isAdmin = userHasGrant(u, "admin");
  const pkAutoSuper = isPkAutoSuper(u);
  const superActive = u.isSuperRegionAdmin || pkAutoSuper;
  const isSelf = currentUserId === u.id;

  return (
    <DrawerShell
      title="Edit User Access"
      subtitle={`${getDisplayName(u)} · ${u.email}`}
      onClose={onClose}
    >
      <ScrollArea className="flex-1">
        <div className="px-6 py-5 space-y-6">

          {/* Identity card */}
          <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-slate-50/60">
            <UserAvatar user={u} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900 text-sm truncate">{getDisplayName(u)}</p>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              {u.jobTitle && <p className="text-[11px] text-muted-foreground mt-0.5">{u.jobTitle}{u.department ? ` · ${u.department}` : ""}</p>}
            </div>
            <div className="flex flex-col gap-1">
              {getAllRoles(u).slice(0, 2).map((r) => <RoleBadge key={r} role={r} sm />)}
            </div>
          </div>

          <SectionLabel>Primary Role</SectionLabel>
          <div className="space-y-2">
            <Select
              value={editRole}
              onValueChange={(v) => {
                setEditAdditional(mergePrimaryChange(editRole, v, editAdditional));
                setEditRole(v);
              }}
              disabled={saving}
            >
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.filter((r) => r !== "employee" && !SCOPE_GRANTS_UI.has(r)).map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
                <SelectItem value="employee">Employee (baseline access)</SelectItem>
              </SelectContent>
            </Select>
            <HelpText>The primary role determines what this person can do across the system.</HelpText>
          </div>

          <SectionLabel>Additional Roles</SectionLabel>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Stack extra permissions on top of the primary role. Useful when someone has more than one function — for example, an HR person who also recruits.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ASSIGNABLE_ROLES.filter((r) => r !== editRole && r !== "employee" && !SCOPE_GRANTS_UI.has(r)).map((r) => (
                <label key={r} className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer select-none transition-colors",
                  editAdditional.includes(r)
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:bg-slate-50",
                )}>
                  <Checkbox checked={editAdditional.includes(r)} onCheckedChange={(v) => toggleAdditional(r, !!v)} disabled={saving} />
                  <span className="text-xs font-medium">{ROLE_LABELS[r]}</span>
                </label>
              ))}
            </div>
            {/* Cross-region scope grants */}
            {canManageSuper && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Cross-region scope</p>
                <p className="text-xs text-muted-foreground mb-2">Let this person act across all regions for their function.</p>
                <div className="grid grid-cols-1 gap-2">
                  {Array.from(SCOPE_GRANTS_UI).map((r) => (
                    <label key={r} className={cn(
                      "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors",
                      editAdditional.includes(r) ? "border-teal-300 bg-teal-50/60" : "border-border hover:bg-slate-50",
                    )}>
                      <Checkbox checked={editAdditional.includes(r)} onCheckedChange={(v) => toggleAdditional(r, !!v)} disabled={saving} />
                      <Globe className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                      <span className="text-xs font-medium">{ROLE_LABELS[r]}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {allSelected.size > 1 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Array.from(allSelected).map((r) => <RoleBadge key={r} role={r} />)}
              </div>
            )}
          </div>

          <SectionLabel>Link to Employee</SectionLabel>
          <div className="space-y-2">
            <SearchableEmployeePicker
              employees={employees}
              value={editEmployee}
              onChange={setEditEmployee}
              disabled={saving}
            />
            <HelpText>Links this login to a specific employee record for profile, avatar, and name display.</HelpText>
          </div>

          <SectionLabel>Office / Region</SectionLabel>
          <div className="space-y-2">
            <Select value={editBranch || "__none__"} onValueChange={(v) => setEditBranch(v === "__none__" ? "" : v)} disabled={saving}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {editEmployee ? "Use linked employee's branch" : "No region assigned"}
                </SelectItem>
                {branches.filter((b) => b.isActive !== false).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {FLAGS[b.regionCode ?? ""] ?? "📍"} {b.name}
                    {b.regionCode ? ` · ${REGION_LABELS[b.regionCode as RegionCode] ?? b.regionCode}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <HelpText>The branch determines which region's data this person can see and manage.</HelpText>
          </div>

          {/* Super Region Admin */}
          {canManageSuper && isAdmin && (
            <>
              <SectionLabel>Super Region</SectionLabel>
              <div className={cn(
                "flex items-start justify-between gap-4 p-4 rounded-xl border",
                superActive ? "border-amber-300 bg-amber-50/60" : "border-border bg-white",
              )}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    <Crown className={cn("h-4 w-4 shrink-0", superActive ? "text-amber-500" : "text-muted-foreground")} />
                    Super Region Admin
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {pkAutoSuper
                      ? "Automatically granted to Pakistan admins."
                      : "Can view and modify records across all regions. Only grant to senior admins."}
                  </p>
                </div>
                <Switch
                  checked={superActive}
                  disabled={superPending || pkAutoSuper}
                  onCheckedChange={(v) => onToggleSuper(u.id, v)}
                />
              </div>
            </>
          )}

          <SectionLabel>Module Access</SectionLabel>
          <Collapsible open={modulesOpen} onOpenChange={setModulesOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between h-9 text-sm font-normal">
                <span>
                  {useRoleBased ? "Using role-based access (default)" : `Custom: ${editModules.length} module(s) allowed`}
                </span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", modulesOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-4 border-t border-border/60 mt-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox checked={useRoleBased} onCheckedChange={(v) => { setUseRoleBased(!!v); if (v) setEditModules([]); }} />
                <div>
                  <p className="text-sm font-medium">Use role-based access (recommended)</p>
                  <p className="text-xs text-muted-foreground">Show the default modules for their role.</p>
                </div>
              </label>
              {!useRoleBased && (
                <div className="space-y-3 pt-1">
                  <p className="text-xs text-muted-foreground">Only the checked modules will appear in this person's sidebar.</p>
                  {MODULE_GROUPS.map((grp) => (
                    <div key={grp.title}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{grp.title}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {grp.modules.map((m) => (
                          <label key={m.key} className="flex items-center gap-2 text-xs cursor-pointer">
                            <Checkbox
                              checked={editModules.includes(m.key)}
                              onCheckedChange={(v) => setEditModules((p) => v ? [...p, m.key] : p.filter((k) => k !== m.key))}
                            />
                            {m.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <SectionLabel>Account Status</SectionLabel>
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-white">
            <div>
              <p className="text-sm font-semibold text-slate-800">{editActive ? "Account Active" : "Account Disabled"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {editActive ? "This person can sign in and use the system." : "This person cannot sign in until you re-enable the account."}
              </p>
            </div>
            <Switch checked={editActive} onCheckedChange={setEditActive} disabled={saving || isSelf} />
          </div>
          {isSelf && <p className="text-xs text-amber-600 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> You cannot disable your own account.</p>}

          {/* Danger zone */}
          {!isSelf && (
            <div className="pt-2 border-t border-border">
              <button
                type="button"
                className="text-xs text-red-500 hover:text-red-600 hover:underline flex items-center gap-1.5"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Permanently delete this account…
              </button>
            </div>
          )}
        </div>
      </ScrollArea>

      <DrawerFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
      </DrawerFooter>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the login for <strong>{u.email}</strong>. They will no longer be able to sign in. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { setConfirmDelete(false); onDeleteRequest(); }}
            >
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DrawerShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawer shell (reusable)
// ─────────────────────────────────────────────────────────────────────────────
function DrawerShell({
  title, subtitle, onClose, children,
}: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="relative z-10 flex flex-col w-full max-w-[520px] h-full bg-white shadow-2xl border-l border-border animate-in slide-in-from-right duration-200">
        <div className="flex items-start justify-between px-6 py-5 border-b border-border/80 bg-slate-50/80 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-slate-200 transition-colors mt-0.5 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function DrawerFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-4 border-t border-border bg-white flex items-center gap-3 shrink-0">
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Users Tab
// ─────────────────────────────────────────────────────────────────────────────
function UsersTab({
  users, isLoading, employees, branches, currentUserId,
  isSuperViewer, userRegion, canManageSuper,
  updateMutation, superMutation, deleteMutation, registerMutation,
  initialRole,
  onClearInitialRole,
}: {
  users: UserRow[]; isLoading: boolean; employees: EmployeeOption[];
  branches: BranchOption[]; currentUserId?: string | null;
  isSuperViewer: boolean; userRegion?: string | null; canManageSuper: boolean;
  updateMutation: any; superMutation: any; deleteMutation: any; registerMutation: any;
  initialRole?: string;
  onClearInitialRole?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [regionF, setRegionF] = useState("all");
  const [roleF, setRoleF] = useState("all");
  const [statusF, setStatusF] = useState("active");
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  // When another tab requests "add user with role X", open the drawer
  useEffect(() => {
    if (initialRole) { setAddOpen(true); }
  }, [initialRole]);

  // Data integrity warnings
  const linkedEmpIds = users.filter((u) => u.employeeId).map((u) => u.employeeId!);
  const duplicateEmpIds = new Set(linkedEmpIds.filter((eid, i) => linkedEmpIds.indexOf(eid) !== i));
  const linkedSet = new Set(linkedEmpIds);
  const unlinkedEmployees = employees.filter((e) => !linkedSet.has(e.id));

  const regions = useMemo(() => [...new Set(users.map((u) => u.regionCode).filter(Boolean) as string[])], [users]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      if (statusF === "active" && !u.isActive) return false;
      if (statusF === "inactive" && u.isActive) return false;
      if (regionF !== "all" && u.regionCode !== regionF) return false;
      if (roleF !== "all" && !getAllRoles(u).includes(roleF)) return false;
      if (!q) return true;
      return [u.employeeName ?? "", u.email, u.employeeId ?? "", u.jobTitle ?? ""].some((s) => s.toLowerCase().includes(q));
    });
  }, [users, search, regionF, roleF, statusF]);

  const selectableBranches = isSuperViewer ? branches : branches.filter((b) => b.regionCode === userRegion);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, or ID…" className="pl-9 h-9 text-sm bg-white" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <Select value={regionF} onValueChange={setRegionF}>
          <SelectTrigger className="h-9 w-36 text-sm bg-white">
            <Globe className="h-3.5 w-3.5 text-muted-foreground mr-1.5 shrink-0" />
            <SelectValue placeholder="All Regions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Regions</SelectItem>
            {regions.map((r) => <SelectItem key={r} value={r}>{FLAGS[r] ?? "📍"} {REGION_LABELS[r as RegionCode] ?? r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={roleF} onValueChange={setRoleF}>
          <SelectTrigger className="h-9 w-36 text-sm bg-white">
            <Shield className="h-3.5 w-3.5 text-muted-foreground mr-1.5 shrink-0" />
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {[...ASSIGNABLE_ROLES].filter((r) => r !== "employee").map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="h-9 w-28 text-sm bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Disabled</SelectItem>
            <SelectItem value="all">All Status</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="h-9 gap-1.5 ml-auto" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add User
        </Button>
      </div>

      {/* Data integrity warnings */}
      {duplicateEmpIds.size > 0 && (
        <div className="flex gap-2.5 p-3 rounded-lg border border-red-200 bg-red-50/70 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <span>
            <strong>{duplicateEmpIds.size} employee(s)</strong> are linked to more than one user account. Each employee should have exactly one login — please fix these.
          </span>
        </div>
      )}
      {unlinkedEmployees.length > 0 && (
        <div className="flex gap-2.5 p-3 rounded-lg border border-amber-200 bg-amber-50/70 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <span>
            <strong>{unlinkedEmployees.length} employee(s)</strong> have no user account and cannot log in:{" "}
            <span className="opacity-80">
              {unlinkedEmployees.slice(0, 4).map((e) => `${e.first_name} ${e.last_name}`).join(", ")}
              {unlinkedEmployees.length > 4 ? ` and ${unlinkedEmployees.length - 4} more` : ""}
            </span>
            {" "}— use <strong>Add User</strong> above to create their accounts.
          </span>
        </div>
      )}

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {users.length} users
      </p>

      {/* Table */}
      <div className="rounded-xl border border-border/80 bg-white overflow-hidden shadow-sm">
        <div className="hidden md:grid grid-cols-[2fr_0.8fr_1.4fr_1fr_90px_48px] gap-3 items-center px-4 py-2.5 bg-slate-50/80 border-b border-border/60">
          {["User", "Emp. ID", "Roles", "Scope", "Status", ""].map((h, i) => (
            <span key={i} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{h}</span>
          ))}
        </div>

        {isLoading ? (
          <div className="divide-y">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-36" /><Skeleton className="h-2.5 w-48" /></div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2 text-muted-foreground">
            <Users className="h-8 w-8 opacity-25" />
            <p className="text-sm font-medium">No users match your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {filtered.map((u) => {
              const roles = getAllRoles(u);
              const scope = u.isSuperRegionAdmin ? "Global" : (u.regionCode ? (REGION_LABELS[u.regionCode as RegionCode] ?? u.regionCode) : "No region");
              const isGlobal = !!u.isSuperRegionAdmin;
              return (
                <div key={u.id} className="group md:grid md:grid-cols-[2fr_0.8fr_1.4fr_1fr_90px_48px] flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                  {/* User */}
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar user={u} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate leading-tight">{getDisplayName(u)}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </div>
                  {/* Emp ID */}
                  <span className="text-[11px] text-muted-foreground font-mono hidden md:block">
                    {u.employeeId ? `EMP-${u.employeeId.slice(-5).toUpperCase()}` : "—"}
                  </span>
                  {/* Roles */}
                  <div className="flex flex-wrap gap-1">
                    {roles.slice(0, 2).map((r) => <RoleBadge key={r} role={r} sm />)}
                    {roles.length > 2 && <span className="text-[10px] text-muted-foreground self-center">+{roles.length - 2}</span>}
                  </div>
                  {/* Scope */}
                  <div className="hidden md:flex items-center gap-1.5 min-w-0">
                    {isGlobal ? <Globe className="h-3 w-3 text-violet-500 shrink-0" /> : <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />}
                    <span className={cn("text-xs truncate", isGlobal ? "text-violet-700 font-medium" : "text-muted-foreground")}>{scope}</span>
                  </div>
                  {/* Status */}
                  <div className="hidden md:block">
                    {u.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold px-2 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-semibold px-2 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />Disabled
                      </span>
                    )}
                  </div>
                  {/* Edit */}
                  <button
                    onClick={() => setEditUser(u)}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100 md:ml-auto"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drawers / dialogs */}
      {addOpen && (
        <AddUserDrawer
          onClose={() => { setAddOpen(false); onClearInitialRole?.(); }}
          onSave={(data) => registerMutation.mutate(data, { onSuccess: () => { setAddOpen(false); onClearInitialRole?.(); } })}
          saving={registerMutation.isPending}
          employees={employees} branches={branches}
          isSuperViewer={isSuperViewer} userRegion={userRegion}
          defaultRole={initialRole}
        />
      )}

      {editUser && (
        <EditUserDrawer
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={(p) => updateMutation.mutate({ id: editUser.id, ...p }, { onSuccess: () => setEditUser(null) })}
          saving={updateMutation.isPending}
          employees={employees} branches={selectableBranches}
          canManageSuper={canManageSuper}
          onToggleSuper={(id, grant) => superMutation.mutate({ id, grant })}
          superPending={superMutation.isPending}
          onDeleteRequest={() => { setDeleteTarget(editUser); setEditUser(null); }}
          currentUserId={currentUserId}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete the login for <strong>{deleteTarget?.email}</strong>? They will no longer be able to sign in. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Roles Tab
// ─────────────────────────────────────────────────────────────────────────────
function RolesTab({
  users, usersLoading, employees, branches,
  canManageSuper, currentUserId,
  updateMutation, superMutation, deleteMutation, onAddNewWithRole,
}: {
  users: UserRow[]; usersLoading: boolean; employees: EmployeeOption[];
  branches: BranchOption[]; canManageSuper: boolean; currentUserId?: string | null;
  updateMutation: any; superMutation: any; deleteMutation: any;
  onAddNewWithRole?: (roleId: string) => void;
}) {
  const [selectedRole, setSelectedRole] = useState<{ id: string; title: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const { data, isLoading } = useQuery<{
    roles: RoleCatalogRow[];
    otherRoles: Array<{ role: string; userCount: number; activeUserCount: number }>;
  }>({
    queryKey: ["/api/auth/roles/catalog"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/auth/roles/catalog"); return r.json(); },
  });

  const orderedRoles = useMemo(() => {
    if (!data?.roles) return [];
    const rank: Record<string, number> = {
      admin: 100, hr: 95, limited_hr: 90, recruiter: 85, limited_recruiter: 80,
      onboarding_specialist: 75, hiring_manager: 70, it: 65, manager: 60, employee: 10,
    };
    return [...data.roles].sort((a, b) => (rank[b.id] ?? 0) - (rank[a.id] ?? 0));
  }, [data?.roles]);

  if (selectedRole) {
    return (
      <RoleDetailPanel
        roleId={selectedRole.id} roleTitle={selectedRole.title}
        users={users} usersLoading={usersLoading}
        employees={employees} branches={branches}
        canManageSuper={canManageSuper} currentUserId={currentUserId}
        updateMutation={updateMutation} superMutation={superMutation}
        onDeleteRequest={setDeleteTarget}
        onBack={() => setSelectedRole(null)}
        deleteTarget={deleteTarget} deleteMutation={deleteMutation}
        onDeleteClose={() => setDeleteTarget(null)}
        onAddNewWithRole={onAddNewWithRole}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/60 text-sm text-blue-800 flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
        <span>Click any role below to see who has it, assign it to others, or edit individual access. Each role controls what a person can see and do in the system.</span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {orderedRoles.map((r) => {
            const isOrgDerived = r.orgDerived === true;
            return (
              <div
                key={r.id}
                onClick={() => !isOrgDerived && setSelectedRole({ id: r.id, title: r.title })}
                className={cn(
                  "group flex flex-col gap-2 p-4 rounded-xl border-2 bg-white transition-all",
                  isOrgDerived
                    ? "border-border cursor-default opacity-70"
                    : "border-border hover:border-primary/50 hover:shadow-md cursor-pointer hover:-translate-y-0.5",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900">{r.title}</h3>
                      {isOrgDerived && (
                        <span className="text-[10px] font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0">auto</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.tagline}</p>
                  </div>
                  {!isOrgDerived && (
                    <span className="flex items-center justify-center min-w-[28px] h-7 rounded-full bg-slate-100 text-slate-700 text-xs font-bold px-1.5 shrink-0 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      {r.activeUserCount}
                    </span>
                  )}
                </div>
                {!isOrgDerived && (
                  <div className="flex items-center gap-1.5 text-xs text-primary font-medium group-hover:gap-2 transition-all mt-auto">
                    Manage members <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Role Detail Panel
// ─────────────────────────────────────────────────────────────────────────────
function RoleDetailPanel({
  roleId, roleTitle, users, usersLoading, employees, branches,
  canManageSuper, currentUserId, updateMutation, superMutation,
  onDeleteRequest, onBack, deleteTarget, deleteMutation, onDeleteClose,
  onAddNewWithRole,
}: {
  roleId: string; roleTitle: string; users: UserRow[]; usersLoading: boolean;
  employees: EmployeeOption[]; branches: BranchOption[];
  canManageSuper: boolean; currentUserId?: string | null;
  updateMutation: any; superMutation: any;
  onDeleteRequest: (u: UserRow) => void; onBack: () => void;
  deleteTarget: UserRow | null; deleteMutation: any; onDeleteClose: () => void;
  onAddNewWithRole?: (roleId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const inRole = useMemo(() => {
    const q = search.toLowerCase();
    return users
      .filter((u) => roleId === "employee" ? true : userHasGrant(u, roleId))
      .filter((u) => !q || [u.email, u.employeeName ?? ""].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => (a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1) || a.email.localeCompare(b.email));
  }, [users, roleId, search]);

  const assignable = users.filter((u) => u.isActive && !userHasGrant(u, roleId));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Roles
        </button>
        <span className="text-muted-foreground/40">|</span>
        <h2 className="text-base font-bold text-slate-900">{roleTitle}</h2>
        <span className="text-sm text-muted-foreground">{inRole.filter((u) => u.isActive).length} active</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…" className="pl-9 h-9 text-sm bg-white" />
        </div>
      </div>

      <div className="rounded-xl border border-border/80 bg-white overflow-hidden shadow-sm">
        {usersLoading ? (
          <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        ) : inRole.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2 text-muted-foreground">
            <Users className="h-8 w-8 opacity-25" />
            <p className="text-sm">No users with this role yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {inRole.map((u) => (
              <div key={u.id} className="group flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                <UserAvatar user={u} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{getDisplayName(u)}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {getAllRoles(u).slice(0, 2).map((r) => <RoleBadge key={r} role={r} sm />)}
                </div>
                {u.isActive ? (
                  <span className="text-[10px] font-semibold text-emerald-600 hidden sm:inline">Active</span>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-400 hidden sm:inline">Disabled</span>
                )}
                <button
                  onClick={() => setEditUser(u)}
                  className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign existing user / add new */}
      {roleId !== "employee" && (
        <div className="p-4 rounded-xl border border-border bg-white space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Add to this role</p>
            <p className="text-xs text-muted-foreground mt-0.5">Grant <strong>{roleTitle}</strong> to an existing user, or create a brand-new login with this role pre-selected.</p>
          </div>
          <SearchableUserPicker
            users={assignable}
            disabled={assignable.length === 0 || updateMutation.isPending}
            placeholder={assignable.length === 0 ? "Everyone already has this role" : "Assign existing user to this role…"}
            onSelect={(id) => {
              const row = users.find((x) => x.id === id);
              if (!row) return;
              const grants = new Set(row.additionalRoles ?? []);
              if (row.role !== roleId) grants.add(roleId);
              updateMutation.mutate({ id: row.id, role: row.role, additionalRoles: Array.from(grants), employeeId: row.employeeId, isActive: row.isActive, allowedModules: row.allowedModules });
            }}
          />
          {onAddNewWithRole && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onAddNewWithRole(roleId)}>
              <Plus className="h-3.5 w-3.5" /> Add new login with this role
            </Button>
          )}
        </div>
      )}

      {editUser && (
        <EditUserDrawer
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={(p) => updateMutation.mutate({ id: editUser.id, ...p }, { onSuccess: () => setEditUser(null) })}
          saving={updateMutation.isPending}
          employees={employees} branches={branches}
          canManageSuper={canManageSuper}
          onToggleSuper={(id, grant) => superMutation.mutate({ id, grant })}
          superPending={superMutation.isPending}
          onDeleteRequest={() => { onDeleteRequest(editUser); setEditUser(null); }}
          currentUserId={currentUserId}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && onDeleteClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>Permanently delete <strong>{deleteTarget?.email}</strong>? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id, { onSuccess: onDeleteClose })}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Regions Tab
// ─────────────────────────────────────────────────────────────────────────────
function RegionsTab({
  data, isLoading, users, employees, branches,
  canManageSuper, currentUserId,
  updateMutation, superMutation, deleteMutation,
  setRegionMutation, assignEmployeeMutation,
}: {
  data: RegionOverview | undefined; isLoading: boolean; users: UserRow[];
  employees: EmployeeOption[]; branches: BranchOption[];
  canManageSuper: boolean; currentUserId?: string | null;
  updateMutation: any; superMutation: any; deleteMutation: any;
  setRegionMutation: any; assignEmployeeMutation: any;
}) {
  const [selected, setSelected] = useState<RegionSummary | null>(null);
  const { data: unassignedEmployees = [] } = useQuery<UnassignedEmployee[]>({
    queryKey: ["/api/settings/regions/unassigned-employees"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/settings/regions/unassigned-employees");
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j?.employees) ? j.employees : [];
    },
  });

  if (selected) {
    return (
      <RegionDetailPanel
        region={selected}
        users={users}
        employees={employees}
        branches={branches}
        canManageSuper={canManageSuper}
        currentUserId={currentUserId}
        updateMutation={updateMutation}
        superMutation={superMutation}
        deleteMutation={deleteMutation}
        onBack={() => setSelected(null)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
      </div>
    );
  }

  if (!data) return null;

  const assignableBranches = (data.branches ?? []).filter((b) => b.regionCode && b.isActive);

  const issues = data.unassignedBranchCount + data.employeesWithoutRegionCount + data.usersWithoutBranchCount;

  return (
    <div className="space-y-6">
      {issues > 0 && (
        <div className="flex gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50/70">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Attention needed</p>
            <ul className="mt-1.5 list-disc pl-4 text-xs text-amber-800 space-y-0.5">
              {data.unassignedBranchCount > 0 && <li><strong>{data.unassignedBranchCount}</strong> office branch(es) are not assigned to any region. Assign them in the "Office Branches" section below.</li>}
              {data.employeesWithoutRegionCount > 0 && <li><strong>{data.employeesWithoutRegionCount}</strong> employee(s) have no region — they can't see regional data. Assign them to a branch below.</li>}
              {data.usersWithoutBranchCount > 0 && <li><strong>{data.usersWithoutBranchCount}</strong> login(s) have no branch — they can't see regional data. Edit them in the Users tab and set a branch.</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Region cards */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Globe className="h-4 w-4 text-violet-600" />
          <h2 className="text-sm font-bold text-slate-900">Regions</h2>
          <span className="text-xs text-muted-foreground">Click a region to see its members</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.regions.map((r) => {
            const hrCount = users.filter((u) => u.regionCode === r.code && getAllRoles(u).some((g) => ["hr", "limited_hr"].includes(g))).length;
            const adminCount = users.filter((u) => (u.regionCode === r.code || u.isSuperRegionAdmin) && userHasGrant(u, "admin")).length;
            return (
              <div
                key={r.code}
                onClick={() => setSelected(r)}
                className={cn(
                  "group flex flex-col rounded-xl border-2 bg-white p-5 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5",
                  r.isSuperRegion ? "border-amber-200 hover:border-amber-400" : "border-border hover:border-primary/50",
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={cn("h-11 w-11 flex items-center justify-center rounded-xl text-2xl border", r.isSuperRegion ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200")}>
                    {FLAGS[r.code] ?? "🌍"}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {r.isSuperRegion && <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-200"><Crown className="h-2.5 w-2.5" />Super</span>}
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-3">{r.label}</h3>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { l: "Employees", v: r.employeeCount },
                    { l: "HR", v: hrCount },
                    { l: "Admins", v: adminCount },
                  ].map(({ l, v }) => (
                    <div key={l} className="flex flex-col p-2 rounded-lg bg-slate-50 border border-border/60">
                      <span className="text-[10px] text-muted-foreground">{l}</span>
                      <span className="text-lg font-bold text-slate-900">{v}</span>
                    </div>
                  ))}
                </div>
                <span className="text-xs font-semibold text-primary group-hover:gap-2 flex items-center gap-1 mt-auto">
                  Manage <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Branch → Region mapping */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="h-4 w-4 text-violet-600" />
          <h2 className="text-sm font-bold text-slate-900">Office Branches → Regions</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Each office branch belongs to a region. Changing this instantly updates which region all employees in that branch belong to.
        </p>
        <div className="rounded-xl border border-border/80 bg-white overflow-hidden shadow-sm divide-y divide-border/40">
          {data.branches.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No branches found.</p>
          ) : data.branches.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{b.name}</span>
                  {!b.isActive && <Badge variant="secondary" className="text-[10px] h-5">Inactive</Badge>}
                  {!b.regionCode && <Badge variant="outline" className="text-[10px] h-5 border-amber-300 text-amber-700">No region yet</Badge>}
                </div>
                <p className="text-[11px] text-muted-foreground">{b.employeeCount} employee(s)</p>
              </div>
              <Select
                value={b.regionCode ?? "__none__"}
                onValueChange={(v) => setRegionMutation.mutate({ branchId: b.id, regionCode: v === "__none__" ? null : v })}
                disabled={setRegionMutation.isPending}
              >
                <SelectTrigger className="w-44 h-9 text-sm">
                  <SelectValue placeholder="Assign region…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not assigned</SelectItem>
                  {REGION_ORDER.map((code) => (
                    <SelectItem key={code} value={code}>{FLAGS[code] ?? ""} {REGION_LABELS[code]} ({code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </section>

      {/* Employees without region */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <UserPlus className="h-4 w-4 text-violet-600" />
          <h2 className="text-sm font-bold text-slate-900">Employees Without a Region</h2>
          {unassignedEmployees.length > 0 && (
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">{unassignedEmployees.length}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          These active employees have no region and are fail-closed — they can't see regional data. Assign each one to a branch.
          {assignableBranches.length === 0 && unassignedEmployees.length > 0 && (
            <strong className="text-amber-700"> Assign a region to at least one branch above first.</strong>
          )}
        </p>
        {unassignedEmployees.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-4 text-center">
            🎉 All active employees have a region assigned.
          </p>
        ) : (
          <div className="rounded-xl border border-border/80 bg-white overflow-hidden shadow-sm divide-y divide-border/40">
            {unassignedEmployees.map((emp) => (
              <div key={emp.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{emp.name}</p>
                    {emp.employeeId && <span className="text-[11px] text-muted-foreground font-mono">#{emp.employeeId}</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {[emp.jobTitle, emp.department].filter(Boolean).join(" · ") || "—"}
                    {emp.branchName ? ` · ${emp.branchName} (no region)` : " · No branch"}
                  </p>
                </div>
                <Select
                  value="__none__"
                  onValueChange={(v) => { if (v !== "__none__") assignEmployeeMutation.mutate({ employeeId: emp.id, branchId: v }); }}
                  disabled={assignEmployeeMutation.isPending || assignableBranches.length === 0}
                >
                  <SelectTrigger className="w-52 h-9 text-sm">
                    <SelectValue placeholder="Assign to a branch…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>Assign to a branch…</SelectItem>
                    {assignableBranches.map((br) => (
                      <SelectItem key={br.id} value={br.id}>
                        {FLAGS[br.regionCode ?? ""] ?? "📍"} {br.name} · {REGION_LABELS[br.regionCode as RegionCode] ?? br.regionCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Super Region Admins */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-4 w-4 text-violet-600" />
          <h2 className="text-sm font-bold text-slate-900">Super Region Admins</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          These admins can see and manage data across every region. Grant or revoke Super Region access by editing the user from a region detail page or the Users tab.
        </p>
        {data.superAdmins.length === 0 ? (
          <div className="flex items-center gap-2 p-4 rounded-xl border border-dashed text-muted-foreground text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            No Super Region admins assigned yet. Without one, no single account can view across all regions.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.superAdmins.map((a) => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-900">{a.name || a.email}</p>
                  {a.name && <p className="text-[10px] text-amber-700">{a.email}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Region Detail Panel
// ─────────────────────────────────────────────────────────────────────────────
function RegionDetailPanel({
  region, users, employees, branches,
  canManageSuper, currentUserId,
  updateMutation, superMutation, deleteMutation,
  onBack,
}: {
  region: RegionSummary; users: UserRow[];
  employees: EmployeeOption[]; branches: BranchOption[];
  canManageSuper: boolean; currentUserId?: string | null;
  updateMutation: any; superMutation: any; deleteMutation: any;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"admins" | "hr" | "recruiters" | "all">("admins");
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const regionUsers = useMemo(() => users.filter((u) => u.regionCode === region.code || (u.isSuperRegionAdmin && region.isSuperRegion)), [users, region]);
  const admins = regionUsers.filter((u) => userHasGrant(u, "admin"));
  const hrUsers = regionUsers.filter((u) => getAllRoles(u).some((r) => ["hr", "limited_hr"].includes(r)));
  const recruiters = regionUsers.filter((u) => getAllRoles(u).some((r) => ["recruiter", "limited_recruiter", "hiring_manager"].includes(r)));
  const tabData = { admins, hr: hrUsers, recruiters, all: regionUsers };

  return (
    <div className="space-y-5">
      <div>
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Regions
        </button>
        <div className="flex items-center gap-3">
          <div className={cn("h-12 w-12 flex items-center justify-center rounded-xl text-2xl border", region.isSuperRegion ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200")}>
            {FLAGS[region.code] ?? "🌍"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">{region.label} Region</h2>
              {region.isSuperRegion && <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200"><Crown className="h-3 w-3" />Super</span>}
            </div>
            <p className="text-sm text-muted-foreground">{regionUsers.length} total users · {region.employeeCount} employees · {region.branchCount} office(s)</p>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/60 text-sm text-blue-800 flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
        <span>Click the edit icon on any user to change their roles, permissions, branch, or account status without leaving this region.</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l: "Employees", v: region.employeeCount, icon: Users, color: "text-blue-600" },
          { l: "Admins", v: admins.length, icon: Shield, color: "text-violet-600" },
          { l: "HR", v: hrUsers.length, icon: UserCheck, color: "text-emerald-600" },
          { l: "Recruiters", v: recruiters.length, icon: Briefcase, color: "text-sky-600" },
        ].map(({ l, v, icon: Icon, color }) => (
          <div key={l} className="p-4 rounded-xl border border-border bg-white">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn("h-4 w-4", color)} />
              <span className="text-xs text-muted-foreground">{l}</span>
            </div>
            <span className="text-2xl font-bold text-slate-900">{v}</span>
          </div>
        ))}
      </div>

      <div className="border-b border-border">
        <div className="flex">
          {([
            { id: "admins", label: "Admins", count: admins.length },
            { id: "hr", label: "HR", count: hrUsers.length },
            { id: "recruiters", label: "Recruiters", count: recruiters.length },
            { id: "all", label: "All Users", count: regionUsers.length },
          ] as const).map((t) => (
            <button
              key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className={cn("text-[10px] font-bold px-1.5 py-0 rounded-full", tab === t.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <UserMiniList users={tabData[tab] ?? []} onEdit={setEditUser} />

      {editUser && (
        <EditUserDrawer
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={(p) => updateMutation.mutate({ id: editUser.id, ...p }, { onSuccess: () => setEditUser(null) })}
          saving={updateMutation.isPending}
          employees={employees}
          branches={branches}
          canManageSuper={canManageSuper}
          onToggleSuper={(id, grant) => superMutation.mutate({ id, grant })}
          superPending={superMutation.isPending}
          onDeleteRequest={() => { setDeleteTarget(editUser); setEditUser(null); }}
          currentUserId={currentUserId}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{deleteTarget?.email}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UserMiniList({ users, onEdit }: { users: UserRow[]; onEdit?: (user: UserRow) => void }) {
  if (users.length === 0) return (
    <div className="flex flex-col items-center py-12 gap-2 text-muted-foreground border border-dashed rounded-xl">
      <Users className="h-7 w-7 opacity-25" />
      <p className="text-sm">No users in this category</p>
    </div>
  );
  return (
    <div className="rounded-xl border border-border/80 bg-white overflow-hidden shadow-sm">
      <div className="divide-y divide-border/40">
        {users.map((u) => (
          <div key={u.id} className="group flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
            <UserAvatar user={u} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{getDisplayName(u)}</p>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            </div>
            <div className="flex flex-wrap gap-1">{getAllRoles(u).slice(0, 2).map((r) => <RoleBadge key={r} role={r} sm />)}</div>
            <div>
              {u.isActive
                ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Active</span>
                : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Off</span>}
            </div>
            {onEdit && (
              <button
                onClick={() => onEdit(u)}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all"
                title="Edit access"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
type PageTab = "users" | "roles" | "regions";

export default function AccessControlPage() {
  const { user, isSuperRegionAdmin, regionCode } = useAuth();
  const queryClient = useQueryClient();
  const canManageSuper = isSuperRegionAdmin || !regionCode;
  const isSuperViewer = isSuperRegionAdmin || !regionCode;

  const [activeTab, setActiveTab] = useState<PageTab>("users");
  const [pendingAddRole, setPendingAddRole] = useState<string | undefined>(undefined);

  const handleAddNewWithRole = (roleId: string) => {
    setPendingAddRole(roleId);
    setActiveTab("users");
  };

  // ── Data ────────────────────────────────────────────────────────────────────
  const { data: users = [], isLoading: usersLoading } = useQuery<UserRow[]>({
    queryKey: ["/api/auth/users"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/auth/users"); return r.json(); },
  });

  const { data: employeesRaw } = useQuery<EmployeeOption[]>({
    queryKey: ["/api/employees", "access-control"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/employees");
      const j = await r.json();
      return Array.isArray(j) ? j : j?.data ?? [];
    },
  });
  const employees: EmployeeOption[] = employeesRaw ?? [];

  const { data: branchesRaw } = useQuery<any>({
    queryKey: ["/api/departments/branches"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/departments/branches"); return r.json(); },
  });
  const allBranches: BranchOption[] = Array.isArray(branchesRaw)
    ? branchesRaw : branchesRaw?.data?.branches ?? branchesRaw?.branches ?? [];
  const selectableBranches = isSuperViewer
    ? allBranches : allBranches.filter((b: BranchOption) => b.regionCode === user?.regionCode);

  const { data: regionsData, isLoading: regionsLoading } = useQuery<RegionOverview>({
    queryKey: ["/api/settings/regions"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/settings/regions"); if (!r.ok) throw new Error("Failed"); return r.json(); },
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const registerMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiRequest("POST", "/api/auth/register", body);
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || "Failed to create user"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] }); toast.success("User account created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...p }: { id: string } & Record<string, any>) => {
      const r = await apiRequest("PATCH", `/api/auth/users/${id}`, p);
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || "Update failed"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] }); queryClient.invalidateQueries({ queryKey: ["/api/auth/roles/catalog"] }); toast.success("User updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("DELETE", `/api/auth/users/${id}`);
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || "Delete failed"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] }); queryClient.invalidateQueries({ queryKey: ["/api/auth/roles/catalog"] }); toast.success("Account deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const superMutation = useMutation({
    mutationFn: async ({ id, grant }: { id: string; grant: boolean }) => {
      const r = await apiRequest("PATCH", `/api/auth/users/${id}/super-region`, { grant });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || "Failed"); }
      return r.json();
    },
    onSuccess: (_d: any, v: { id: string; grant: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      toast.success(v.grant ? "Super Region access granted" : "Super Region access revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRegionMutation = useMutation({
    mutationFn: async ({ branchId, regionCode }: { branchId: string; regionCode: string | null }) => {
      const r = await apiRequest("PATCH", `/api/settings/regions/branches/${branchId}`, { regionCode });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || "Update failed"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/regions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments/branches"] });
      toast.success("Branch region updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignEmployeeMutation = useMutation({
    mutationFn: async ({ employeeId, branchId }: { employeeId: string; branchId: string }) => {
      const r = await apiRequest("PATCH", `/api/settings/regions/employees/${employeeId}/branch`, { branchId });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || "Update failed"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/regions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/regions/unassigned-employees"] });
      toast.success("Employee region assigned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Stats ───────────────────────────────────────────────────────────────────
  const activeCount = users.filter((u) => u.isActive).length;
  const regionCount = regionsData?.regions.length ?? 0;
  const unassignedWarnings = (regionsData?.unassignedBranchCount ?? 0)
    + (regionsData?.employeesWithoutRegionCount ?? 0)
    + (regionsData?.usersWithoutBranchCount ?? 0);

  const TABS: { id: PageTab; label: string; icon: typeof Shield; badge?: number; warn?: boolean }[] = [
    { id: "users", label: "Users", icon: Users, badge: activeCount },
    { id: "roles", label: "Roles & Permissions", icon: Shield },
    { id: "regions", label: "Regions", icon: Globe, badge: regionCount, warn: unassignedWarnings > 0 },
  ];

  return (
    <Layout>
      <div className="min-h-full bg-[#F8F9FB]">
        {/* Page header */}
        <div className="bg-white border-b border-border/80 px-6 py-5">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline mb-2"
                >
                  <ChevronLeft className="h-4 w-4" /> Back to Settings
                </Link>
                <h1 className="text-xl font-bold text-slate-900">Access Control</h1>
                <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
                  Manage who can log in, what they can see, and which regions they belong to — all in one place.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-border text-xs">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Active</span>
                  <span className="font-bold text-slate-900">{activeCount}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-border text-xs">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Regions</span>
                  <span className="font-bold text-slate-900">{regionCount}</span>
                </div>
                {unassignedWarnings > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-amber-700 font-medium">{unassignedWarnings} issue{unassignedWarnings !== 1 ? "s" : ""}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-border/60 px-6">
          <div className="flex gap-0 max-w-7xl mx-auto">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={cn(
                    "flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors relative",
                    activeTab === t.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {t.label}
                  {t.badge !== undefined && t.badge > 0 && (
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                      activeTab === t.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    )}>{t.badge}</span>
                  )}
                  {t.warn && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 max-w-7xl mx-auto">
          {activeTab === "users" && (
            <UsersTab
              users={users} isLoading={usersLoading}
              employees={employees} branches={selectableBranches}
              currentUserId={user?.id} isSuperViewer={isSuperViewer}
              userRegion={regionCode} canManageSuper={canManageSuper}
              updateMutation={updateMutation} superMutation={superMutation}
              deleteMutation={deleteMutation} registerMutation={registerMutation}
              initialRole={pendingAddRole}
              onClearInitialRole={() => setPendingAddRole(undefined)}
            />
          )}
          {activeTab === "roles" && (
            <RolesTab
              users={users} usersLoading={usersLoading}
              employees={employees} branches={selectableBranches}
              canManageSuper={canManageSuper} currentUserId={user?.id}
              updateMutation={updateMutation} superMutation={superMutation}
              deleteMutation={deleteMutation}
              onAddNewWithRole={handleAddNewWithRole}
            />
          )}
          {activeTab === "regions" && (
            <RegionsTab
              data={regionsData} isLoading={regionsLoading}
              users={users}
              employees={employees}
              branches={selectableBranches}
              canManageSuper={canManageSuper}
              currentUserId={user?.id}
              updateMutation={updateMutation}
              superMutation={superMutation}
              deleteMutation={deleteMutation}
              setRegionMutation={setRegionMutation}
              assignEmployeeMutation={assignEmployeeMutation}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
