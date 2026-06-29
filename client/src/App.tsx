import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { isBreakGlassDeveloper, isNavModuleVisible, canAccessAuditLogs } from "@shared/navModuleCatalog";
import { useNotificationSSE } from "@/hooks/useNotificationSSE";
import { BreadcrumbProvider } from "@/contexts/BreadcrumbContext";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Employees from "@/pages/Employees";
import MyTeams from "@/pages/MyTeams";
import { useEffect } from "react";

import Recruitment from "@/pages/Recruitment";
import RecruitmentHome from "@/pages/recruitment/RecruitmentHome";
import CandidateProfile from "@/pages/CandidateProfile";
import CreateJobPosting from "@/pages/recruitment/CreateJobPosting";
import JobDetailPage from "@/pages/recruitment/JobDetailPage";
import ScheduleInterviewPage from "@/pages/recruitment/ScheduleInterviewPage";
import ApplicationFormBuilderPage from "@/pages/settings/ApplicationFormBuilderPage";
import OrgChart from "@/pages/OrgChart";
import Payroll from "@/pages/Payroll";
import Performance from "@/pages/Performance";
import LeaveCalendar from "@/pages/LeaveCalendar";
import Leave from "@/pages/Leave";
import LeaveAdmin from "@/pages/LeaveAdmin";
import NewsFeed from "@/pages/NewsFeed";
import EmployeeProfile from "@/pages/EmployeeProfile";
import Payslips from "@/pages/Payslips";
import Settings from "@/pages/Settings";
import LeaveSettingsPage from "@/pages/settings/LeaveSettingsPage";
import TimezoneSettingsPage from "@/pages/settings/TimezoneSettingsPage";
import AccessControlPage from "@/pages/settings/AccessControlPage";
import TimesheetPolicySettingsPage from "@/pages/settings/TimesheetPolicySettingsPage";
import EmailNotificationsSettingsPage from "@/pages/settings/EmailNotificationsSettingsPage";
import EmployeeProfileBannerSettingsPage from "@/pages/settings/EmployeeProfileBannerSettingsPage";
import BreakGlassAuthenticatorPage from "@/pages/settings/BreakGlassAuthenticatorPage";
import OrgStructure from "@/pages/OrgStructure";
import Onboarding from "@/pages/Onboarding";
import OnboardingInitiate from "@/pages/OnboardingInitiate";
import OnboardingTemplates from "@/pages/OnboardingTemplates";
import Expenses from "@/pages/Expenses";
import Tasks from "@/pages/Tasks";
import Rooms from "@/pages/Rooms";
import Surveys from "@/pages/Surveys";
import Succession from "@/pages/Succession";
import Training from "@/pages/Training";
import Kudos from "@/pages/Kudos";
import Compliance from "@/pages/Compliance";
import Benefits from "@/pages/Benefits";
import Visitors from "@/pages/Visitors";
import Salary from "@/pages/Salary";
import Audit from "@/pages/Audit";
import Emergency from "@/pages/Emergency";
import Timezone from "@/pages/Timezone";
import Shifts from "@/pages/Shifts";
import Diversity from "@/pages/Diversity";
import SystemHealth from "@/pages/SystemHealth";
import Assets from "@/pages/Assets";
import AssetProfile from "@/pages/AssetProfile";
import AssetViewPublic from "@/pages/AssetViewPublic";
import ITSupport from "@/pages/ITSupport";
import Goals from "@/pages/Goals";
import Offboarding from "@/pages/Offboarding";
import Timesheets from "@/pages/Timesheets";
import Loans from "@/pages/Loans";
import ProjectTracking from "@/pages/ProjectTracking";
import Whistleblower from "@/pages/Whistleblower";
import CareerSite from "@/pages/CareerSite";
import KnowledgeBase from "@/pages/KnowledgeBase";
import ArticleView from "@/pages/ArticleView";
import SoftwareGuide from "@/pages/SoftwareGuide";
import { canSeeSoftwareGuide, SOFTWARE_GUIDE_ROLES } from "@/lib/softwareGuideAccess";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import OfferResponse from "@/pages/OfferResponse";
import OfferTemplatesSettingsPage from "@/pages/settings/OfferTemplatesSettingsPage";
import RecruitmentSettingsPage from "@/pages/settings/RecruitmentSettingsPage";
import OfferSign from "@/pages/OfferSign";
import ChangeRequests from "@/pages/ChangeRequests";

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;
  return <>{children}</>;
}

