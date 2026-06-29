import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Mail, Phone, MapPin, Calendar, Building, 
  Download, Eye, Clock, Home, Globe,
  Edit2, Camera, Bell, CheckCircle2, History,
  DollarSign, TrendingUp, AlertCircle, User,
  Shield, Save, X, Lock, Loader2,
  Laptop, Monitor, Key,
  UserPlus, ArrowRight, Upload, Trash2, FileText, LogOut, Plus, Heart
} from "lucide-react";
import { Link, useRoute, useSearch } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { ApplyLeaveDialog } from "@/components/ApplyLeaveDialog";
import { AssetCard, type AssetData } from "@/components/AssetCard";
import { AssignAssetFromStockDialog } from "@/components/AssignAssetFromStockDialog";
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
import { CompensationTab } from "@/components/CompensationTab";
import { DependentsEmergencySection } from "@/components/DependentsEmergencySection";
import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatLeaveDurationSummary } from "@shared/leaveDayType";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type EmployeeData, formatDisplayDate, formatDateOnly, mapApiToEmployee } from "./employeeProfile/types";
import type { EmployeeListRow } from "@shared/employeeTypes";
import { formatEmployeeDisplayName, formatEmployeeLegalName } from "@shared/employeeDisplayName";
import { formatAppliedAtForEmployee, formatDateTimeWithTimezone, formatLeaveDisplayDate } from "@/lib/dateUtils";
import { sortLeaveBalancesByDisplayOrder, type LeaveBalanceCardRow } from "@/lib/leaveBalanceOrder";
import { lazy, Suspense } from "react";

const ProfileDocumentsTab = lazy(() => import("@/pages/employeeProfile/tabs/ProfileDocumentsTab"));
const ProfileBenefitsTab = lazy(() => import("@/pages/employeeProfile/tabs/ProfileBenefitsTab"));
const ProfileExitTab = lazy(() => import("@/pages/employeeProfile/tabs/ProfileExitTab"));
const ProfileLoansTab = lazy(() => import("@/pages/employeeProfile/tabs/ProfileLoansTab"));

const PROFILE_TABS = new Set([
  "overview",
  "personal",
  "job",
  "assets",
  "benefits",
  "loans",
  "compensation",
  "timeoff",
  "timeline",
  "documents",
  "exit",
]);

function profileTabFromSearch(search: string): string {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const tab = new URLSearchParams(q).get("tab");
  return tab && PROFILE_TABS.has(tab) ? tab : "overview";
}

function getTimelineIconAndColor(type: string): { Icon: React.ComponentType<{ className?: string }>; color: string } {
  const map: Record<string, { Icon: React.ComponentType<{ className?: string }>; color: string }> = {
    joined: { Icon: CheckCircle2, color: "bg-primary" },
    confirmation: { Icon: CheckCircle2, color: "bg-green-600" },
    probation_start: { Icon: Clock, color: "bg-amber-500" },
    probation_end: { Icon: Clock, color: "bg-amber-600" },
    compensation: { Icon: DollarSign, color: "bg-emerald-600" },
    onboarding_started: { Icon: UserPlus, color: "bg-blue-500" },
    onboarding_completed: { Icon: CheckCircle2, color: "bg-blue-600" },
    offboarding_initiated: { Icon: LogOut, color: "bg-orange-500" },
    offboarding_completed: { Icon: LogOut, color: "bg-orange-600" },
    resignation: { Icon: AlertCircle, color: "bg-red-500" },
    exit: { Icon: LogOut, color: "bg-red-600" },
    document: { Icon: FileText, color: "bg-slate-500" },
    profile_updated: { Icon: Edit2, color: "bg-violet-500" },
    asset_assigned: { Icon: Laptop, color: "bg-teal-600" },
    benefit_assigned: { Icon: Heart, color: "bg-rose-500" },
  };
  return map[type] ?? { Icon: History, color: "bg-slate-500" };
}

