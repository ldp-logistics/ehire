import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, isPast, isWithinInterval, addDays } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Heart, ShieldCheck, Dumbbell, Car, Utensils, Gift, Building2,
  Eye, AlertTriangle, CheckCircle2, Loader2, ExternalLink,
} from "lucide-react";
import { parseBenefitCustomFields } from "@shared/benefitFields";
import {
  BenefitViewDialog,
  assignmentToDetail,
  type BenefitDetailData,
} from "@/components/benefits/BenefitDetailView";

const CATEGORIES = [
  { id: "medical", label: "Medical", icon: Heart, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
  { id: "life_insurance", label: "Life Insurance", icon: ShieldCheck, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
  { id: "gym", label: "Gym / Wellness", icon: Dumbbell, color: "text-green-500", bg: "bg-green-50 dark:bg-green-950/30" },
  { id: "transport", label: "Transport", icon: Car, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30" },
  { id: "meal", label: "Meal / Food", icon: Utensils, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30" },
  { id: "other", label: "Other", icon: Gift, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950/30" },
];

function getCategoryMeta(cat: string) {
  return CATEGORIES.find((c) => c.id === cat) ?? CATEGORIES[CATEGORIES.length - 1];
}

function validityStatus(validUntil: string | null): "active" | "expiring" | "expired" | "none" {
  if (!validUntil) return "none";
  const d = new Date(validUntil);
  if (isPast(d)) return "expired";
  if (isWithinInterval(d, { start: new Date(), end: addDays(new Date(), 30) })) return "expiring";
  return "active";
}

function ValidityBadge({ validUntil }: { validUntil: string | null }) {
  const status = validityStatus(validUntil);
  if (status === "none") return null;
  if (status === "expired") return <Badge className="bg-red-100 text-red-700 text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />Expired</Badge>;
  if (status === "expiring") return <Badge className="bg-amber-100 text-amber-700 text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />Expiring soon</Badge>;
  return <Badge className="bg-green-100 text-green-700 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>;
}

interface BenefitAssignment {
  id: string;
  title?: string;
  category?: string;
  provider?: string | null;
  description?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  document_url?: string | null;
  custom_fields?: unknown;
  card_number?: string | null;
  notes?: string | null;
  assigned_by_name?: string | null;
  assigned_at?: string;
}

function BenefitCardItem({
  assignment,
  onView,
}: {
  assignment: BenefitAssignment;
  onView: () => void;
}) {
  const catMeta = getCategoryMeta(assignment.category ?? "other");
  const CatIcon = catMeta.icon;
  const customFields = parseBenefitCustomFields(assignment.custom_fields);
  const topFields = customFields.filter((f) => f.label && f.value).slice(0, 2);

  return (
    <Card
      className="border hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group"
      onClick={onView}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className={`p-2.5 rounded-xl ${catMeta.bg} shrink-0`}>
            <CatIcon className={`h-5 w-5 ${catMeta.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors">
              {assignment.title}
            </p>
            {assignment.provider && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Building2 className="h-3 w-3" />{assignment.provider}
              </p>
            )}
          </div>
          <ValidityBadge validUntil={assignment.valid_until ?? null} />
        </div>

        {topFields.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {topFields.map((f) => (
              <Badge key={f.key} variant="secondary" className="text-[10px] font-normal">
                {f.label}: {f.value}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-[11px] text-muted-foreground">
            {assignment.assigned_at
              ? `Assigned ${format(new Date(assignment.assigned_at), "MMM d, yyyy")}`
              : assignment.valid_until
                ? `Until ${format(new Date(assignment.valid_until), "MMM d, yyyy")}`
                : "View details"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-primary"
            onClick={(e) => { e.stopPropagation(); onView(); }}
          >
            <Eye className="h-3.5 w-3.5" /> View
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export interface ProfileBenefitsTabProps {
  employeeId: string;
  isOwnProfile: boolean;
}

export default function ProfileBenefitsTab({ employeeId, isOwnProfile }: ProfileBenefitsTabProps) {
  const [viewDialog, setViewDialog] = useState<BenefitDetailData | null>(null);

  const { data: benefits = [], isLoading } = useQuery<BenefitAssignment[]>({
    queryKey: ["/api/benefits/employee", employeeId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/benefits/employee/${employeeId}`);
      const j = await r.json();
      return j?.data ?? j ?? [];
    },
    enabled: !!employeeId,
  });

  return (
    <>
      <Card className="border border-border shadow-sm bg-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-500" />
              Benefits
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {isOwnProfile
                ? "Your assigned benefit cards and entitlements."
                : "Benefit cards assigned to this employee."}
            </p>
          </div>
          {isOwnProfile && (
            <Button variant="outline" size="sm" asChild className="shrink-0">
              <Link href="/benefits">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Open Benefits page
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading benefits...
            </div>
          ) : benefits.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Heart className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No benefits assigned</p>
              <p className="text-sm mt-1">
                {isOwnProfile
                  ? "Contact HR if you believe you should have benefits on your account."
                  : "Assign benefits from the Benefits module in HR."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {benefits.map((b) => (
                <BenefitCardItem
                  key={b.id}
                  assignment={b}
                  onView={() => setViewDialog(assignmentToDetail(b))}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BenefitViewDialog
        open={!!viewDialog}
        onClose={() => setViewDialog(null)}
        data={viewDialog}
      />
    </>
  );
}