/**
 * Route-level role guard. Prevents navigating to restricted pages via direct URL.
 * Checks effectiveRole and allowedModules (mirrors sidebar visibility logic).
 * When allowAssigneeModules is set, also allows access if user is an assignee for that module.
 */
type RoleGuardProps = {
  /** Module key matching the sidebar href without leading slash (e.g. "recruitment") */
  moduleKey: string;
  /** Roles that may access this route when allowedModules is empty (role-based fallback) */
  roles?: string[];
  /** Module keys that are also accessible when user is an assignee (e.g. "offboarding", "onboarding") */
  allowAssigneeModules?: string[];
  children: React.ReactNode;
};

function RoleGuard({ moduleKey, roles, allowAssigneeModules, children }: RoleGuardProps) {
  const { user, effectiveRole, isSuperRegionAdmin } = useAuth();
  const [, setLocation] = useLocation();

  const needsNavApi =
    !!user &&
    (moduleKey === "recruitment" ||
      moduleKey === "onboarding" ||
      moduleKey === "offboarding" ||
      (!!allowAssigneeModules?.length && allowAssigneeModules.includes(moduleKey)));

  const { data: navVisibility, isLoading: navLoading } = useQuery<{
    showOnboardingAsAssignee: boolean;
    showOffboardingAsAssignee: boolean;
    showRecruitmentNav: boolean;
    showOnboardingNav: boolean;
    showOffboardingNav: boolean;
  }>({
    queryKey: ["/api/auth/assignment-visibility"],
    queryFn: async () => {
      const res = await fetch("/api/auth/assignment-visibility", { credentials: "include" });
      if (!res.ok) {
        return {
          showOnboardingAsAssignee: false,
          showOffboardingAsAssignee: false,
          showRecruitmentNav: false,
          showOnboardingNav: false,
          showOffboardingNav: false,
        };
      }
      return res.json();
    },
    enabled: needsNavApi,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const allowedByAssignee =
    allowAssigneeModules?.includes(moduleKey) &&
    ((moduleKey === "onboarding" && navVisibility?.showOnboardingAsAssignee) ||
      (moduleKey === "offboarding" && navVisibility?.showOffboardingAsAssignee));

  if (!user) return null;

  if (moduleKey === "audit" && !canAccessAuditLogs(user)) {
    setLocation("/dashboard");
    return null;
  }

  // Break-glass developer account: unrestricted route access (full product surface).
  if (isBreakGlassDeveloper(user)) {
    return <>{children}</>;
  }

  // Hide prototype / non-production modules from everyone else (sidebar + direct URL).
  if (!isNavModuleVisible(moduleKey, user)) {
    console.warn(`[rbac] RoleGuard: user ${user.email} blocked from prototype module /${moduleKey}`);
    setLocation("/dashboard");
    return null;
  }

  if (needsNavApi && navLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // 1. Explicit module list takes priority (assignee can still add onboarding/offboarding)
  if (user.allowedModules && user.allowedModules.length > 0) {
    const allowed =
      user.allowedModules.includes(moduleKey) ||
      moduleKey === "dashboard" ||
      moduleKey === "settings" ||
      (moduleKey === "software-guide" && canSeeSoftwareGuide(user, effectiveRole)) ||
      (moduleKey === "benefits" && !!user.employeeId) ||
      allowedByAssignee;
    if (!allowed) {
      console.warn(`[rbac] RoleGuard: user ${user.email} attempted to access /${moduleKey} without module permission`);
      setLocation("/dashboard");
      return null;
    }
    return <>{children}</>;
  }

  // 2. Primary modules: job assignment, org-wide recruit, HR roles, assignees (same as sidebar)
  if (moduleKey === "recruitment" && navVisibility && !navVisibility.showRecruitmentNav) {
    console.warn(`[rbac] RoleGuard: user ${user.email} blocked from /recruitment`);
    setLocation("/dashboard");
    return null;
  }
  if (moduleKey === "onboarding" && navVisibility && !navVisibility.showOnboardingNav) {
    console.warn(`[rbac] RoleGuard: user ${user.email} blocked from /onboarding`);
    setLocation("/dashboard");
    return null;
  }
  if (moduleKey === "offboarding" && navVisibility && !navVisibility.showOffboardingNav) {
    console.warn(`[rbac] RoleGuard: user ${user.email} blocked from /offboarding`);
    setLocation("/dashboard");
    return null;
  }

  // 3. Role-based access (or assignee access for allowAssigneeModules routes)
  if (moduleKey === "benefits" && user.employeeId) {
    return <>{children}</>;
  }
  if (roles && !allowedByAssignee) {
    const userRoles = user.roles ?? [effectiveRole];
    const hasAccess = userRoles.some((r) => roles.includes(r));
    if (!hasAccess) {
      console.warn(`[rbac] RoleGuard: user ${user.email} (${effectiveRole}) attempted to access /${moduleKey}, requires ${roles.join("|")}`);
      setLocation("/dashboard");
      return null;
    }
  }

  return <>{children}</>;
}

// Redirect component to handle root path
function RedirectHome() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/dashboard");
  }, [setLocation]);
  return null;
}

