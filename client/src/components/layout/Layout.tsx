import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandMenu } from "@/components/CommandMenu";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import { Link, useLocation } from "wouter";
import { useAuth, REGION_LABELS, type RegionCode } from "@/hooks/useAuth";
import { setRegionView } from "@/lib/queryClient";
import { useRegionView } from "@/hooks/useRegionView";
import { hasOrgDerivedManagerScope } from "@shared/managerScope";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { 
  LayoutDashboard, 
  Users,
  UsersRound,
  Briefcase, 
  CreditCard, 
  Calendar, 
  Award, 
  Settings, 
  LogOut,
  Menu,
  ChevronDown,
  User,
  Newspaper,
  UserPlus,
  Receipt,
  CheckSquare,
  MapPin,
  PieChart,
  TrendingUp,
  BookOpen,
  Trophy,
  ShieldCheck,
  Heart,
  Plane,
  DollarSign,
  Clock,
  AlertTriangle,
  FileText,
  Layers,
  Globe,
  Sparkles,
  Activity,
  Laptop,
  Target,
  UserMinus,
  EyeOff,
  Watch,
  ChevronLeft,
  ChevronRight,
  HelpCircle
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CompanyLogo } from "@/components/CompanyLogo";
import { LOGO_COMPACT } from "@/lib/logo";
import { useQuery } from "@tanstack/react-query";
import { isBreakGlassDeveloper, isLoansNavVisible, isNavModuleVisible, canAccessAuditLogs } from "@shared/navModuleCatalog";
import { canSeeSoftwareGuide } from "@/lib/softwareGuideAccess";

// Grouped Sidebar Items
const sidebarGroups = [
  {
    title: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
      { icon: Newspaper, label: "Company Feed", href: "/news" },
      { icon: CheckSquare, label: "Tasks", href: "/tasks" },
    ]
  },
  {
    title: "People",
    items: [
      { icon: Users, label: "Employees", href: "/employees" },
      { icon: UsersRound, label: "My teams", href: "/my-teams" },
      { icon: FileText, label: "Change requests", href: "/change-requests" },
      { icon: Heart, label: "Benefits", href: "/benefits" },
      { icon: User, label: "Org Chart", href: "/org-chart" },
      { icon: Briefcase, label: "Recruitment", href: "/recruitment", roles: ["admin", "hr", "manager", "recruiter", "hiring_manager", "limited_recruiter"] },
      { icon: UserPlus, label: "Onboarding", href: "/onboarding", roles: ["admin", "hr", "manager", "onboarding_specialist"] },
      { icon: UserMinus, label: "Offboarding", href: "/offboarding", roles: ["admin", "hr"] },
    ]
  },
  {
    title: "Operations",
    items: [
      { icon: Layers, label: "Shifts", href: "/shifts", roles: ["admin", "hr", "manager", "it"] },
      { icon: Watch, label: "Timesheets", href: "/timesheets" },
      { icon: Calendar, label: "Leave Calendar", href: "/leave" },
      { icon: Laptop, label: "IT Support", href: "/it-support" },
      { icon: MapPin, label: "Rooms", href: "/rooms", roles: ["admin", "hr", "manager", "it"] },
      { icon: Laptop, label: "Asset Management", href: "/assets", roles: ["admin", "it"] },
      { icon: Plane, label: "Visitors", href: "/visitors", roles: ["admin", "hr", "manager"] },
      { icon: Clock, label: "Schedule Meeting", href: "/timezones" },
      { icon: AlertTriangle, label: "Emergency", href: "/emergency", roles: ["admin", "hr", "manager", "it"] },
    ]
  },
  {
    title: "Finance & Legal",
    items: [
      { icon: CreditCard, label: "Payroll", href: "/payroll", roles: ["admin", "hr"] },
      { icon: DollarSign, label: "Loans & Advances", href: "/loans" },
      { icon: Receipt, label: "Expenses", href: "/expenses", roles: ["admin", "hr", "manager", "it"] },
      { icon: DollarSign, label: "Salary Benchmark", href: "/salary", roles: ["admin", "hr"] },
      { icon: ShieldCheck, label: "Compliance", href: "/compliance", roles: ["admin", "hr"] },
      { icon: EyeOff, label: "Whistleblower", href: "/whistleblower", roles: ["admin", "hr", "manager", "it"] },
      { icon: FileText, label: "Audit Logs", href: "/audit" },
    ]
  },
  {
    title: "Growth & Culture",
    items: [
      { icon: Award, label: "Performance", href: "/performance", roles: ["admin", "hr", "manager", "it"] },
      { icon: Target, label: "Goals & OKRs", href: "/goals", roles: ["admin", "hr", "manager", "it"] },
      { icon: PieChart, label: "Surveys", href: "/surveys", roles: ["admin", "hr", "manager", "it"] },
      { icon: Trophy, label: "Kudos", href: "/kudos", roles: ["admin", "hr", "manager", "it"] },
      { icon: BookOpen, label: "Training LMS", href: "/training", roles: ["admin", "hr", "manager", "it"] },
      { icon: Globe, label: "Diversity", href: "/diversity", roles: ["admin", "hr"] },
      { icon: TrendingUp, label: "Succession", href: "/succession", roles: ["admin", "hr", "manager"] },
    ]
  },
  {
    title: "System",
    items: [
      { icon: Activity, label: "System Health", href: "/health", roles: ["admin"] },
      { icon: LayoutDashboard, label: "Project Tracking", href: "/project-tracking", roles: ["admin", "hr", "manager", "it"] },
      { icon: HelpCircle, label: "Software Guide", href: "/software-guide", roles: ["admin", "hr", "limited_hr", "employee"] },
      { icon: Settings, label: "Settings", href: "/settings" },
    ]
  }
];

