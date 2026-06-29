import Layout from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Globe, Shield, Building2, Mail, Image, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, Fragment } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";

type HubLink = { label: string; href: string; keywords?: string };

type HubRow = {
  icon: typeof Globe;
  title: string;
  links: HubLink[];
  keywords?: string;
};

type HubCard = { cardTitle: string; rows: HubRow[]; keywords?: string };

function PipeLinks({ links }: { links: HubLink[] }) {
  const visible = links.filter((l) => l.label);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1 text-sm mt-1.5">
      {visible.map((item, i) => (
        <Fragment key={`${item.label}-${item.href}-${i}`}>
          {i > 0 && <span className="text-slate-300 px-1 select-none" aria-hidden>|</span>}
          <Link href={item.href} className="text-blue-600 hover:text-blue-800 hover:underline font-medium">
            {item.label}
          </Link>
        </Fragment>
      ))}
    </div>
  );
}

export default function Settings() {
  const { user, isAdmin, isHR, isLimitedHR } = useAuth();
  const [hubQuery, setHubQuery] = useState("");
  const isAdminOrHR = isAdmin || isHR;
  const canManageProfileBanner = isAdmin || isHR || isLimitedHR;

  const hubCards = useMemo((): HubCard[] => {
    const cards: HubCard[] = [];
    const generalRows: HubRow[] = [
      {
        icon: Globe,
        title: "Personal preferences",
        links: [{ label: "Timezone", href: "/settings/timezone" }],
      },
    ];
    if (isAdmin) {
      generalRows.push({
        icon: Shield,
        title: "Roles & access",
        links: [
          {
            label: "Access Control",
            href: "/settings/access-control",
            keywords: "users roles permissions regions admin hr recruiter access control user access multi-region pakistan us india north south super admin branch isolation",
          },
        ],
      });
    }
    if (user?.isBreakGlassAccount) {
      generalRows.push({
        icon: Shield,
        title: "Break-glass security",
        links: [{ label: "Local password & authenticator", href: "/settings/break-glass-authenticator" }],
        keywords: "totp 2fa mfa emergency admin",
      });
    }
    cards.push({ cardTitle: "General settings", rows: generalRows });

    const orgLinks: HubLink[] = [];
    if (isAdminOrHR) orgLinks.push({ label: "Organization structure", href: "/settings/org-structure" });
    if (isAdminOrHR) orgLinks.push({ label: "Leave (holidays & types)", href: "/settings/leave" });
    if (isAdminOrHR) orgLinks.push({ label: "Offer letter templates", href: "/settings/offer-templates" });
    if (isAdminOrHR) orgLinks.push({ label: "Application form builder", href: "/settings/application-form" });
    if (isAdminOrHR) orgLinks.push({ label: "Onsite interview locations", href: "/settings/recruitment", keywords: "recruitment settings interview schedule" });
    if (isAdminOrHR) orgLinks.push({ label: "Onboarding templates", href: "/settings/onboarding-templates" });
    if (orgLinks.length > 0) {
      cards.push({
        cardTitle: "Organization",
        rows: [{ icon: Building2, title: "Company structure & policies", links: orgLinks }],
      });
    }

    const peopleRows: HubRow[] = [];
    if (isAdminOrHR) {
      peopleRows.push({
        icon: Mail,
        title: "Notifications & time tracking",
        links: [
          { label: "Email notifications", href: "/settings/email-notifications" },
          { label: "Timesheet policy", href: "/settings/timesheet-policy" },
        ],
      });
    }
    if (canManageProfileBanner) {
      peopleRows.push({
        icon: Image,
        title: "Employee experience",
        links: [{ label: "Profile banner", href: "/settings/employee-profile-banner" }],
      });
    }
    if (peopleRows.length > 0) {
      cards.push({ cardTitle: "People & operations", rows: peopleRows });
    }
    return cards;
  }, [isAdmin, isAdminOrHR, canManageProfileBanner, user?.isBreakGlassAccount]);

  const filteredHubCards = useMemo(() => {
    const q = hubQuery.trim().toLowerCase();
    if (!q) return hubCards;
    return hubCards
      .map((card) => ({
        ...card,
        rows: card.rows.filter((row) => {
          const blob = [
            card.cardTitle,
            row.title,
            row.keywords,
            card.keywords,
            ...row.links.flatMap((l) => [l.label, l.keywords].filter(Boolean) as string[]),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return blob.includes(q);
        }),
      }))
      .filter((c) => c.rows.length > 0);
  }, [hubCards, hubQuery]);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8 pb-12">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-slate-100 tracking-tight">Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Open a section on its own page, or use organization tools from the links below.
          </p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            value={hubQuery}
            onChange={(e) => setHubQuery(e.target.value)}
            placeholder="Search settings…"
            className="pl-9 bg-white dark:bg-card border-slate-200"
            aria-label="Search settings"
          />
        </div>

        {filteredHubCards.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
            No settings match &quot;{hubQuery}&quot;.
          </p>
        ) : (
          <div className="space-y-6">
            {filteredHubCards.map((card) => (
              <div
                key={card.cardTitle}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card shadow-sm overflow-hidden"
              >
                <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/40">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-slate-500 shrink-0" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{card.cardTitle}</h2>
                  </div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {card.rows.map((row) => (
                    <div
                      key={row.title}
                      className="px-5 py-4 md:py-5 flex flex-col sm:flex-row sm:items-start gap-4 bg-white dark:bg-card"
                    >
                      <div className="flex gap-4 min-w-0 flex-1">
                        <div className="shrink-0 rounded-lg bg-violet-50 dark:bg-violet-950/40 p-2 h-fit">
                          <row.icon className="h-6 w-6 text-violet-600 dark:text-violet-400" strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{row.title}</h3>
                          <PipeLinks links={row.links} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