/** SSE: real-time leave/notification refresh for all logged-in users. */
function RealtimeSync() {
  useNotificationSSE();
  return null;
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/careers" component={CareerSite} />
      <Route path="/offer-response/:token" component={OfferResponse} />
      <Route path="/offer-sign/:token" component={OfferSign} />
      <Route path="/assets/view/:assetId" component={AssetViewPublic} />
      
      {/* Protected routes */}
      <Route path="/">
        <ProtectedRoute><RedirectHome /></ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/news">
        <ProtectedRoute><NewsFeed /></ProtectedRoute>
      </Route>
      <Route path="/employees">
        <ProtectedRoute><Employees /></ProtectedRoute>
      </Route>
      <Route path="/my-teams">
        <ProtectedRoute>
          <RoleGuard moduleKey="my-teams" roles={["admin", "hr", "manager", "employee", "it"]}>
            <MyTeams />
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      <Route path="/employees/:id/compensation">
        {(params) => <Redirect to={`/employees/${params.id}?tab=compensation`} />}
      </Route>
      <Route path="/employees/:id">
        {(params) => <ProtectedRoute><EmployeeProfile /></ProtectedRoute>}
      </Route>
      <Route path="/change-requests">
        <ProtectedRoute><ChangeRequests /></ProtectedRoute>
      </Route>
      <Route path="/recruitment">
        <ProtectedRoute><RoleGuard moduleKey="recruitment" roles={["admin", "hr", "limited_hr", "manager", "recruiter", "hiring_manager", "limited_recruiter", "employee", "it"]}><RecruitmentHome /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/recruitment/jobs/new">
        <ProtectedRoute><RoleGuard moduleKey="recruitment" roles={["admin", "hr", "recruiter"]}><CreateJobPosting /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/recruitment/jobs/:id/edit">
        {() => <ProtectedRoute><RoleGuard moduleKey="recruitment" roles={["admin", "hr", "recruiter"]}><CreateJobPosting /></RoleGuard></ProtectedRoute>}
      </Route>
      <Route path="/recruitment/jobs/:id">
        {() => <ProtectedRoute><RoleGuard moduleKey="recruitment" roles={["admin", "hr", "recruiter", "manager", "hiring_manager", "limited_recruiter", "employee", "it"]}><JobDetailPage /></RoleGuard></ProtectedRoute>}
      </Route>
      <Route path="/recruitment/jobs">
        <ProtectedRoute><RoleGuard moduleKey="recruitment" roles={["admin", "hr", "limited_hr", "manager", "recruiter", "hiring_manager", "limited_recruiter", "employee", "it"]}><Recruitment forcedTab="jobs" /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/recruitment/talent-pool">
        <ProtectedRoute><RoleGuard moduleKey="recruitment" roles={["admin", "hr", "limited_hr", "manager", "recruiter", "hiring_manager", "limited_recruiter", "employee", "it"]}><Recruitment forcedTab="candidates" /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/recruitment/applications/:appId/schedule-interview">
        {() => <ProtectedRoute><RoleGuard moduleKey="recruitment" roles={["admin", "hr", "recruiter", "limited_recruiter", "hiring_manager"]}><ScheduleInterviewPage /></RoleGuard></ProtectedRoute>}
      </Route>
      <Route path="/recruitment/candidates/:id">
        <ProtectedRoute><RoleGuard moduleKey="recruitment" roles={["admin", "hr", "limited_hr", "manager", "recruiter", "hiring_manager", "limited_recruiter", "employee", "it"]}><CandidateProfile /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/onboarding">
        <ProtectedRoute><RoleGuard moduleKey="onboarding" roles={["admin", "hr", "limited_hr", "manager", "employee", "onboarding_specialist"]}><Onboarding /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/onboarding/initiate/:employeeId">
        {() => <ProtectedRoute><RoleGuard moduleKey="onboarding" roles={["admin", "hr", "onboarding_specialist"]}><OnboardingInitiate /></RoleGuard></ProtectedRoute>}
      </Route>
      <Route path="/settings/onboarding-templates">
        <ProtectedRoute><RoleGuard moduleKey="onboarding" roles={["admin", "hr"]}><OnboardingTemplates /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/onboarding-templates">
        <Redirect to="/settings/onboarding-templates" />
      </Route>
      <Route path="/offboarding">
        <ProtectedRoute><RoleGuard moduleKey="offboarding" roles={["admin", "hr", "limited_hr"]} allowAssigneeModules={["offboarding"]}><Offboarding /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/goals">
        <ProtectedRoute><RoleGuard moduleKey="goals" roles={["admin", "hr", "manager", "it"]}><Goals /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/surveys">
        <ProtectedRoute><RoleGuard moduleKey="surveys" roles={["admin", "hr", "manager", "it"]}><Surveys /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/diversity">
        <ProtectedRoute><RoleGuard moduleKey="diversity" roles={["admin", "hr"]}><Diversity /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/assets">
        <ProtectedRoute><RoleGuard moduleKey="assets" roles={["admin", "it"]}><Assets /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/assets/:id">
        {(params) => <ProtectedRoute><RoleGuard moduleKey="assets" roles={["admin", "it"]}><AssetProfile /></RoleGuard></ProtectedRoute>}
      </Route>
      <Route path="/expenses">
        <ProtectedRoute><RoleGuard moduleKey="expenses" roles={["admin", "hr", "manager", "it"]}><Expenses /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/tasks">
        <ProtectedRoute><Tasks /></ProtectedRoute>
      </Route>
      <Route path="/rooms">
        <ProtectedRoute><RoleGuard moduleKey="rooms"><Rooms /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/shifts">
        <ProtectedRoute><Shifts /></ProtectedRoute>
      </Route>
      <Route path="/timesheets">
        <ProtectedRoute><Timesheets /></ProtectedRoute>
      </Route>
      <Route path="/loans">
        <ProtectedRoute><Loans /></ProtectedRoute>
      </Route>
      <Route path="/project-tracking">
        <ProtectedRoute><RoleGuard moduleKey="project-tracking"><ProjectTracking /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/training">
        <ProtectedRoute><RoleGuard moduleKey="training" roles={["admin", "hr", "manager", "it"]}><Training /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/kudos">
        <ProtectedRoute><RoleGuard moduleKey="kudos" roles={["admin", "hr", "manager", "it"]}><Kudos /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/succession">
        <ProtectedRoute><RoleGuard moduleKey="succession" roles={["admin", "hr", "manager"]}><Succession /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/compliance">
        <ProtectedRoute><RoleGuard moduleKey="compliance" roles={["admin", "hr"]}><Compliance /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/whistleblower">
        <ProtectedRoute><RoleGuard moduleKey="whistleblower" roles={["admin", "hr", "manager", "it"]}><Whistleblower /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/it-support">
        <ProtectedRoute><ITSupport /></ProtectedRoute>
      </Route>
      <Route path="/software-guide">
        <ProtectedRoute>
          <RoleGuard moduleKey="software-guide" roles={[...SOFTWARE_GUIDE_ROLES]}>
            <SoftwareGuide />
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      <Route path="/help-center">
        <ProtectedRoute><RoleGuard moduleKey="help-center"><KnowledgeBase /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/help-center/article/:slug">
        <ProtectedRoute><RoleGuard moduleKey="help-center"><ArticleView /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/benefits">
        <ProtectedRoute><RoleGuard moduleKey="benefits" roles={["admin", "hr", "limited_hr", "manager", "employee", "it"]}><Benefits /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/visitors">
        <ProtectedRoute><RoleGuard moduleKey="visitors" roles={["admin", "hr", "manager"]}><Visitors /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/salary">
        <ProtectedRoute><RoleGuard moduleKey="salary" roles={["admin", "hr"]}><Salary /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/audit">
        <ProtectedRoute><RoleGuard moduleKey="audit"><Audit /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/emergency">
        <ProtectedRoute><RoleGuard moduleKey="emergency"><Emergency /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/timezones">
        <ProtectedRoute><Timezone /></ProtectedRoute>
      </Route>
      <Route path="/health">
        <ProtectedRoute><RoleGuard moduleKey="health" roles={["admin"]}><SystemHealth /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/org-chart">
        <ProtectedRoute><OrgChart /></ProtectedRoute>
      </Route>
      <Route path="/leave">
        <ProtectedRoute><LeaveCalendar /></ProtectedRoute>
      </Route>
      <Route path="/leave/employee">
        <ProtectedRoute><Leave /></ProtectedRoute>
      </Route>
      <Route path="/leave/admin">
        <ProtectedRoute><LeaveAdmin /></ProtectedRoute>
      </Route>
      <Route path="/performance">
        <ProtectedRoute><RoleGuard moduleKey="performance" roles={["admin", "hr", "manager", "it"]}><Performance /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/payroll">
        <ProtectedRoute><RoleGuard moduleKey="payroll" roles={["admin", "hr"]}><Payroll /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/payslips">
        <ProtectedRoute><RoleGuard moduleKey="payslips"><Payslips /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/settings/timezone">
        <ProtectedRoute><TimezoneSettingsPage /></ProtectedRoute>
      </Route>
      <Route path="/settings/break-glass-authenticator">
        <ProtectedRoute>
          <BreakGlassAuthenticatorPage />
        </ProtectedRoute>
      </Route>
      <Route path="/settings/access-control">
        <ProtectedRoute><RoleGuard moduleKey="settings" roles={["admin"]}><AccessControlPage /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/settings/user-access">
        <Redirect to="/settings/access-control" />
      </Route>
      <Route path="/settings/multi-region">
        <Redirect to="/settings/access-control" />
      </Route>
      <Route path="/settings/timesheet-policy">
        <ProtectedRoute><RoleGuard moduleKey="settings" roles={["admin", "hr"]}><TimesheetPolicySettingsPage /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/settings/email-notifications">
        <ProtectedRoute><RoleGuard moduleKey="settings" roles={["admin", "hr"]}><EmailNotificationsSettingsPage /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/settings/employee-profile-banner">
        <ProtectedRoute>
          <RoleGuard moduleKey="settings" roles={["admin", "hr", "limited_hr"]}>
            <EmployeeProfileBannerSettingsPage />
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute><Settings /></ProtectedRoute>
      </Route>
      <Route path="/settings/org-structure">
        <ProtectedRoute><RoleGuard moduleKey="settings" roles={["admin", "hr"]}><OrgStructure /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/settings/leave">
        <ProtectedRoute><RoleGuard moduleKey="settings" roles={["admin", "hr"]}><LeaveSettingsPage /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/settings/offer-templates">
        <ProtectedRoute><RoleGuard moduleKey="settings" roles={["admin", "hr"]}><OfferTemplatesSettingsPage /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/settings/application-form">
        <ProtectedRoute><RoleGuard moduleKey="settings" roles={["admin", "hr"]}><ApplicationFormBuilderPage /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/settings/recruitment">
        <ProtectedRoute><RoleGuard moduleKey="settings" roles={["admin", "hr"]}><RecruitmentSettingsPage /></RoleGuard></ProtectedRoute>
      </Route>
      <Route path="/attendance">
        <ProtectedRoute><LeaveCalendar /></ProtectedRoute>
      </Route>

      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeSync />
        <TooltipProvider>
          <BreadcrumbProvider>
            <Toaster />
            <SonnerToaster position="top-right" richColors />
            <Router />
          </BreadcrumbProvider>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