// Role display names and colors
const roleConfig: Record<string, { label: string; color: string }> = {
  admin:                 { label: "Admin",              color: "bg-red-500/10 text-red-600 border-red-200" },
  hr:                    { label: "HR",                 color: "bg-purple-500/10 text-purple-600 border-purple-200" },
  limited_hr:            { label: "Limited HR",         color: "bg-violet-500/10 text-violet-600 border-violet-200" },
  manager:               { label: "Manager",            color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  employee:              { label: "Employee",           color: "bg-green-500/10 text-green-600 border-green-200" },
  it:                    { label: "IT",                 color: "bg-orange-500/10 text-orange-600 border-orange-200" },
  recruiter:             { label: "Recruiter",          color: "bg-cyan-500/10 text-cyan-600 border-cyan-200" },
  hiring_manager:        { label: "Hiring Manager",     color: "bg-sky-500/10 text-sky-600 border-sky-200" },
  onboarding_specialist: { label: "Onboarding",         color: "bg-teal-500/10 text-teal-600 border-teal-200" },
  limited_recruiter:     { label: "Lim. Recruiter",     color: "bg-indigo-500/10 text-indigo-600 border-indigo-200" },
};

function getBreadcrumbDisplay(location: string, customLabel: string | null): string {
  if (!customLabel) {
    return location === '/' ? 'Dashboard' : location.substring(1).replace(/-/g, ' ');
  }
  const segment = location.split("/").filter(Boolean)[0];
  const parentLabels: Record<string, string> = {
    employees: "Employees",
    assets: "Asset Management",
    recruitment: "Recruitment",
  };
  const parent = parentLabels[segment];
  if (parent) return `${parent} / ${customLabel}`;
  return location.substring(1).replace(/-/g, ' ');
}

const SIDEBAR_COLLAPSED_KEY = "ehire:sidebar-collapsed";

function readSidebarCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout, isAdmin, isHR, effectiveRole, regionCode, isSuperRegionAdmin } = useAuth();
  const regionView = useRegionView();
  /** Super admins always get the picker; admins with a saved view filter can reset it. */
  const showRegionPicker = isSuperRegionAdmin || (isAdmin && regionView !== null);

  const handleRegionViewChange = (region: string | null) => {
    setRegionView(region);
  };
  const REGION_OPTIONS: RegionCode[] = ["PK", "US", "IN-N", "IN-S"];
  const { breadcrumbLabel } = useBreadcrumb();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(readSidebarCollapsed);

  const toggleSidebarCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Whether current user is assignee on in-progress onboarding / active offboarding (shows nav items for them)
  const { data: assignmentVisibility } = useQuery<{
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
    enabled: !!user,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  /** When `allowedModules` is empty, reporting managers get a curated nav (team + ops + core growth), not the full HR/finance surface. */
  const MANAGER_DEFAULT_MODULE_KEYS = new Set([
    "dashboard",
    "news",
    "tasks",
    "employees",
    "my-teams",
    "change-requests",
    "benefits",
    "loans",
    "org-chart",
    "shifts",
    "timesheets",
    "leave",
    "it-support",
    "timezones",
    "settings",
  ]);

  // Filter sidebar: by allowedModules (if set) → by effectiveRole (DB truth) → assignee visibility for Onboarding/Offboarding
  const getVisibleItems = (items: typeof sidebarGroups[0]["items"]) => {
    if (!user) return [];
    const moduleKey = (href: string) => href.replace(/^\//, "");
    // Break-glass developer account: show every sidebar link (including prototype modules).
    if (isBreakGlassDeveloper(user)) {
      return items;
    }
    // 1. Explicit module list takes priority (but assignee visibility can add onboarding/offboarding)
    if (user.allowedModules && user.allowedModules.length > 0) {
      return items.filter(item => {
        const key = moduleKey(item.href);
        if (!isNavModuleVisible(key, user)) return false;
        if (key === "audit") return canAccessAuditLogs(user);
        return user!.allowedModules!.includes(key) || key === "dashboard" || key === "settings"
          || (key === "software-guide" && canSeeSoftwareGuide(user, effectiveRole))
          || (key === "benefits" && !!user!.employeeId)
          || (key === "loans" && isLoansNavVisible(user))
          || (key === "recruitment" && assignmentVisibility?.showRecruitmentNav === true)
          || (key === "onboarding" && assignmentVisibility?.showOnboardingNav === true)
          || (key === "offboarding" && assignmentVisibility?.showOffboardingNav === true);
      });
    }
    // 2. Otherwise use effectiveRole + full grants array (DB-driven), and assignee visibility for Onboarding/Offboarding
    const userRoles = new Set<string>([effectiveRole, ...(user.roles ?? [])]);
    return items.filter(item => {
      const key = moduleKey(item.href);
      if (!isNavModuleVisible(key, user)) return false;
      if (key === "audit") return canAccessAuditLogs(user);
      if (key === "loans") return isLoansNavVisible(user);
      // Line managers (not admin/hr/limited_hr): curated nav unless custom allowedModules
      if (
        hasOrgDerivedManagerScope(effectiveRole, user.roles) &&
        (!user.allowedModules || user.allowedModules.length === 0)
      ) {
        const allowedForManager =
          MANAGER_DEFAULT_MODULE_KEYS.has(key)
          || (key === "recruitment" && assignmentVisibility?.showRecruitmentNav === true)
          || (key === "onboarding" && assignmentVisibility?.showOnboardingNav === true)
          || (key === "offboarding" && assignmentVisibility?.showOffboardingNav === true);
        if (!allowedForManager) return false;
      }
      if (!item.roles) return true;
      if (item.href === "/recruitment") {
        return assignmentVisibility?.showRecruitmentNav === true;
      }
      if (item.href === "/onboarding") {
        return assignmentVisibility?.showOnboardingNav === true;
      }
      if (item.href === "/offboarding") {
        return assignmentVisibility?.showOffboardingNav === true;
      }
      const visibleByRole = item.roles.some((r) => userRoles.has(r));
      return visibleByRole;
    });
  };

  // Get user display name
  const displayName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user?.email?.split("@")[0] || "User";
  
  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.email?.[0]?.toUpperCase() || "U";

  const roleInfo = roleConfig[effectiveRole] || roleConfig.employee;

  const sidebarContent = (collapsed: boolean) => (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300 border-r border-slate-800 transition-all duration-300">
      {/* Header */}
      <div className={`h-16 flex items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-6'} border-b border-slate-800 transition-all duration-300`}>
        <Link href="/dashboard" onClick={() => setIsOpen(false)}>
          <div className={`flex items-center overflow-hidden rounded-lg cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${collapsed ? "justify-center w-full" : "justify-start w-full"}`}>
          <div className={`flex-shrink-0 flex items-center justify-center overflow-hidden bg-transparent ${collapsed ? "w-full" : "w-full pr-1"}`}>
            {collapsed ? (
              <img
                src={LOGO_COMPACT}
                alt="LDP"
                className="h-8 w-12 object-contain"
              />
            ) : (
              <CompanyLogo
                variant="light"
                alt="LDP Logistics"
                className="h-14 w-full max-w-none object-contain object-left"
              />
            )}
          </div>
          </div>
        </Link>
      </div>
      
      {/* Navigation */}
      <ScrollArea className="flex-1 py-6">
        <nav className="space-y-6 px-3">
          {sidebarGroups.map((group, idx) => {
            const visibleItems = getVisibleItems(group.items);
            if (visibleItems.length === 0) return null;
            
            return (
              <div key={idx}>
                {!collapsed && (
                  <div className="px-3 mb-2 text-[10px] font-bold uppercase text-slate-600 tracking-widest animate-in fade-in duration-300">
                    {group.title}
                  </div>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const isActive = location === item.href;
                    return (
                      <TooltipProvider key={item.href} delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link href={item.href}>
                              <div
                                className={cn(
                                  "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 cursor-pointer group text-sm",
                                  isActive
                                    ? "bg-blue-600/10 text-blue-400 font-medium"
                                    : "text-slate-400 hover:bg-slate-800 hover:text-white",
                                  collapsed && "justify-center px-2"
                                )}
                              >
                                <span className="relative inline-flex flex-shrink-0">
                                  <item.icon className={`h-4 w-4 ${isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                                </span>
                                {!collapsed && (
                                  <>
                                    <span className="truncate flex-1">{item.label}</span>
                                  </>
                                )}
                              </div>
                            </Link>
                          </TooltipTrigger>
                          {collapsed && (
                            <TooltipContent side="right" className="bg-slate-900 text-white border-slate-800">
                              <p>{item.label}</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
                {!collapsed && idx < sidebarGroups.length - 1 && <div className="h-px bg-slate-800/50 mx-3 mt-4" />}
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <Button 
          variant="ghost" 
          className={`w-full text-slate-400 hover:text-white hover:bg-slate-800 gap-3 ${collapsed ? 'justify-center px-0' : 'justify-start'}`}
          onClick={logout}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Logout</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 text-foreground flex font-sans">
      {/* Desktop Sidebar */}
      <aside 
        className={`hidden lg:block fixed inset-y-0 left-0 z-50 shadow-xl transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}
      >
        {sidebarContent(isCollapsed)}
        {/* Collapse Toggle Button */}
        <button 
          onClick={toggleSidebarCollapsed}
          className="absolute -right-3 top-20 bg-background border border-border rounded-full p-1 shadow-md text-muted-foreground hover:text-primary transition-colors hidden lg:flex"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar border-r border-sidebar-border">
          {sidebarContent(false)}
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4 lg:hidden">
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
              <Menu className="h-5 w-5 text-muted-foreground" />
            </Button>
            <CompanyLogo variant="auto" alt="LDP Logistics" className="h-12 w-12 object-contain" />
          </div>

          {/* Desktop Breadcrumb / Context */}
          <div className="hidden lg:flex items-center gap-4 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">eHire</span>
            <span className="text-border">/</span>
            <span className="capitalize">{getBreadcrumbDisplay(location, breadcrumbLabel)}</span>
          </div>

          <div className="flex-1 max-w-md mx-auto hidden lg:block px-8">
             <CommandMenu />
          </div>

          <div className="flex items-center gap-3">
            {/* Region awareness (Step 7c/7d) */}
            {showRegionPicker ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 h-8 border-amber-300 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span className="text-xs font-semibold">
                      {regionView ? `Region: ${regionView}` : "Super Region — All"}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    View region
                  </div>
                  <DropdownMenuItem onClick={() => handleRegionViewChange(null)}>
                    <Globe className="h-4 w-4 mr-2" />
                    All Regions
                    {regionView === null && <span className="ml-auto text-xs text-primary">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {REGION_OPTIONS.map((code) => (
                    <DropdownMenuItem key={code} onClick={() => handleRegionViewChange(code)}>
                      <MapPin className="h-4 w-4 mr-2" />
                      {REGION_LABELS[code]} ({code})
                      {regionView === code && <span className="ml-auto text-xs text-primary">✓</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : regionCode ? (
              <Badge
                variant="outline"
                className="flex items-center gap-1 h-8 px-2.5 border-blue-200 bg-blue-500/10 text-blue-600 dark:text-blue-400"
              >
                <MapPin className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">{regionCode}</span>
              </Badge>
            ) : null}

            <ThemeToggle />
            <NotificationDropdown />
            
            <div className="h-6 w-px bg-border mx-1 hidden md:block" />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-3 cursor-pointer hover:bg-muted p-1.5 rounded-full pr-2 transition-colors">
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarImage src={user?.employeeId ? `/api/employees/${user.employeeId}/avatar` : (user?.avatar || undefined)} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="text-left hidden md:block">
                    <p className="text-sm font-bold text-foreground leading-none">{displayName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${roleInfo.color}`}>
                        {roleInfo.label}
                      </Badge>
                    </div>
                  </div>
                  <ChevronDown className="h-3 w-3 text-muted-foreground hidden md:block" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-sm">
                  <p className="font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                {user?.employeeId && (
                  <DropdownMenuItem onClick={() => setLocation(`/employees/${user.employeeId}`)}>
                    <User className="h-4 w-4 mr-2" />
                    My Profile
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setLocation("/settings")}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={logout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
