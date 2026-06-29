import Layout from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EHIRE_DOCS_URL } from "@/lib/docsSite";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  Calendar,
  ExternalLink,
  FileText,
  Info,
  LayoutDashboard,
  Bell,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

type GuideTopic = {
  title: string;
  description: string;
  icon: LucideIcon;
  borderClass: string;
  iconClass: string;
  iconBgClass: string;
};

const guideTopics: GuideTopic[] = [
  {
    title: "Dashboard",
    description:
      "Your role-aware home screen. Employees see leave balances and clock in/out; managers see team approvals; HR and Admin see org-wide metrics, pending actions, and activity feeds.",
    icon: LayoutDashboard,
    borderClass: "border-l-blue-500",
    iconClass: "text-blue-600 dark:text-blue-400",
    iconBgClass: "bg-blue-50 dark:bg-blue-950/50",
  },
  {
    title: "Leave & Attendance",
    description:
      "Apply for leave, track balances and policy rules, and view the team calendar. Use Timesheets to clock in and out. Managers approve requests; HR handles org-wide leave administration.",
    icon: Calendar,
    borderClass: "border-l-emerald-500",
    iconClass: "text-emerald-600 dark:text-emerald-400",
    iconBgClass: "bg-emerald-50 dark:bg-emerald-950/50",
  },
  {
    title: "Change Requests",
    description:
      "Update personal details or your profile photo through self-service. Changes are routed to HR for review before they appear on your employee record — keeping data accurate and auditable.",
    icon: FileText,
    borderClass: "border-l-orange-500",
    iconClass: "text-orange-600 dark:text-orange-400",
    iconBgClass: "bg-orange-50 dark:bg-orange-950/50",
  },
  {
    title: "Recruitment Pipeline",
    description:
      "Move candidates from application to hire: job postings, pipeline stages, interview scheduling, offer letters, and signing. Recruiters manage the full ATS; hiring managers approve offers on assigned jobs.",
    icon: Briefcase,
    borderClass: "border-l-violet-500",
    iconClass: "text-violet-600 dark:text-violet-400",
    iconBgClass: "bg-violet-50 dark:bg-violet-950/50",
  },
  {
    title: "Notifications",
    description:
      "Stay informed when leave is approved or rejected, change requests are reviewed, onboarding tasks are assigned, recruitment events occur, or other HR actions need your attention — without refreshing the page.",
    icon: Bell,
    borderClass: "border-l-amber-500",
    iconClass: "text-amber-600 dark:text-amber-400",
    iconBgClass: "bg-amber-50 dark:bg-amber-950/50",
  },
  {
    title: "Role-Based Access",
    description:
      "What you see depends on your role — Employee, Manager, HR, Recruiter, IT, or Admin. Navigation, dashboards, and actions are tailored so each person gets the tools they need without extra clutter.",
    icon: ShieldCheck,
    borderClass: "border-l-rose-500",
    iconClass: "text-rose-600 dark:text-rose-400",
    iconBgClass: "bg-rose-50 dark:bg-rose-950/50",
  },
];

function GuideCard({ topic }: { topic: GuideTopic }) {
  const Icon = topic.icon;
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-6 py-6 md:px-8 md:py-7 shadow-sm border-l-[5px] min-h-[160px] flex flex-col",
        topic.borderClass,
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", topic.iconBgClass)}>
          <Icon className={cn("h-5 w-5", topic.iconClass)} aria-hidden />
        </div>
        <h2 className="text-lg font-bold text-foreground">{topic.title}</h2>
      </div>
      <p className="text-base text-muted-foreground leading-relaxed">{topic.description}</p>
    </div>
  );
}

export default function SoftwareGuide() {
  return (
    <Layout>
      <div className="w-full max-w-none">
        <div className="flex items-center gap-2 mb-4">
          <Badge
            variant="outline"
            className="gap-1.5 border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 font-semibold uppercase tracking-wide text-xs px-2.5 py-1"
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
            Help Center
          </Badge>
        </div>

        <h1 className="text-4xl font-display font-bold text-foreground tracking-tight">Software Guide</h1>

        <p className="mt-4 text-muted-foreground text-lg leading-relaxed max-w-4xl">
          A quick reference to key eHire features, workflows, and terminology used across the platform.
          For step-by-step guides by role, open our detailed documentation site.
        </p>

        <Button asChild size="lg" className="mt-6 gap-2 shadow-sm">
          <a href={EHIRE_DOCS_URL} target="_blank" rel="noopener noreferrer">
            Detailed Documentation
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        </Button>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-6 xl:gap-8">
          {guideTopics.map((topic) => (
            <GuideCard key={topic.title} topic={topic} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