/** Leave balance display: only .5 or whole days (e.g. 1.29 → 1, 1.67 → 1.5). */
function roundBalanceDisplay(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n * 2) / 2;
}
function formatBalanceDays(n: number): string {
  const x = roundBalanceDisplay(n);
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}
/** Format ISO date-time for "Applied on" / "Approved on" (e.g. Oct 28, 2025 @ 8:26 pm). */
function fmtLeaveDateTime(iso: string | null | undefined, tz?: string | null, df?: string | null): string {
  if (!iso) return "—";
  return formatDateTimeWithTimezone(iso, tz ?? null, df ?? null);
}
const leaveStatusStyle: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function EmployeeProfile() {
  const [match, params] = useRoute("/employees/:id");
  const { user, isAdmin, isHR, isIT } = useAuth();
  const canAssignEmployeeAssets = isAdmin || isHR || isIT;
  const canRemoveEmployeeAssets = isAdmin || isIT;
  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingAdmin, setIsEditingAdmin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [isEditingSocial, setIsEditingSocial] = useState(false);
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [applyTimeOffOpen, setApplyTimeOffOpen] = useState(false);
  const [selectedLeaveRequestId, setSelectedLeaveRequestId] = useState<string | null>(null);

  // Personal details form state
  const [personalData, setPersonalData] = useState({
    dob: "",
    gender: "",
    maritalStatus: "",
    bloodGroup: "",
    personalEmail: "",
    personalPhone: "",
  });

  /** Self-service draft for work phone change request (shown on Work tab). */
  const [workPhoneChangeDraft, setWorkPhoneChangeDraft] = useState("");

  // Address form state
  const [addressData, setAddressData] = useState({
    street: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
  });

  // Admin edit form data
  const [editData, setEditData] = useState({
    firstName: "",
    lastName: "",
    nickname: "",
    workEmail: "",
    status: "",
    employeeType: "",
    businessUnit: "",
    costCenter: "",
    managerId: "",
    hrManagerId: "",
    role: "",
    primaryTeam: "",
    employeeRole: "",
    department: "",
    location: "",
    grade: "",
    shift: "",
    jobCategory: "",
    leaveApprovalTier: "",
    noticePeriod: "",
    probationStartDate: "",
    probationEndDate: "",
    confirmationDate: "",
    joinDate: "",
    resignationDate: "",
    lastWorkingDate: "",
    exitType: "Release",
    eligibleForRehire: "yes",
    resignationReason: "",
    workPhone: "",
  });

  // Initialize edit data when entering edit mode
  const startEditing = () => {
    if (employee) {
      setEditData({
        firstName: employee.firstName || "",
        lastName: employee.lastName || "",
        nickname: employee.nickname || "",
        workEmail: employee.email || "",
        status: employee.status || "Active",
        employeeType: employee.employeeType || "",
        businessUnit: employee.businessUnit || "",
        costCenter: employee.costCenter || "",
        managerId: employee.managerId || "",
        hrManagerId: "", // will be resolved from hrEmail below
        role: employee.role || "",
        primaryTeam: employee.primaryTeam || "",
        employeeRole: employee.employeeRole || "",
        department: employee.department || "",
        location: employee.location || "",
        grade: employee.grade || "",
        shift: employee.shift || "",
        jobCategory: employee.jobCategory || "",
        leaveApprovalTier: employee.leaveApprovalTier ?? "standard",
        noticePeriod: employee.noticePeriod || "",
        probationStartDate: employee.probationStartDate || "",
        probationEndDate: employee.probationEndDate || "",
        confirmationDate: employee.confirmationDate || "",
        joinDate: employee.joinDate || "",
        resignationDate: employee.resignationDate || "",
        lastWorkingDate: employee.lastWorkingDate || "",
        exitType: employee.exitType || "Release",
        eligibleForRehire: employee.eligibleForRehire === false ? "no" : "yes",
        resignationReason: employee.resignationReason || "",
        workPhone: employee.workPhone || "",
      });
    }
    setIsEditingAdmin(true);
  };

  const handleEditChange = (field: string, value: string) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };
  
  const id = params?.id;

  useEffect(() => {
    if (employee) setWorkPhoneChangeDraft(employee.workPhone || "");
  }, [employee?.id, employee?.workPhone]);

  const { data: profileBannerSettings } = useQuery({
    queryKey: ["/api/settings/employee-profile-banner"],
    queryFn: async () => {
      const r = await fetch("/api/settings/employee-profile-banner", { credentials: "include" });
      if (!r.ok) return { bannerUrl: null as string | null, updatedAt: null as string | null };
      return r.json() as Promise<{ bannerUrl: string | null; updatedAt: string | null }>;
    },
    staleTime: 60_000,
  });
  const companyProfileBannerUrl = profileBannerSettings?.bannerUrl ?? null;
  const companyProfileBannerBg =
    companyProfileBannerUrl && profileBannerSettings?.updatedAt
      ? `${companyProfileBannerUrl}?t=${encodeURIComponent(profileBannerSettings.updatedAt)}`
      : companyProfileBannerUrl;

  const queryClient = useQueryClient();
  const refreshProfileTimeline = (empId: string) => {
    queryClient.invalidateQueries({ queryKey: ["/api/employees", empId, "timeline"] });
    window.dispatchEvent(new CustomEvent("employee-updated", { detail: { employeeId: empId } }));
  };

  // Refetch when asset changes or onboarding completes (employee-updated event)
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ employeeId: string }>).detail;
      if (detail?.employeeId === id) {
        setRefreshTrigger((t) => t + 1);
        queryClient.invalidateQueries({ queryKey: ["/api/assets/systems/user", id] });
        queryClient.invalidateQueries({ queryKey: ["/api/employees", id, "dependents"] });
        queryClient.invalidateQueries({ queryKey: ["/api/employees", id, "emergency-contacts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/employees", id, "timeline"] });
      }
    };
    window.addEventListener("employee-updated", handler);
    return () => window.removeEventListener("employee-updated", handler);
  }, [id, queryClient]);

  // Fetch employee from API
  useEffect(() => {
    async function fetchEmployee() {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/employees/${id}`, {
          credentials: "include",
        });

        if (!res.ok) {
          if (res.status === 404) {
            setError("Employee not found");
          } else {
            setError("Failed to load employee");
          }
          return;
        }

        const data = await res.json();
        const raw = data?.data ?? data?.employee ?? data;
        setEmployee(mapApiToEmployee(raw ?? {}));
      } catch (err) {
        console.error("Error fetching employee:", err);
        setError("Failed to load employee");
      } finally {
        setLoading(false);
      }
    }

    fetchEmployee();
  }, [id, refreshTrigger]);

  // Show employee name in header breadcrumb instead of UUID
  const { setBreadcrumbLabel } = useBreadcrumb();
  useEffect(() => {
    const name = employee?.name?.trim() || [employee?.firstName, employee?.lastName].filter(Boolean).join(" ").trim() || null;
    setBreadcrumbLabel(name || null);
    return () => setBreadcrumbLabel(null);
  }, [employee, setBreadcrumbLabel]);

  // Onboarding: check if employee has active onboarding
  const [onboardingRecord, setOnboardingRecord] = useState<{ id: string; status: string } | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [startOnboardingLoading, setStartOnboardingLoading] = useState(false);
  const [welcomeInviteLoading, setWelcomeInviteLoading] = useState(false);

  useEffect(() => {
    async function fetchOnboarding() {
      if (!id) return;
      setOnboardingLoading(true);
      try {
        const res = await fetch(`/api/onboarding/employee/${id}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          const record = data?.data ?? data;
          setOnboardingRecord(record?.id ? { id: record.id, status: record.status } : null);
        } else {
          setOnboardingRecord(null);
        }
      } catch {
        setOnboardingRecord(null);
      } finally {
        setOnboardingLoading(false);
      }
    }
    fetchOnboarding();
  }, [id, refreshTrigger]);

  const handleStartOnboarding = async () => {
    if (!employee?.id) return;
    setStartOnboardingLoading(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ employeeId: employee.id }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData?.error?.message ?? errData?.error ?? "Failed to start onboarding";
        throw new Error(typeof msg === "string" ? msg : "Failed to start onboarding");
      }
      const data = await res.json();
      const record = data?.data ?? data;
      setOnboardingRecord(record?.id ? { id: record.id, status: record.status ?? "in_progress" } : null);
      toast.success("Onboarding started", {
        description: "IT Admin will be notified. Track progress on the Onboarding page.",
      });
      window.location.href = "/onboarding";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start onboarding");
    } finally {
      setStartOnboardingLoading(false);
    }
  };

  const handleSendWelcomeInvitation = async () => {
    if (!employee?.id) return;
    setWelcomeInviteLoading(true);
    try {
      const res = await apiRequest("POST", `/api/employees/${employee.id}/send-welcome-invitation`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg =
          (errData as { error?: { message?: string } | string })?.error &&
          typeof (errData as { error?: { message?: string } }).error === "object"
            ? (errData as { error: { message?: string } }).error.message
            : (errData as { error?: string }).error;
        throw new Error(typeof msg === "string" ? msg : "Failed to send invitation");
      }
      const data = await res.json();
      toast.success("eHire welcome invitation sent", {
        description: `Login instructions emailed to ${data.email ?? employee.email}`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setWelcomeInviteLoading(false);
    }
  };

  // Fetch assigned systems/assets for this employee (React Query for cache invalidation from Assets/Onboarding)
  const { data: assignedAssetsRaw = [], isLoading: assetsLoading } = useQuery({
    queryKey: ["/api/assets/systems/user", id],
    queryFn: async ({ queryKey }) => {
      const empId = queryKey[1];
      if (!empId) return [];
      const res = await fetch(`/api/assets/systems/user/${empId}`, {
        credentials: "include",
        cache: "no-store", // Always get fresh data, don't use browser cache
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!id,
    staleTime: 0, // Override global staleTime so invalidation/refetch always fetches fresh data
    refetchOnMount: "always", // Always refetch when this component mounts (e.g. navigating back)
  });
  const assignedAssets = Array.isArray(assignedAssetsRaw) ? assignedAssetsRaw : [];

  const [assignAssetOpen, setAssignAssetOpen] = useState(false);
  const [assetToRemove, setAssetToRemove] = useState<AssetData | null>(null);

  const { data: stockForAssign = [] } = useQuery({
    queryKey: ["/api/assets/stock"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/assets/stock");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: assignAssetOpen && canAssignEmployeeAssets,
    select: (data: any[]) =>
      data.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        productType: item.product_type,
        available: item.available ?? 0,
        specs: item.specs ?? undefined,
      })),
  });

  const removeAssetMutation = useMutation({
    mutationFn: async (systemId: string) => {
      await apiRequest("DELETE", `/api/assets/systems/${systemId}`);
    },
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ["/api/assets/systems/user", id] });
        queryClient.invalidateQueries({ queryKey: ["/api/employees", id, "timeline"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assets/systems"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assets/stock"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assets/recent-returns"] });
        window.dispatchEvent(new CustomEvent("employee-updated", { detail: { employeeId: id } }));
      }
      setAssetToRemove(null);
      toast.success("Asset removed and returned to stock");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove asset");
      setAssetToRemove(null);
    },
  });

  const handleAssignAssetSuccess = (employeeId?: string) => {
    const empId = employeeId || id;
    if (empId) {
      queryClient.invalidateQueries({ queryKey: ["/api/assets/systems/user", empId] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", empId, "timeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets/systems"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets/recent-returns"] });
    }
  };

  const employeeAssetAssignLabel = employee
    ? formatEmployeeDisplayName(employee.firstName, employee.lastName, employee.nickname)
    : "This employee";

  // Leave (timeoff) — synced with Leave Calendar
  const { data: leaveBalances = [] } = useQuery<LeaveBalanceCardRow[]>({
    queryKey: ["/api/leave/balances", employee?.id],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/leave/balances/${employee!.id}`);
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!employee?.id,
  });
  const { data: leaveRequests = [] } = useQuery({
    queryKey: ["/api/leave/employee", employee?.id, "requests"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/leave/employee/${employee!.id}/requests`);
      return r.json();
    },
    enabled: !!employee?.id,
  });
  const { data: leaveRequestDetail } = useQuery<{
    id: string; status: string; type_name: string; color: string; start_date: string; end_date: string; day_type: string; total_days: string; reason: string | null; applied_at: string; decided_at: string | null; decided_by: string | null; decided_by_first_name?: string | null; decided_by_last_name?: string | null; rejection_reason: string | null;
  }>({
    queryKey: ["/api/leave/request", selectedLeaveRequestId],
    queryFn: async () => (await apiRequest("GET", `/api/leave/request/${selectedLeaveRequestId}`)).json(),
    enabled: !!selectedLeaveRequestId,
  });
  const deleteLeaveRequestMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/leave/request/${id}`); },
    onSuccess: (_data, id) => {
      toast.success("Request deleted");
      setSelectedLeaveRequestId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/leave"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leave/employee", employee?.id, "requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leave/request", id] });
    },
    onError: (err: unknown) => toast.error((err as Error)?.message || "Failed to delete"),
  });

  const { data: timelineData, isLoading: timelineLoading } = useQuery<{ events: Array<{ date: string; type: string; title: string; description: string }> }>({
    queryKey: ["/api/employees", employee?.id, "timeline"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/employees/${employee!.id}/timeline`);
      return r.json();
    },
    enabled: !!employee?.id,
  });
  const timelineEvents = timelineData?.events ?? [];

  // All employees (for reporting-line dropdowns)
  const { data: allEmployees = [] } = useQuery<EmployeeListRow[]>({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/employees");
      const json = await r.json();
      if (Array.isArray(json)) return json;
      return Array.isArray(json?.data) ? json.data : [];
    },
  });

  const { data: departmentsData } = useQuery<{ departments: string[] }>({
    queryKey: ["/api/employees/departments"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/employees/departments");
      return r.json();
    },
  });
  const { data: businessUnitsData } = useQuery<{ success?: boolean; data?: { businessUnits: Array<{ id: string; name: string }> } }>({
    queryKey: ["/api/departments/business-units"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/departments/business-units");
      return r.json();
    },
  });
  const { data: levelsData } = useQuery<{ success?: boolean; data?: { levels: Array<{ id: string; name: string }> } }>({
    queryKey: ["/api/departments/levels"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/departments/levels");
      return r.json();
    },
  });
  const { data: branchesData } = useQuery<{ success?: boolean; data?: { branches: Array<{ id: string; name: string }> } }>({
    queryKey: ["/api/departments/branches"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/departments/branches");
      return r.json();
    },
  });
  const { data: shiftsData } = useQuery<{ success?: boolean; data?: { shifts: Array<{ id: string; name: string }> } }>({
    queryKey: ["/api/departments/shifts"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/departments/shifts");
      return r.json();
    },
  });
  const { data: teamsData } = useQuery<{ success?: boolean; data?: { teams: Array<{ id: string; name: string }> } }>({
    queryKey: ["/api/departments/teams"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/departments/teams");
      return r.json();
    },
  });
  const departments = departmentsData?.departments ?? [];
  const businessUnits = businessUnitsData?.data?.businessUnits ?? [];
  const levels = levelsData?.data?.levels ?? [];
  const branches = branchesData?.data?.branches ?? [];
  const shifts = shiftsData?.data?.shifts ?? [];
  const teams = teamsData?.data?.teams ?? [];

  // Helper: find employee name by id
  const empById = (empId?: string | null) => allEmployees.find((e) => e.id === empId);
  // Helper: find employee by work_email (for HR partner backward compat)
  const empByEmail = (email?: string | null) => email ? allEmployees.find((e) => e.work_email?.toLowerCase() === email.toLowerCase()) : undefined;

  // Resolve hrManagerId when entering edit mode (from hrEmail → employee id)
  useEffect(() => {
    if (isEditingAdmin && employee?.hrEmail && allEmployees.length > 0 && !editData.hrManagerId) {
      const hrEmp = empByEmail(employee.hrEmail);
      if (hrEmp) setEditData((prev) => ({ ...prev, hrManagerId: hrEmp.id }));
    }
  }, [isEditingAdmin, employee?.hrEmail, allEmployees.length]);

  // Role-based permissions
  const canAdminEdit = isAdmin || isHR; // Admin/HR can edit core fields
  const isOwnProfile = user?.employeeId === id; // Check if viewing own profile
  const canViewSensitive = canAdminEdit || isOwnProfile; // Can see salary, personal info
  const hasProvisionedWorkEmail = useMemo(() => {
    const e = (employee?.email ?? "").trim().toLowerCase();
    if (!e || !e.includes("@")) return false;
    return !(e.startsWith("pending-") && e.endsWith("@internal.local"));
  }, [employee?.email]);
  const canSendWelcomeInvitation =
    canAdminEdit &&
    hasProvisionedWorkEmail &&
    !onboardingLoading &&
    (onboardingRecord?.status === "completed" || employee?.status === "Active");

  const profileSearch = useSearch();
  const tabFromUrl = useMemo(() => profileTabFromSearch(profileSearch), [profileSearch]);
  const [activeTab, setActiveTab] = useState(tabFromUrl);
  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  const hasExitDetails =
    employee &&
    ["Terminated", "Offboarded", "Resigned"].includes(employee.status);

  const { data: loanSummary } = useQuery<{ records: any[]; applications: any[] }>({
    queryKey: ["/api/loans/employee", employee?.id],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/loans/employee/${employee!.id}`);
      const j = await r.json();
      const payload = (j && typeof j === "object" && "data" in j ? j.data : j) as
        | { records?: unknown; applications?: unknown }
        | null
        | undefined;
      return {
        records: Array.isArray(payload?.records) ? payload.records : [],
        applications: Array.isArray(payload?.applications) ? payload.applications : [],
      };
    },
    enabled: !!employee?.id,
    staleTime: 60_000,
  });
  const hasLoans =
    (loanSummary?.records?.length ?? 0) > 0 ||
    (loanSummary?.applications?.length ?? 0) > 0;

  const handleAdminSave = async () => {
    if (!employee) return;
    
    setIsSaving(true);
    try {
      // Map status back to API format
      const statusMap: Record<string, string> = {
        "Active": "active",
        "Onboarding": "onboarding",
        "On Leave": "on_leave",
        "Terminated": "terminated",
        "Resigned": "resigned",
        "Offboarded": "offboarded",
      };

      const workEmailTrimmed = editData.workEmail?.trim() || "";
      if (workEmailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmailTrimmed)) {
        toast.error("Please enter a valid work email address");
        return;
      }

      // Resolve manager / HR partner: dropdown gives us employee ID, derive email for backward compat
      const selectedManager = editData.managerId ? empById(editData.managerId) : undefined;
      const selectedHR = editData.hrManagerId ? empById(editData.hrManagerId) : undefined;

      const payload = {
        first_name: editData.firstName,
        last_name: editData.lastName,
        nickname: editData.nickname.trim() || null,
        work_email: workEmailTrimmed || null,
        employment_status: statusMap[editData.status] || editData.status.toLowerCase(),
        employee_type: editData.employeeType,
        business_unit: editData.businessUnit,
        cost_center: editData.costCenter,
        manager_id: editData.managerId || null,
        manager_email: selectedManager?.work_email || employee?.managerEmail || null,
        hr_email: selectedHR?.work_email || employee?.hrEmail || null,
        job_title: editData.role,
        department: editData.department || null,
        location: editData.location || null,
        primary_team: editData.primaryTeam || null,
        role: editData.employeeRole || null,
        grade: editData.grade || null,
        shift: editData.shift || null,
        job_category: editData.jobCategory || null,
        leave_approval_tier: editData.leaveApprovalTier || "standard",
        notice_period: editData.noticePeriod || null,
        probation_start_date: editData.probationStartDate || null,
        probation_end_date: editData.probationEndDate || null,
        confirmation_date: editData.confirmationDate || null,
        join_date: editData.joinDate || null,
        resignation_date: editData.resignationDate || null,
        exit_date: editData.lastWorkingDate || null,
        exit_type: editData.exitType || null,
        eligible_for_rehire: editData.eligibleForRehire === "yes",
        resignation_reason: editData.resignationReason || null,
        work_phone: editData.workPhone?.trim() || null,
      };

      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update employee");
      }

      // Use PATCH response employee (includes grade, business_unit, etc.) so profile state updates correctly
      const patchData = await res.json();
      const updatedEmployee = patchData?.employee ?? patchData?.data ?? patchData;
      if (updatedEmployee && typeof updatedEmployee === "object") {
        setEmployee(mapApiToEmployee(updatedEmployee));
      } else {
        const updatedRes = await fetch(`/api/employees/${employee.id}`, { credentials: "include" });
        if (updatedRes.ok) {
          const refreshed = await updatedRes.json();
          setEmployee(mapApiToEmployee(refreshed?.employee ?? refreshed?.data ?? refreshed));
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/employees/departments"] });
      refreshProfileTimeline(employee.id);
      setIsEditingAdmin(false);
      toast.success("Profile updated successfully", {
        description: "Core employee record has been modified.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update employee");
    } finally {
      setIsSaving(false);
    }
  };

  const startEditingPersonal = () => {
    if (employee) {
      setPersonalData({
        dob: employee.dob || "",
        gender: employee.gender || "",
        maritalStatus: employee.maritalStatus || "",
        bloodGroup: employee.bloodGroup || "",
        personalEmail: employee.personalEmail || "",
        personalPhone: employee.personalPhone || "",
      });
    }
    setIsEditingPersonal(true);
  };

  const handlePersonalSave = async () => {
    if (!employee) return;

    setIsSavingPersonal(true);
    try {
      if (canAdminEdit) {
        const res = await fetch(`/api/employees/${employee.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            dob: personalData.dob || null,
            gender: personalData.gender || null,
            marital_status: personalData.maritalStatus || null,
            blood_group: personalData.bloodGroup || null,
            personal_email: personalData.personalEmail || null,
            personal_phone: personalData.personalPhone?.trim() || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update");
        }
        const updatedRes = await fetch(`/api/employees/${employee.id}`, { credentials: "include" });
        if (updatedRes.ok) {
          const updatedData = await updatedRes.json();
          setEmployee(mapApiToEmployee(updatedData));
        }
        setIsEditingPersonal(false);
        refreshProfileTimeline(employee.id);
        toast.success("Personal details updated successfully");
      } else {
        const norm = (v: string | null | undefined) => (v ?? "").toString().trim();
        const personalDetailsChanges: Record<string, string> = {};
        const contactChanges: Record<string, string> = {};
        if (norm(personalData.dob) !== norm(employee.dob)) personalDetailsChanges.dob = personalData.dob || "";
        if (norm(personalData.gender) !== norm(employee.gender)) personalDetailsChanges.gender = personalData.gender || "";
        if (norm(personalData.maritalStatus) !== norm(employee.maritalStatus)) personalDetailsChanges.marital_status = personalData.maritalStatus || "";
        if (norm(personalData.bloodGroup) !== norm(employee.bloodGroup)) personalDetailsChanges.blood_group = personalData.bloodGroup || "";
        if (norm(personalData.personalEmail) !== norm(employee.personalEmail)) contactChanges.personal_email = personalData.personalEmail || "";
        if (norm(personalData.personalPhone) !== norm(employee.personalPhone)) contactChanges.personal_phone = personalData.personalPhone || "";

        let submitted = 0;
        if (Object.keys(personalDetailsChanges).length > 0) {
          const res = await apiRequest("POST", `/api/change-requests/employees/${employee.id}/change-requests/bulk`, {
            category: "personal_details",
            changes: personalDetailsChanges,
          });
          const json = await res.json();
          const payload = json?.data ?? json;
          submitted += payload?.requests?.length ?? 1;
        }
        if (Object.keys(contactChanges).length > 0) {
          const res = await apiRequest("POST", `/api/change-requests/employees/${employee.id}/change-requests/bulk`, {
            category: "contact",
            changes: contactChanges,
          });
          const json = await res.json();
          const payload = json?.data ?? json;
          submitted += payload?.requests?.length ?? 1;
        }

        if (submitted === 0) {
          toast.info("No changes to submit");
          return;
        }
        setIsEditingPersonal(false);
        queryClient.invalidateQueries({ queryKey: ["/api/change-requests"] });
        toast.success("Change request(s) submitted", {
          description: "Your changes have been sent to HR for approval.",
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setIsSavingPersonal(false);
    }
  };

  const submitWorkPhoneChangeRequest = async () => {
    if (!employee || canAdminEdit) return;
    const norm = (v: string | null | undefined) => (v ?? "").toString().trim();
    if (norm(workPhoneChangeDraft) === norm(employee.workPhone)) {
      toast.info("No change to submit");
      return;
    }
    try {
      await apiRequest("POST", `/api/change-requests/employees/${employee.id}/change-requests/bulk`, {
        category: "contact",
        changes: { work_phone: workPhoneChangeDraft.trim() || "" },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/change-requests"] });
      toast.success("Change request submitted", { description: "HR will review your work phone update." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    }
  };

  const startEditingAddress = () => {
    if (employee) {
      setAddressData({
        street: employee.street || "",
        city: employee.city || "",
        state: employee.state || "",
        zipCode: employee.zipCode || "",
        country: employee.country || "",
      });
    }
    setIsEditingAddress(true);
  };

  const handleAddressSave = async () => {
    if (!employee) return;

    setIsSavingAddress(true);
    try {
      if (canAdminEdit) {
        const res = await fetch(`/api/employees/${employee.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            street: addressData.street || null,
            city: addressData.city || null,
            state: addressData.state || null,
            zip_code: addressData.zipCode || null,
            country: addressData.country || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update");
        }
        const updatedRes = await fetch(`/api/employees/${employee.id}`, { credentials: "include" });
        if (updatedRes.ok) {
          const updatedData = await updatedRes.json();
          setEmployee(mapApiToEmployee(updatedData));
        }
        setIsEditingAddress(false);
        refreshProfileTimeline(employee.id);
        toast.success("Address updated successfully");
      } else {
        const norm = (v: string | null | undefined) => (v ?? "").toString().trim();
        const addressChanges: Record<string, string> = {};
        if (norm(addressData.street) !== norm(employee.street)) addressChanges.street = addressData.street || "";
        if (norm(addressData.city) !== norm(employee.city)) addressChanges.city = addressData.city || "";
        if (norm(addressData.state) !== norm(employee.state)) addressChanges.state = addressData.state || "";
        if (norm(addressData.zipCode) !== norm(employee.zipCode)) addressChanges.zip_code = addressData.zipCode || "";
        if (norm(addressData.country) !== norm(employee.country)) addressChanges.country = addressData.country || "";

        if (Object.keys(addressChanges).length === 0) {
          toast.info("No changes to submit");
          return;
        }
        await apiRequest("POST", `/api/change-requests/employees/${employee.id}/change-requests/bulk`, {
          category: "address",
          changes: addressChanges,
        });
        setIsEditingAddress(false);
        queryClient.invalidateQueries({ queryKey: ["/api/change-requests"] });
        toast.success("Change request(s) submitted", {
          description: "Your changes have been sent to HR for approval.",
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleSocialSave = () => {
    setIsEditingSocial(false);
    toast.success("Social profiles updated", {
      description: "Your changes have been saved.",
      duration: 3000,
    });
  };

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarKey, setAvatarKey] = useState(0);

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !employee) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      try {
        if (canAdminEdit) {
          const res = await fetch(`/api/employees/${employee.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ avatar: base64 }),
          });
          if (!res.ok) throw new Error("Failed to update avatar");
          setAvatarKey((k) => k + 1);
          refreshProfileTimeline(employee.id);
          toast.success("Profile picture updated");
        } else {
          const res = await apiRequest("POST", `/api/change-requests/employees/${employee.id}/change-requests/bulk`, {
            category: "personal_details",
            changes: { avatar: base64 },
          });
          const json = (await res.json()) as { data?: { requests?: unknown[] } };
          const n = json?.data?.requests?.length ?? 0;
          if (n === 0) throw new Error("No change request was created");
          queryClient.invalidateQueries({ queryKey: ["/api/change-requests"] });
          toast.success("Photo submitted for approval", {
            description: "HR will review your new profile picture. It will update after approval.",
          });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to submit profile picture");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  // Loading state
  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading employee profile...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Error state
  if (error || !employee) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">{error || "Employee not found"}</h2>
          <p className="text-muted-foreground">The employee you're looking for doesn't exist or you don't have permission to view it.</p>
          <Link href="/employees">
            <Button>Back to Directory</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <Link href="/employees">
          <Button variant="ghost" className="pl-0 hover:pl-2 transition-all text-muted-foreground hover:text-foreground">
            ← Back to Directory
          </Button>
        </Link>
        
        <div className="flex items-center gap-4">
          {/* Role indicator */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
            <Shield className="h-3 w-3 text-slate-500" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Viewing as: <span className="font-bold text-slate-900 dark:text-slate-100 capitalize">{user?.role}</span>
            </span>
            {isOwnProfile && (
              <Badge variant="outline" className="text-[10px] ml-1 bg-green-50 text-green-700 border-green-200">
                Your Profile
              </Badge>
            )}
          </div>

          {/* Start Onboarding (Admin/HR only: show only for employees still in Onboarding status with no record, or no record and not yet active) */}
          {canAdminEdit && !onboardingLoading && !onboardingRecord && employee?.status !== "Active" && (
            <Button
              onClick={handleStartOnboarding}
              disabled={startOnboardingLoading}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {startOnboardingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {startOnboardingLoading ? "Starting…" : "Start Onboarding"}
            </Button>
          )}
          {canAdminEdit && onboardingRecord?.status === "in_progress" && (
            <Link href="/onboarding">
              <Button variant="outline" className="gap-2">
                <ArrowRight className="h-4 w-4" /> View Onboarding
              </Button>
            </Link>
          )}
          {canAdminEdit && onboardingRecord?.status === "completed" && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
              Onboarding completed
            </Badge>
          )}
          {canSendWelcomeInvitation && (
            <Button
              variant="outline"
              onClick={handleSendWelcomeInvitation}
              disabled={welcomeInviteLoading}
              className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950"
            >
              {welcomeInviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {welcomeInviteLoading ? "Sending…" : "Send eHire Invitation"}
            </Button>
          )}
          {/* Admin/HR Edit Button */}
          {canAdminEdit && (
            isEditingAdmin ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditingAdmin(false)} disabled={isSaving} className="gap-2">
                  <X className="h-4 w-4" /> Cancel
                </Button>
                <Button size="sm" onClick={handleAdminSave} disabled={isSaving} className="gap-2">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isSaving ? "Saving..." : "Save Record"}
                </Button>
              </div>
            ) : (
              <Button onClick={startEditing} className="gap-2 bg-slate-900 text-white hover:bg-slate-800">
                <Edit2 className="h-4 w-4" /> Edit Profile
              </Button>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Sidebar Profile Card */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border border-border shadow-sm bg-card overflow-visible">
            <div
              className={`h-36 relative z-10 overflow-visible ${!companyProfileBannerUrl ? "bg-gradient-to-r from-blue-600 to-purple-600" : ""}`}
              style={
                companyProfileBannerBg
                  ? {
                      backgroundImage: `url("${companyProfileBannerBg}")`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : undefined
              }
            >
              <div className="absolute -bottom-14 left-6 group">
                <div className="relative">
                  <Avatar className="h-32 w-32 border-4 border-card shadow-sm cursor-pointer group-hover:opacity-90 transition-opacity">
                    <AvatarImage src={`/api/employees/${employee.id}/avatar?t=${avatarKey}`} alt="" />
                    <AvatarFallback>{employee.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  {(canAdminEdit || isOwnProfile) && (
                    <>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={handleAvatarClick}>
                        <Camera className="h-6 w-6 text-white" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <CardContent className="relative z-0 pt-20 pb-6 px-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">{employee.name}</h2>
                  <p className="text-primary font-medium">{employee.role}</p>
                </div>
                {isEditingAdmin ? (
                   <Select value={editData.status} onValueChange={(v) => handleEditChange("status", v)} disabled={isSaving}>
                    <SelectTrigger className="w-[120px] h-8">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Onboarding">Onboarding</SelectItem>
                      <SelectItem value="On Leave">On Leave</SelectItem>
                      <SelectItem value="Terminated">Terminated</SelectItem>
                      <SelectItem value="Resigned">Resigned</SelectItem>
                      <SelectItem value="Offboarded">Offboarded</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge className={`
                    ${employee.status === 'Active' ? 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : 
                      employee.status === 'Terminated' || employee.status === 'Resigned' ? 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' : 
                      employee.status === 'Offboarded' ? 'bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800' :
                      employee.status === 'Onboarding' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' :
                      'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'}
                  `}>
                    {employee.status}
                  </Badge>
                )}
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Badge variant="outline" className="mr-3 font-mono text-xs border-border">{employee.employeeId}</Badge>
                  ID: {employee.employeeId}
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Building className="h-4 w-4 mr-3 text-muted-foreground" />
                  {employee.department} {employee.subDepartment ? `• ${employee.subDepartment}` : ''}
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 mr-3 text-muted-foreground" />
                  {employee.location}
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Mail className="h-4 w-4 mr-3 text-muted-foreground" />
                  {employee.email}
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 mr-3 text-muted-foreground" />
                  Joined {formatDateOnly(employee.joinDate, user?.dateFormat ?? null) || employee.joinDate}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button 
                  type="button"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => {
                    window.location.href = `mailto:${employee.email}`;
                  }}
                >
                  <Mail className="h-4 w-4 mr-2" /> Message
                </Button>
                <Button 
                  type="button"
                  variant="outline" 
                  className="w-full border-border bg-card hover:bg-muted text-foreground"
                  onClick={() => {
                    toast.info("Calendar integration coming soon", {
                      description: "This feature will be available when calendar module is implemented."
                    });
                  }}
                >
                  <Calendar className="h-4 w-4 mr-2" /> Schedule
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Main Content Tabs — employees viewing another employee see only Overview */}
        <div className="lg:col-span-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {canViewSensitive && (
              <TabsList className="bg-muted p-1 mb-6 w-full justify-start overflow-x-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="personal">Personal</TabsTrigger>
                <TabsTrigger value="job">Work</TabsTrigger>
                <TabsTrigger value="assets">Assets</TabsTrigger>
                <TabsTrigger value="benefits">Benefits</TabsTrigger>
                {hasLoans && <TabsTrigger value="loans">Loans</TabsTrigger>}
                <TabsTrigger value="compensation">Compensation</TabsTrigger>
                <TabsTrigger value="timeoff">Timeoff</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="documents">Files</TabsTrigger>
                {hasExitDetails && <TabsTrigger value="exit" className="text-destructive">Exit Details</TabsTrigger>}
              </TabsList>
            )}

            <TabsContent value="overview" className="space-y-6">
              {/* General Info Grid */}
              <Card className="border border-border shadow-sm bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Core Information</CardTitle>
                  {isEditingAdmin && <Badge variant="outline" className="text-xs font-normal bg-blue-50 text-blue-700 border-blue-200">Admin Editing</Badge>}
                </CardHeader>
                <CardContent>
                  {isEditingAdmin ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="firstName">First Name</Label>
                          <Input id="firstName" value={editData.firstName} onChange={(e) => handleEditChange("firstName", e.target.value)} disabled={isSaving} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lastName">Last Name</Label>
                          <Input id="lastName" value={editData.lastName} onChange={(e) => handleEditChange("lastName", e.target.value)} disabled={isSaving} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="displayName">Display Name</Label>
                          <Input
                            id="displayName"
                            value={formatEmployeeDisplayName(editData.firstName, editData.lastName, editData.nickname)}
                            disabled
                            className="bg-muted"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nickname">Also known as (pseudonym)</Label>
                          <Input
                            id="nickname"
                            placeholder="Optional — office or desk name"
                            value={editData.nickname}
                            onChange={(e) => handleEditChange("nickname", e.target.value)}
                            disabled={isSaving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="empType">Employee Type</Label>
                          <Select value={editData.employeeType} onValueChange={(v) => handleEditChange("employeeType", v)} disabled={isSaving}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full_time">Full Time</SelectItem>
                              <SelectItem value="part_time">Part Time</SelectItem>
                              <SelectItem value="contractor">Contractor</SelectItem>
                              <SelectItem value="intern">Intern</SelectItem>
                              <SelectItem value="temporary">Temporary</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="bu">Business Unit</Label>
                          <Select value={editData.businessUnit} onValueChange={(v) => handleEditChange("businessUnit", v)} disabled={isSaving}>
                            <SelectTrigger>
                              <SelectValue placeholder={businessUnits.length ? "Select unit" : "Run org migration first"} />
                            </SelectTrigger>
                            <SelectContent>
                              {businessUnits.map((bu) => <SelectItem key={bu.id} value={bu.name}>{bu.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="costCenter">Cost Center</Label>
                          <Input id="costCenter" value={editData.costCenter} onChange={(e) => handleEditChange("costCenter", e.target.value)} disabled={isSaving} />
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Reporting Lines</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="workEmail">Work Email</Label>
                            <Input
                              id="workEmail"
                              type="email"
                              placeholder="name@company.com"
                              value={editData.workEmail}
                              onChange={(e) => handleEditChange("workEmail", e.target.value)}
                              className="h-9 text-sm"
                              disabled={isSaving}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Reporting Manager</Label>
                            <Select
                              value={editData.managerId || "__none__"}
                              onValueChange={(v) => handleEditChange("managerId", v === "__none__" ? "" : v)}
                              disabled={isSaving}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Select manager" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {allEmployees
                                  .filter((e) => e.id !== id)
                                  .map((e) => (
                                    <SelectItem key={e.id} value={e.id}>
                                      {formatEmployeeLegalName(e.first_name, e.last_name)}{e.job_title ? ` · ${e.job_title}` : ""}{e.department ? ` · ${e.department}` : ""}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>HR Partner</Label>
                            <Select
                              value={editData.hrManagerId || "__none__"}
                              onValueChange={(v) => handleEditChange("hrManagerId", v === "__none__" ? "" : v)}
                              disabled={isSaving}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Select HR partner" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {allEmployees
                                  .filter((e) => e.id !== id)
                                  .map((e) => (
                                    <SelectItem key={e.id} value={e.id}>
                                      {formatEmployeeLegalName(e.first_name, e.last_name)}{e.job_title ? ` · ${e.job_title}` : ""}{e.department ? ` · ${e.department}` : ""}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                        <div>
                          <p className="text-xs text-muted-foreground">First Name</p>
                          <p className="font-medium text-foreground">{employee.firstName}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Last Name</p>
                          <p className="font-medium text-foreground">{employee.lastName}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Display Name</p>
                          <p className="font-medium text-foreground">{employee.name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Also known as (pseudonym)</p>
                          <p className="font-medium text-foreground">{employee.nickname || <span className="text-muted-foreground italic">—</span>}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Employee Type</p>
                          <p className="font-medium text-foreground">{employee.employeeType || <span className="text-muted-foreground">-</span>}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Business Unit</p>
                          <p className="font-medium text-foreground">{employee.businessUnit || <span className="text-muted-foreground">-</span>}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Cost Center</p>
                          <p className="font-medium text-foreground">{employee.costCenter || <span className="text-muted-foreground">-</span>}</p>
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <p className="text-xs text-muted-foreground mb-3">Reporting Lines</p>
                        <div className="space-y-4">
                          {(() => {
                            const mgr = empById(employee.managerId);
                            const mgrName = mgr ? formatEmployeeLegalName(mgr.first_name, mgr.last_name) : null;
                            const mgrAvatar = mgr ? `/api/employees/${mgr.id}/avatar` : (mgrName ? `https://ui-avatars.com/api/?name=${encodeURIComponent(mgrName)}` : undefined);
                            return (
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 shrink-0">
                                  {mgrAvatar ? <AvatarImage src={mgrAvatar} alt="" /> : null}
                                  <AvatarFallback>M</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {mgrName || <span className="text-muted-foreground italic">Not assigned</span>}
                                  </p>
                                  {mgr?.job_title && <p className="text-[11px] text-muted-foreground truncate">{mgr.job_title}</p>}
                                  <p className="text-xs text-muted-foreground truncate">Reporting Manager</p>
                                </div>
                              </div>
                            );
                          })()}
                          {(() => {
                            const hrEmp = empByEmail(employee.hrEmail);
                            const hrName = hrEmp ? formatEmployeeLegalName(hrEmp.first_name, hrEmp.last_name) : null;
                            const hrAvatar = hrEmp ? `/api/employees/${hrEmp.id}/avatar` : (hrName ? `https://ui-avatars.com/api/?name=${encodeURIComponent(hrName)}` : (employee.hrEmail ? `https://ui-avatars.com/api/?name=${encodeURIComponent(employee.hrEmail)}` : undefined));
                            return (
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 shrink-0">
                                  {hrAvatar ? <AvatarImage src={hrAvatar} alt="" /> : null}
                                  <AvatarFallback>HR</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {hrName || employee.hrEmail || <span className="text-muted-foreground italic">Not assigned</span>}
                                  </p>
                                  {hrEmp?.job_title && <p className="text-[11px] text-muted-foreground truncate">{hrEmp.job_title}</p>}
                                  <p className="text-xs text-muted-foreground truncate">HR Partner</p>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {canViewSensitive && (
            <>
            <TabsContent value="personal" className="space-y-6">
               <Card className="border border-border shadow-sm bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Personal Details</CardTitle>
                  {!isEditingPersonal ? (
                    <Button variant="ghost" size="sm" onClick={startEditingPersonal}>
                      <Edit2 className="h-4 w-4 mr-2" /> Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setIsEditingPersonal(false)} disabled={isSavingPersonal}>Cancel</Button>
                      <Button size="sm" onClick={handlePersonalSave} disabled={isSavingPersonal}>
                        {isSavingPersonal ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {isEditingPersonal ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="dob">Date of Birth</Label>
                        <Input id="dob" type="date" value={personalData.dob} onChange={(e) => setPersonalData(p => ({ ...p, dob: e.target.value }))} disabled={isSavingPersonal} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gender">Gender</Label>
                        <Select value={personalData.gender} onValueChange={(v) => setPersonalData(p => ({ ...p, gender: v }))} disabled={isSavingPersonal}>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                            <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="marital">Marital Status</Label>
                        <Select value={personalData.maritalStatus} onValueChange={(v) => setPersonalData(p => ({ ...p, maritalStatus: v }))} disabled={isSavingPersonal}>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="single">Single</SelectItem>
                            <SelectItem value="married">Married</SelectItem>
                            <SelectItem value="divorced">Divorced</SelectItem>
                            <SelectItem value="widowed">Widowed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bloodGroup">Blood Group</Label>
                        <Select value={personalData.bloodGroup} onValueChange={(v) => setPersonalData(p => ({ ...p, bloodGroup: v }))} disabled={isSavingPersonal}>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A+">A+</SelectItem>
                            <SelectItem value="A-">A-</SelectItem>
                            <SelectItem value="B+">B+</SelectItem>
                            <SelectItem value="B-">B-</SelectItem>
                            <SelectItem value="O+">O+</SelectItem>
                            <SelectItem value="O-">O-</SelectItem>
                            <SelectItem value="AB+">AB+</SelectItem>
                            <SelectItem value="AB-">AB-</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="personalPhone">Personal phone</Label>
                        <Input
                          id="personalPhone"
                          type="tel"
                          placeholder="Mobile or personal number"
                          value={personalData.personalPhone}
                          onChange={(e) => setPersonalData((p) => ({ ...p, personalPhone: e.target.value }))}
                          disabled={isSavingPersonal}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="personalEmail">Personal Email</Label>
                        <Input id="personalEmail" type="email" value={personalData.personalEmail} onChange={(e) => setPersonalData(p => ({ ...p, personalEmail: e.target.value }))} disabled={isSavingPersonal} />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                      <div>
                        <p className="text-xs text-muted-foreground">Date of Birth</p>
                        <p className="font-medium text-foreground">{formatDateOnly(employee.dob, user?.dateFormat ?? null) || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Gender</p>
                        <p className="font-medium text-foreground capitalize">{employee.gender || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Marital Status</p>
                        <p className="font-medium text-foreground capitalize">{employee.maritalStatus || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Blood Group</p>
                        <p className="font-medium text-foreground">{employee.bloodGroup || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Personal Email</p>
                        <p className="font-medium text-foreground">{employee.personalEmail || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Personal phone</p>
                        <p className="font-medium text-foreground">{employee.personalPhone || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-border shadow-sm bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Home Address</CardTitle>
                  {!isEditingAddress ? (
                    <Button variant="ghost" size="sm" onClick={startEditingAddress}>
                      <Edit2 className="h-4 w-4 mr-2" /> Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setIsEditingAddress(false)} disabled={isSavingAddress}>Cancel</Button>
                      <Button size="sm" onClick={handleAddressSave} disabled={isSavingAddress}>
                        {isSavingAddress ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {isEditingAddress ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="street">Street Address</Label>
                        <Input id="street" value={addressData.street} onChange={(e) => setAddressData(a => ({ ...a, street: e.target.value }))} disabled={isSavingAddress} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input id="city" value={addressData.city} onChange={(e) => setAddressData(a => ({ ...a, city: e.target.value }))} disabled={isSavingAddress} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">State</Label>
                        <Input id="state" value={addressData.state} onChange={(e) => setAddressData(a => ({ ...a, state: e.target.value }))} disabled={isSavingAddress} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="zipCode">Zip Code</Label>
                        <Input id="zipCode" value={addressData.zipCode} onChange={(e) => setAddressData(a => ({ ...a, zipCode: e.target.value }))} disabled={isSavingAddress} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <Input id="country" value={addressData.country} onChange={(e) => setAddressData(a => ({ ...a, country: e.target.value }))} disabled={isSavingAddress} />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Street</p>
                        <p className="font-medium text-foreground">{employee.street || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">City</p>
                        <p className="font-medium text-foreground">{employee.city || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">State</p>
                        <p className="font-medium text-foreground">{employee.state || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Zip Code</p>
                        <p className="font-medium text-foreground">{employee.zipCode || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Country</p>
                        <p className="font-medium text-foreground">{employee.country || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <DependentsEmergencySection employeeId={id} canEdit={canAdminEdit} />

              <Card className="border border-border shadow-sm bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Social Profiles</CardTitle>
                  {!isEditingSocial ? (
                    <Button variant="ghost" size="sm" onClick={() => setIsEditingSocial(true)}>
                      <Edit2 className="h-4 w-4 mr-2" /> Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setIsEditingSocial(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleSocialSave}>Save Changes</Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {isEditingSocial ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       <div className="space-y-2">
                          <Label htmlFor="linkedin" className="flex items-center gap-2"><Globe className="h-3 w-3" /> LinkedIn</Label>
                          <Input id="linkedin" defaultValue="linkedin.com/in/alex" />
                       </div>
                       <div className="space-y-2">
                          <Label htmlFor="github" className="flex items-center gap-2"><Globe className="h-3 w-3" /> GitHub</Label>
                          <Input id="github" defaultValue="github.com/alex" />
                       </div>
                       <div className="space-y-2">
                          <Label htmlFor="portfolio" className="flex items-center gap-2"><Globe className="h-3 w-3" /> Portfolio</Label>
                          <Input id="portfolio" defaultValue="alex.design" />
                       </div>
                    </div>
                  ) : (
                    <div className="flex gap-4">
                      <Button variant="outline" className="flex items-center gap-2">
                        <Globe className="h-4 w-4" /> LinkedIn
                      </Button>
                      <Button variant="outline" className="flex items-center gap-2">
                        <Globe className="h-4 w-4" /> GitHub
                      </Button>
                      <Button variant="outline" className="flex items-center gap-2">
                        <Globe className="h-4 w-4" /> Portfolio
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="job" className="space-y-6">
              <Card className="border border-border shadow-sm bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Employment Details</CardTitle>
                  {isEditingAdmin ? (
                    <Badge variant="outline" className="text-xs font-normal bg-blue-50 text-blue-700 border-blue-200">Admin Editing</Badge>
                  ) : (
                    !canAdminEdit && <Lock className="h-4 w-4 text-muted-foreground opacity-50" />
                  )}
                </CardHeader>
                <CardContent>
                  {isEditingAdmin ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="joinDate">Joining date</Label>
                        <Input id="joinDate" type="date" value={editData.joinDate} onChange={(e) => handleEditChange("joinDate", e.target.value)} disabled={isSaving} />
                      </div>
                       <div className="space-y-2">
                        <Label htmlFor="designation">Designation</Label>
                        <Input id="designation" value={editData.role} onChange={(e) => handleEditChange("role", e.target.value)} disabled={isSaving} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="department">Department</Label>
                        {departments.length > 0 ? (
                          <Select value={editData.department || "__none__"} onValueChange={(v) => handleEditChange("department", v === "__none__" ? "" : v)} disabled={isSaving}>
                            <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Select department</SelectItem>
                              {departments.map((d) => (
                                <SelectItem key={d} value={d}>{d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input id="department" value={editData.department} onChange={(e) => handleEditChange("department", e.target.value)} disabled={isSaving} placeholder="Department" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="grade">Grade</Label>
                        <Select value={editData.grade} onValueChange={(v) => handleEditChange("grade", v)} disabled={isSaving}>
                          <SelectTrigger>
                            <SelectValue placeholder={levels.length ? "Select grade" : "Run org migration first"} />
                          </SelectTrigger>
                          <SelectContent>
                            {levels.map((l) => <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="location">Branch / Location</Label>
                        {branches.length > 0 ? (
                          <Select value={editData.location || "__none__"} onValueChange={(v) => handleEditChange("location", v === "__none__" ? "" : v)} disabled={isSaving}>
                            <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Select branch</SelectItem>
                              {branches.map((b) => (
                                <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input id="location" value={editData.location} onChange={(e) => handleEditChange("location", e.target.value)} disabled={isSaving} placeholder="Branch / location" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="shift">Shift</Label>
                        <Select value={editData.shift} onValueChange={(v) => handleEditChange("shift", v)} disabled={isSaving}>
                          <SelectTrigger>
                            <SelectValue placeholder={shifts.length ? "Select shift" : "Run org migration first"} />
                          </SelectTrigger>
                          <SelectContent>
                            {shifts.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="leaveApprovalTier">Leave Approval</Label>
                        <Select value={editData.leaveApprovalTier} onValueChange={(v) => handleEditChange("leaveApprovalTier", v)} disabled={isSaving}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select approval chain" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">Standard (Manager → HR)</SelectItem>
                            <SelectItem value="three_step">3-Step (Manager → Skip-level → HR)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="primaryTeam">Primary Team</Label>
                        <Select value={editData.primaryTeam} onValueChange={(v) => handleEditChange("primaryTeam", v)} disabled={isSaving}>
                          <SelectTrigger>
                            <SelectValue placeholder={teams.length ? "Select team" : "Run org migration first"} />
                          </SelectTrigger>
                          <SelectContent>
                            {teams.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="workPhoneJob">Work phone</Label>
                        <Input
                          id="workPhoneJob"
                          type="tel"
                          placeholder="Office / work number"
                          value={editData.workPhone}
                          onChange={(e) => handleEditChange("workPhone", e.target.value)}
                          disabled={isSaving}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="probationStart">Probation Start</Label>
                        <Input id="probationStart" type="date" value={editData.probationStartDate} onChange={(e) => handleEditChange("probationStartDate", e.target.value)} disabled={isSaving} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="probationEnd">Probation End</Label>
                        <Input id="probationEnd" type="date" value={editData.probationEndDate} onChange={(e) => handleEditChange("probationEndDate", e.target.value)} disabled={isSaving} />
                      </div>
                       <div className="space-y-2">
                        <Label htmlFor="confirmDate">Confirmation Date</Label>
                        <Input id="confirmDate" type="date" value={editData.confirmationDate} onChange={(e) => handleEditChange("confirmationDate", e.target.value)} disabled={isSaving} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="notice">Notice Period</Label>
                        <Select value={editData.noticePeriod} onValueChange={(v) => handleEditChange("noticePeriod", v)} disabled={isSaving}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select notice" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="15 Days">15 Days</SelectItem>
                            <SelectItem value="30 Days">30 Days</SelectItem>
                            <SelectItem value="60 Days">60 Days</SelectItem>
                            <SelectItem value="90 Days">90 Days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                      <div>
                        <p className="text-xs text-muted-foreground">Joining date</p>
                        <p className="font-medium text-foreground">{formatDateOnly(employee.joinDate, user?.dateFormat ?? null) || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Designation</p>
                        <p className="font-medium text-foreground">{employee.role}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Department</p>
                        <p className="font-medium text-foreground">{employee.department || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Grade</p>
                        <p className="font-medium text-foreground">{employee.grade || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Branch / Location</p>
                        <p className="font-medium text-foreground">{employee.location || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Shift</p>
                        <p className="font-medium text-foreground">{employee.shift || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Leave Approval</p>
                        <p className="font-medium text-foreground">
                          {employee.leaveApprovalTier === "three_step"
                            ? "3-Step (Mgr → Skip-level → HR)"
                            : "Standard (Mgr → HR)"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Primary Team</p>
                        <p className="font-medium text-foreground">{employee.primaryTeam || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Work phone</p>
                        <p className="font-medium text-foreground flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {employee.workPhone || <span className="text-muted-foreground">-</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Probation Start</p>
                        <p className="font-medium text-foreground">{formatDateOnly(employee.probationStartDate, user?.dateFormat ?? null) || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Probation End</p>
                        <p className="font-medium text-foreground">{formatDateOnly(employee.probationEndDate, user?.dateFormat ?? null) || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Confirmation Date</p>
                        <p className="font-medium text-foreground">{formatDateOnly(employee.confirmationDate, user?.dateFormat ?? null) || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                       <div>
                        <p className="text-xs text-muted-foreground">Notice Period</p>
                        <p className="font-medium text-foreground">{employee.noticePeriod || <span className="text-muted-foreground">-</span>}</p>
                      </div>
                      {isOwnProfile && !canAdminEdit && (
                        <div className="col-span-2 mt-2 pt-4 border-t border-border space-y-2">
                          <p className="text-sm font-medium text-foreground">Request work phone change</p>
                          <p className="text-xs text-muted-foreground">Office number updates are sent to HR for approval.</p>
                          <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                            <Input
                              type="tel"
                              value={workPhoneChangeDraft}
                              onChange={(e) => setWorkPhoneChangeDraft(e.target.value)}
                              placeholder="New work number"
                            />
                            <Button type="button" variant="secondary" className="shrink-0" onClick={submitWorkPhoneChangeRequest}>
                              Submit request
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

            </TabsContent>

            <TabsContent value="assets" className="space-y-6">
              <Card className="border border-border shadow-sm bg-card">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <CardTitle className="flex items-center gap-2">
                    <Laptop className="h-5 w-5" />
                    Assigned Systems & Equipment
                  </CardTitle>
                  {canAssignEmployeeAssets && employee && (
                    <Button size="sm" className="gap-2 shrink-0" onClick={() => setAssignAssetOpen(true)}>
                      <Plus className="h-4 w-4" />
                      Add asset
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {assetsLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading assets...
                    </div>
                  ) : assignedAssets.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Monitor className="h-12 w-12 mx-auto mb-3 opacity-40" />
                      <p className="font-medium">No assets assigned</p>
                      <p className="text-sm mt-1">
                        {canAssignEmployeeAssets
                          ? "Assign equipment from stock using Add asset above."
                          : "Equipment will appear here once assigned by IT."}
                      </p>
                      {canAssignEmployeeAssets && employee && (
                        <Button variant="outline" className="mt-4 gap-2" onClick={() => setAssignAssetOpen(true)}>
                          <Plus className="h-4 w-4" />
                          Add asset from stock
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {assignedAssets.map((asset: AssetData) => (
                        <AssetCard
                          key={asset.id}
                          asset={asset}
                          showRemove={canRemoveEmployeeAssets}
                          onRemove={canRemoveEmployeeAssets ? (a) => setAssetToRemove(a) : undefined}
                          removeDisabled={removeAssetMutation.isPending}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {employee && (
                <AssignAssetFromStockDialog
                  open={assignAssetOpen}
                  onClose={() => setAssignAssetOpen(false)}
                  onSuccess={handleAssignAssetSuccess}
                  stockItems={stockForAssign}
                  fixedEmployeeId={employee.id}
                  fixedEmployeeLabel={employeeAssetAssignLabel}
                />
              )}

              <AlertDialog open={!!assetToRemove} onOpenChange={(o) => !o && setAssetToRemove(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove assigned asset?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {assetToRemove
                        ? `This will unassign "${assetToRemove.asset_name || assetToRemove.asset_id}" from ${employeeAssetAssignLabel} and return the unit to stock inventory.`
                        : "This will return the asset to stock."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={removeAssetMutation.isPending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={removeAssetMutation.isPending}
                      onClick={(e) => {
                        e.preventDefault();
                        if (assetToRemove?.id) removeAssetMutation.mutate(assetToRemove.id);
                      }}
                    >
                      {removeAssetMutation.isPending ? "Removing…" : "Remove asset"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Onboarding Items Summary */}
              {employee && (employee.customField1 || employee.customField2) && (
                <Card className="border border-border shadow-sm bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="h-5 w-5" />
                      Onboarding Assignments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {employee.customField1 && (
                        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                            <Key className="h-4 w-4 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Microsoft Account</p>
                            <p className="text-sm font-medium">{employee.customField1.replace("MS Account: ", "")}</p>
                          </div>
                        </div>
                      )}
                      {employee.customField2 && (
                        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                            <Laptop className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Assigned Laptop</p>
                            <p className="text-sm font-medium">{employee.customField2.replace("Laptop: ", "")}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="benefits" className="space-y-6">
              <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Loading benefits...</div>}>
                {employee?.id && (
                  <ProfileBenefitsTab employeeId={employee.id} isOwnProfile={isOwnProfile} />
                )}
              </Suspense>
            </TabsContent>

            {hasLoans && (
              <TabsContent value="loans" className="space-y-6">
                <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Loading loans...</div>}>
                  {employee?.id && (
                    <ProfileLoansTab employeeId={employee.id} isOwnProfile={isOwnProfile} />
                  )}
                </Suspense>
              </TabsContent>
            )}

            <CompensationTab employeeId={employee?.id} canEdit={canAdminEdit} joinDate={employee?.joinDate} />

            <TabsContent value="timeoff" className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">All leave types (Earned Leave, LWOP, Bereavement) are synced with Leave Management. Same data appears on the Leave Calendar.</p>
                {employee?.id && (
                  <Button variant="outline" size="sm" onClick={() => setApplyTimeOffOpen(true)} className="shrink-0">
                    <Plus className="h-4 w-4 mr-2" />
                    {canAdminEdit && !isOwnProfile ? "Apply time off on behalf" : "Apply time off"}
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {leaveBalances.length === 0 ? (
                  <Card className="border border-dashed">
                    <CardContent className="p-6 text-center text-muted-foreground text-sm">
                      No leave types found. Run migration 0021 to create the standard policy.
                    </CardContent>
                  </Card>
                ) : (
                  (() => {
                    const seen = new Set<string>();
                    const deduped = leaveBalances.filter((b: LeaveBalanceCardRow) => {
                      const key = b.leave_type_id ?? b.type_name;
                      if (seen.has(key)) return false;
                      seen.add(key);
                      return true;
                    });
                    return sortLeaveBalancesByDisplayOrder(deduped).map((b) => {
                    const isUnpaid = b.paid === false;
                    const bal = roundBalanceDisplay(parseFloat(String(b.balance)));
                    const used = roundBalanceDisplay(parseFloat(String(b.used)));
                    const max = b.max_balance || 1;
                    const pct = max > 0 && !isUnpaid ? Math.round((bal / max) * 100) : 0;
                    return (
                      <Card key={b.id ?? b.leave_type_id ?? b.type_name} className="border-l-4 shadow-sm" style={{ borderLeftColor: b.color || "#3b82f6" }}>
                        <CardContent className="p-6">
                          <p className="text-xs font-bold text-slate-500 uppercase">{b.type_name}</p>
                          {isUnpaid ? (
                            <div className="mt-2">
                              <h3 className="text-2xl font-bold text-slate-900">Unlimited</h3>
                              <p className="text-sm text-slate-500 mt-1">Unpaid leave (LWOP)</p>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-end gap-2 mt-2">
                                <h3 className="text-3xl font-bold text-slate-900">{formatBalanceDays(bal)}</h3>
                                <span className="text-sm text-slate-500 mb-1">/ {max} days</span>
                              </div>
                              <Progress value={pct} className="h-1.5 mt-3 bg-slate-100" />
                            </>
                          )}
                        </CardContent>
                      </Card>
                    );
                  });
                  })()
                )}
              </div>

              <Card className="border border-border shadow-sm flex flex-col max-h-[min(28rem,55vh)]">
                <CardHeader className="shrink-0 pb-3">
                  <CardTitle>Recent Leave History</CardTitle>
                  <CardDescription>
                    Synced with Leave Calendar.
                    {leaveRequests.length > 0 ? ` ${leaveRequests.length} request${leaveRequests.length === 1 ? "" : "s"}.` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-y-auto min-h-0 flex-1 pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 z-10 bg-card hover:bg-card">
                        <TableHead>Type</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaveRequests.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No leave requests yet.</TableCell>
                        </TableRow>
                      ) : (
                        leaveRequests.map((r: { id: string; type_name: string; start_date: string; end_date: string; total_days: string; day_type?: string; status: string }) => {
                          const tz = user?.timeZone ?? null;
                          const df = user?.dateFormat ?? null;
                          const sd = formatLeaveDisplayDate(r.start_date, tz, df);
                          const ed = formatLeaveDisplayDate(r.end_date, tz, df);
                          return (
                          <TableRow
                            key={r.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setSelectedLeaveRequestId(r.id)}
                          >
                            <TableCell className="font-medium">{r.type_name}</TableCell>
                            <TableCell>{sd === ed ? sd : `${sd} – ${ed}`}</TableCell>
                            <TableCell>{formatLeaveDurationSummary(r.total_days, r.day_type)}</TableCell>
                            <TableCell>
                              <Badge className={r.status === "approved" ? "bg-green-100 text-green-700 hover:bg-green-100" : r.status === "rejected" ? "bg-red-100 text-red-700 hover:bg-red-100" : r.status === "pending" ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-100" : "bg-slate-100 text-slate-600 hover:bg-slate-100"}>
                                {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="timeline" className="space-y-6">
              <Card className="border border-border shadow-sm">
                <CardHeader>
                  <CardTitle>Employee Timeline</CardTitle>
                  <CardDescription>
                    Join dates, compensation, onboarding, profile edits (Overview, Personal, Work), asset assignments, files, and exit milestones. Refreshes when you save those tabs or assign assets.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {timelineLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading timeline...
                    </div>
                  ) : timelineEvents.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                      No timeline events yet. Join date and other milestones will appear as data is added.
                    </div>
                  ) : (
                    <div className="relative border-l border-border ml-3 space-y-8 pl-8 pb-4">
                      {timelineEvents.map((event, i) => {
                        const iconAndColor = getTimelineIconAndColor(event.type);
                        return (
                          <div key={i} className="relative">
                            <div className={`absolute -left-[41px] top-0 h-6 w-6 rounded-full border-2 border-background ${iconAndColor.color} flex items-center justify-center text-white shadow-sm`}>
                              <iconAndColor.Icon className="h-3 w-3" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-medium text-muted-foreground">{formatDateOnly(event.date, user?.dateFormat ?? null) ?? formatDisplayDate(event.date) ?? event.date}</span>
                              <h4 className="font-semibold text-foreground text-sm">{event.title}</h4>
                              <p className="text-sm text-muted-foreground">{event.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="space-y-6">
              <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Loading files...</div>}>
                <ProfileDocumentsTab employeeId={employee.id} canAdminEdit={canAdminEdit} />
              </Suspense>
            </TabsContent>

            {hasExitDetails && (
              <TabsContent value="exit" className="space-y-6">
                <Suspense fallback={null}>
                  <ProfileExitTab
                    employee={employee}
                    isEditing={canAdminEdit && isEditingAdmin}
                    editData={editData}
                    onEditChange={handleEditChange}
                    isSaving={isSaving}
                  />
                </Suspense>
              </TabsContent>
            )}
            </>
            )}
          </Tabs>
        </div>
      </div>
      {employee?.id && (
        <ApplyLeaveDialog
          open={applyTimeOffOpen}
          onClose={() => setApplyTimeOffOpen(false)}
          employeeId={employee.id}
          submitForEmployeeId={canAdminEdit && !isOwnProfile ? employee.id : undefined}
        />
      )}

      <Dialog open={!!selectedLeaveRequestId} onOpenChange={(open) => !open && setSelectedLeaveRequestId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="flex flex-row items-center justify-between gap-2">
            <DialogTitle>Time Off Request</DialogTitle>
            {leaveRequestDetail && (
              <Badge className={`text-xs border shrink-0 ${leaveStatusStyle[leaveRequestDetail.status] ?? ""}`}>
                {leaveRequestDetail.status}
              </Badge>
            )}
          </DialogHeader>
          {leaveRequestDetail && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-2xl font-semibold text-muted-foreground">{leaveRequestDetail.total_days} Day{leaveRequestDetail.total_days !== "1" ? "s" : ""}</span>
                  <span className="text-sm">
                    {formatLeaveDisplayDate(leaveRequestDetail.start_date, user?.timeZone ?? null, user?.dateFormat ?? null)}
                    {leaveRequestDetail.start_date !== leaveRequestDetail.end_date ? ` – ${formatLeaveDisplayDate(leaveRequestDetail.end_date, user?.timeZone ?? null, user?.dateFormat ?? null)}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: leaveRequestDetail.color }} />
                  <span className="text-sm font-medium">{leaveRequestDetail.type_name}</span>
                </div>
                {leaveRequestDetail.reason && (
                  <div className="pt-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Comments</p>
                    <p className="text-sm mt-0.5">{leaveRequestDetail.reason}</p>
                  </div>
                )}
              </div>
              <div className="text-sm space-y-1.5 text-muted-foreground">
                <p>Applied on {formatAppliedAtForEmployee(leaveRequestDetail.applied_at, (leaveRequestDetail as { employee_branch_tz?: string }).employee_branch_tz, (leaveRequestDetail as { employee_branch_df?: string }).employee_branch_df, user?.timeZone ?? null, user?.dateFormat ?? null)}</p>
                {leaveRequestDetail.status === "approved" && leaveRequestDetail.decided_at && (
                  <p>
                    {leaveRequestDetail.decided_by === "auto"
                      ? `Approved (auto) on ${fmtLeaveDateTime(leaveRequestDetail.decided_at, user?.timeZone ?? null, user?.dateFormat ?? null)}`
                      : `Approved by ${[leaveRequestDetail.decided_by_first_name, leaveRequestDetail.decided_by_last_name].filter(Boolean).join(" ") || "-"} on ${fmtLeaveDateTime(leaveRequestDetail.decided_at, user?.timeZone ?? null, user?.dateFormat ?? null)}`}
                  </p>
                )}
                {leaveRequestDetail.status === "rejected" && leaveRequestDetail.decided_at && (
                  <p>
                    Rejected by {[leaveRequestDetail.decided_by_first_name, leaveRequestDetail.decided_by_last_name].filter(Boolean).join(" ") || "-"} on {fmtLeaveDateTime(leaveRequestDetail.decided_at, user?.timeZone ?? null, user?.dateFormat ?? null)}
                    {leaveRequestDetail.rejection_reason && ` — ${leaveRequestDetail.rejection_reason}`}
                  </p>
                )}
              </div>
              {canAdminEdit && (
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    disabled={deleteLeaveRequestMutation.isPending}
                    onClick={() => {
                      if (window.confirm("Permanently delete this leave request? This cannot be undone.")) {
                        deleteLeaveRequestMutation.mutate(leaveRequestDetail.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deleteLeaveRequestMutation.isPending ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function FileTextIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  )
}