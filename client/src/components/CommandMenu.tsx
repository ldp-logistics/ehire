import * as React from "react";
import {
  Calculator,
  Calendar,
  CreditCard,
  Settings,
  Smile,
  User,
  LayoutDashboard,
  Users,
  Briefcase,
  Search,
  Moon,
  Sun,
  FileText,
  Receipt,
  MapPin,
  Laptop,
  Plane,
  Clock,
  AlertTriangle,
  Award,
  Target,
  PieChart,
  Trophy,
  BookOpen,
  Globe,
  TrendingUp,
  Activity,
  DollarSign,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { isLoansNavVisible, isNavModuleVisible } from "@shared/navModuleCatalog";
import { canSeeSoftwareGuide } from "@/lib/softwareGuideAccess";

export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const [location, setLocation] = useLocation();
  const { user, effectiveRole } = useAuth();
  const showFinanceShortcuts =
    isNavModuleVisible("payroll", user) || isNavModuleVisible("expenses", user);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <>
      <div 
        onClick={() => setOpen(true)}
        className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-md text-sm text-slate-500 hover:bg-slate-200 hover:text-slate-900 cursor-pointer transition-colors w-64"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-xs font-medium">Search...</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-slate-300 bg-slate-50 px-1.5 font-mono text-[10px] font-medium text-slate-500 opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Core Modules">
            <CommandItem onSelect={() => runCommand(() => setLocation("/dashboard"))}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setLocation("/employees"))}>
              <Users className="mr-2 h-4 w-4" />
              <span>Employees</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setLocation("/recruitment"))}>
              <Briefcase className="mr-2 h-4 w-4" />
              <span>Recruitment</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setLocation("/org-chart"))}>
              <User className="mr-2 h-4 w-4" />
              <span>Org Chart</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Operations">
            <CommandItem onSelect={() => runCommand(() => setLocation("/shifts"))}>
              <Calendar className="mr-2 h-4 w-4" />
              <span>Shift Schedule</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setLocation("/timesheets"))}>
              <Clock className="mr-2 h-4 w-4" />
              <span>Timesheets</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setLocation("/leave"))}>
              <Calendar className="mr-2 h-4 w-4" />
              <span>Leave Calendar</span>
            </CommandItem>
            {isLoansNavVisible(user) ? (
            <CommandItem onSelect={() => runCommand(() => setLocation("/loans"))}>
              <DollarSign className="mr-2 h-4 w-4" />
              <span>Loans & Advances</span>
            </CommandItem>
            ) : null}
          </CommandGroup>
          {showFinanceShortcuts ? (
           <CommandGroup heading="Finance">
            {isNavModuleVisible("payroll", user) ? (
            <CommandItem onSelect={() => runCommand(() => setLocation("/payroll"))}>
              <CreditCard className="mr-2 h-4 w-4" />
              <span>Payroll</span>
            </CommandItem>
            ) : null}
            {isNavModuleVisible("expenses", user) ? (
            <CommandItem onSelect={() => runCommand(() => setLocation("/expenses"))}>
              <Receipt className="mr-2 h-4 w-4" />
              <span>Expenses</span>
            </CommandItem>
            ) : null}
          </CommandGroup>
          ) : null}
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => runCommand(() => setLocation("/employees"))}>
              <User className="mr-2 h-4 w-4" />
              <span>Add Employee</span>
              <CommandShortcut>⌘E</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setLocation("/settings"))}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
              <CommandShortcut>⌘S</CommandShortcut>
            </CommandItem>
            {canSeeSoftwareGuide(user, effectiveRole) ? (
              <CommandItem onSelect={() => runCommand(() => setLocation("/software-guide"))}>
                <BookOpen className="mr-2 h-4 w-4" />
                <span>Software Guide</span>
              </CommandItem>
            ) : null}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
