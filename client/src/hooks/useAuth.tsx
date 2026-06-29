import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";

export type Role =
  | "admin" | "hr" | "limited_hr" | "manager" | "employee" | "it"
  | "recruiter" | "hiring_manager" | "onboarding_specialist" | "limited_recruiter";

export const ALL_ROLES: Role[] = [
  "admin", "hr", "limited_hr", "manager", "employee", "it",
  "recruiter", "hiring_manager", "onboarding_specialist", "limited_recruiter",
];

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  /** Computed on the server — single source of truth for sidebar & permissions. */
  effectiveRole?: Role;
  /**
   * Full resolved roles array: [effectiveRole, ...additionalRoles].
   * Use this for permission checks — a user can have multiple roles simultaneously.
   */
  roles?: Role[];
  employeeId: string | null;
  /** When non-empty, only these module keys are shown in the sidebar. Empty = use role-based access. */
  allowedModules?: string[];
  firstName?: string;
  lastName?: string;
  nickname?: string | null;
  avatar?: string;
  /** IANA timezone from employee branch (fallback: server default). Drives "today", leave, attendance. */
  timeZone?: string | null;
  /** Branch date display pattern, e.g. dd/MM/yyyy, MM/dd/yyyy */
  dateFormat?: string | null;
  /** Multi-region access control region: 'PK' | 'US' | 'IN-N' | 'IN-S' | null. */
  regionCode?: RegionCode | null;
  /** Pakistan Super Region admin — sees/edits across all regions. */
  isSuperRegionAdmin?: boolean;
  /** True when this user’s email matches server BREAK_GLASS_PRIMARY_EMAIL (or default). */
  isBreakGlassAccount?: boolean;
}

/** Region keys for multi-region access control (mirrors server RegionCode). */
export type RegionCode = "PK" | "US" | "IN-N" | "IN-S";

/** Friendly labels for region badges. */
export const REGION_LABELS: Record<RegionCode, string> = {
  PK: "Pakistan",
  US: "United States",
  "IN-N": "India — North",
  "IN-S": "India — South",
};

/** Break-glass baseline admin (env BREAK_GLASS_PRIMARY_EMAIL; default ehire@ldplogistics.com). */
export type BreakGlassLoginPending = "password_change" | "totp_enroll" | "totp_verify";

export type LoginResult =
  | { status: "complete" }
  | { status: "break_glass"; pending: BreakGlassLoginPending; tempToken: string };

export function parseApiError(data: unknown): string {
  if (!data || typeof data !== "object") return "Request failed";
  const d = data as { error?: string | { message?: string } };
  if (typeof d.error === "string") return d.error;
  if (d.error && typeof d.error === "object" && typeof d.error.message === "string") return d.error.message;
  return "Request failed";
}

/** Union of effectiveRole, stored role, and roles[] — users can hold multiple grants (e.g. admin + hr). */
export function buildUserRolesSet(user: AuthUser | null, effectiveRole: Role): Set<Role> {
  const set = new Set<Role>();
  if (!user) return set;
  set.add(effectiveRole);
  if (user.role && (ALL_ROLES as readonly string[]).includes(user.role)) {
    set.add(user.role);
  }
  if (Array.isArray(user.roles)) {
    for (const r of user.roles) {
      if ((ALL_ROLES as readonly string[]).includes(r)) set.add(r);
    }
  }
  return set;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
  isHR: boolean;
  isLimitedHR: boolean;
  isManager: boolean;
  isEmployee: boolean;
  isIT: boolean;
  isRecruiter: boolean;
  isHiringManager: boolean;
  isOnboardingSpecialist: boolean;
  isLimitedRecruiter: boolean;
  /** True if user has any recruitment-related role (recruiter, hiring_manager, limited_recruiter, or admin/hr). */
  canAccessRecruitment: boolean;
  /** Edit/cancel/remind/no-show on scheduled interviews (any matching grant; multiple roles OK). */
  canManageRecruitmentInterviews: boolean;
  /** True if user has any onboarding-related role (onboarding_specialist, or admin/hr). */
  canAccessOnboarding: boolean;
  /** The role used for sidebar & permission checks (effectiveRole > role). */
  effectiveRole: Role;
  /** True when email matches server BREAK_GLASS_PRIMARY_EMAIL — FreshTeam migration tools. */
  isBreakGlassAccount: boolean;
  canEditEmployee: (employeeId: string) => boolean;
  /** User's region (null = unassigned / super region). */
  regionCode: RegionCode | null;
  /** Pakistan Super Region admin — cross-region access. */
  isSuperRegionAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  // Fetch current user on mount
  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  async function refreshUser() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }

  async function login(email: string, password: string): Promise<LoginResult> {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(parseApiError(data));
    }

    if (data.pending && data.tempToken) {
      return {
        status: "break_glass",
        pending: data.pending as BreakGlassLoginPending,
        tempToken: String(data.tempToken),
      };
    }

    await refreshUser();
    return { status: "complete" };
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setUser(null);
      setLocation("/login");
    }
  }

  // Use effectiveRole when present (server-resolved), fall back to role
  const effectiveRole: Role = (user?.effectiveRole ?? user?.role ?? "employee") as Role;

  // Union effectiveRole + stored role + roles[] so admin+hr (or any combo) never hides UI incorrectly.
  const rolesSet = buildUserRolesSet(user, effectiveRole);
  const isAdmin               = rolesSet.has("admin");
  const isHR                  = rolesSet.has("hr");
  const isLimitedHR           = rolesSet.has("limited_hr") && !isHR && !isAdmin;
  const isManager             = effectiveRole === "manager" || rolesSet.has("manager");
  const isEmployee            = effectiveRole === "employee" && !isAdmin && !isHR && !isManager;
  const isIT                  = rolesSet.has("it");
  const isRecruiter           = rolesSet.has("recruiter");
  const isHiringManager       = rolesSet.has("hiring_manager");
  const isOnboardingSpecialist = rolesSet.has("onboarding_specialist");
  const isLimitedRecruiter    = rolesSet.has("limited_recruiter") && !isRecruiter && !isAdmin && !isHR;
  const canAccessRecruitment  = isAdmin || isHR || isRecruiter || isHiringManager || isLimitedRecruiter || isManager;
  const canManageRecruitmentInterviews = isAdmin || isHR || isRecruiter || isLimitedRecruiter;
  const canAccessOnboarding   = isAdmin || isHR || isOnboardingSpecialist || isManager;
  const isBreakGlassAccount   = user?.isBreakGlassAccount === true;
  const regionCode            = (user?.regionCode ?? null) as RegionCode | null;
  /** Server flag, PK Admin auto-super, or break-glass primary admin (ehire). */
  const isSuperRegionAdmin    =
    user?.isSuperRegionAdmin === true ||
    isBreakGlassAccount ||
    (isAdmin && regionCode === "PK");

  // Check if current user can edit a specific employee
  function canEditEmployee(employeeId: string): boolean {
    if (!user) return false;
    if (isAdmin || isHR) return true;
    return user.employeeId === employeeId;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser,
        isAdmin,
        isHR,
        isLimitedHR,
        isManager,
        isEmployee,
        isIT,
        isRecruiter,
        isHiringManager,
        isOnboardingSpecialist,
        isLimitedRecruiter,
        canAccessRecruitment,
        canManageRecruitmentInterviews,
        canAccessOnboarding,
        effectiveRole,
        isBreakGlassAccount,
        canEditEmployee,
        regionCode,
        isSuperRegionAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Helper hook for protected routes
export function useRequireAuth(redirectTo = "/login") {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation(redirectTo);
    }
  }, [user, loading, setLocation, redirectTo]);

  return { user, loading };
}
