import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Heart, ShieldCheck, Dumbbell, Car, Utensils, Gift, Building2, Calendar,
  FileText, CheckCircle2, AlertTriangle, Users, Edit3, ExternalLink, Eye,
} from "lucide-react";
import { format, isPast, isWithinInterval, addDays } from "date-fns";
import type { ReactNode } from "react";
import { parseBenefitCustomFields, formatBenefitFieldValue, type BenefitCustomField } from "@shared/benefitFields";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const CATEGORIES = [
  { id: "medical", label: "Medical", icon: Heart, color: "text-red-600", bg: "from-red-500/10 to-red-600/5", ring: "ring-red-500/20" },
  { id: "life_insurance", label: "Life Insurance", icon: ShieldCheck, color: "text-blue-600", bg: "from-blue-500/10 to-blue-600/5", ring: "ring-blue-500/20" },
  { id: "gym", label: "Gym / Wellness", icon: Dumbbell, color: "text-green-600", bg: "from-green-500/10 to-green-600/5", ring: "ring-green-500/20" },
  { id: "transport", label: "Transport", icon: Car, color: "text-amber-600", bg: "from-amber-500/10 to-amber-600/5", ring: "ring-amber-500/20" },
  { id: "meal", label: "Meal / Food", icon: Utensils, color: "text-orange-600", bg: "from-orange-500/10 to-orange-600/5", ring: "ring-orange-500/20" },
  { id: "other", label: "Other", icon: Gift, color: "text-purple-600", bg: "from-purple-500/10 to-purple-600/5", ring: "ring-purple-500/20" },
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

export interface BenefitDetailData {
  title: string;
  category: string;
  provider: string | null;
  description: string | null;
  validFrom: string | null;
  validUntil: string | null;
  documentUrl: string | null;
  customFields: BenefitCustomField[] | unknown;
  isActive?: boolean;
  createdByName?: string | null;
  createdAt?: string | null;
  cardNumber?: string | null;
  notes?: string | null;
  assignedByName?: string | null;
  assignedAt?: string | null;
}

interface EnrollmentRow {
  id: string;
  employee_id: string;
  card_number: string | null;
  first_name?: string;
  last_name?: string;
  department?: string;
  job_title?: string;
}

function DetailRow({ label, value, icon: Icon }: { label: string; value: ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 text-sm">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
        <div className="text-foreground mt-0.5">{value}</div>
      </div>
    </div>
  );
}

/** Polished read-only benefit card */
export function BenefitDetailCard({ data, compact = false }: { data: BenefitDetailData; compact?: boolean }) {
  const catMeta = getCategoryMeta(data.category);
  const CatIcon = catMeta.icon;
  const fields = parseBenefitCustomFields(data.customFields);
  const filledFields = fields.filter((f) => f.label && (f.value || f.type === "boolean"));
  const status = validityStatus(data.validUntil);

  return (
    <div className={`rounded-xl border bg-card overflow-hidden shadow-sm ${compact ? "" : "ring-1 ring-border/50"}`}>
      {/* Header band */}
      <div className={`bg-gradient-to-br ${catMeta.bg} px-5 py-4 border-b ring-1 ${catMeta.ring} ring-inset`}>
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-background/80 shadow-sm shrink-0">
            <CatIcon className={`h-6 w-6 ${catMeta.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h3 className="font-display font-bold text-lg leading-tight">{data.title}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{catMeta.label}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.isActive === false && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                {status === "expired" && <Badge className="bg-red-100 text-red-700 text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />Expired</Badge>}
                {status === "expiring" && <Badge className="bg-amber-100 text-amber-700 text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />Expiring soon</Badge>}
                {status === "active" && data.validUntil && <Badge className="bg-green-100 text-green-700 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>}
              </div>
            </div>
            {data.provider && (
              <p className="text-sm mt-2 flex items-center gap-1.5 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />{data.provider}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className={`space-y-4 ${compact ? "p-4" : "p-5"}`}>
        {/* Validity & card number */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(data.validFrom || data.validUntil) && (
            <DetailRow
              label="Valid Period"
              icon={Calendar}
              value={
                <span>
                  {data.validFrom ? format(new Date(data.validFrom), "MMM d, yyyy") : "—"}
                  {" → "}
                  {data.validUntil ? format(new Date(data.validUntil), "MMM d, yyyy") : "—"}
                </span>
              }
            />
          )}
          {data.cardNumber && (
            <DetailRow label="Your Card / Policy #" icon={FileText} value={<span className="font-mono font-semibold">{data.cardNumber}</span>} />
          )}
        </div>

        {/* Custom fields / limits */}
        {filledFields.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Coverage & Limits</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filledFields.map((f) => (
                <div key={f.key} className="rounded-lg border bg-muted/30 px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground">{f.label}</p>
                  <p className="text-sm font-semibold mt-0.5">{formatBenefitFieldValue(f)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {data.description && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Description</p>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{data.description}</p>
          </div>
        )}

        {/* Assignment meta (employee view) */}
        {(data.assignedByName || data.notes) && (
          <>
            <Separator />
            <div className="space-y-3">
              {data.assignedByName && (
                <DetailRow
                  label="Assigned By"
                  icon={CheckCircle2}
                  value={
                    <span>
                      {data.assignedByName}
                      {data.assignedAt && (
                        <span className="text-muted-foreground"> · {format(new Date(data.assignedAt), "MMM d, yyyy 'at' h:mm a")}</span>
                      )}
                    </span>
                  }
                />
              )}
              {data.notes && (
                <DetailRow label="Notes" value={<span className="text-muted-foreground">{data.notes}</span>} />
              )}
            </div>
          </>
        )}

        {/* HR meta */}
        {data.createdByName && !data.assignedByName && (
          <>
            <Separator />
            <DetailRow
              label="Created By"
              value={
                <span>
                  {data.createdByName}
                  {data.createdAt && <span className="text-muted-foreground"> · {format(new Date(data.createdAt), "MMM d, yyyy")}</span>}
                </span>
              }
            />
          </>
        )}

        {data.documentUrl && (
          <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
            <a href={data.documentUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-2" /> View attached document
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export function BenefitViewDialog({
  open,
  onClose,
  data,
  cardId,
  isHRAdmin,
  onEdit,
  onManage,
}: {
  open: boolean;
  onClose: () => void;
  data: BenefitDetailData | null;
  cardId?: string;
  isHRAdmin?: boolean;
  onEdit?: () => void;
  onManage?: () => void;
}) {
  const { data: enrollments = [], isLoading: loadingEnrollments } = useQuery<EnrollmentRow[]>({
    queryKey: ["/api/benefits/cards", cardId, "assignments"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/benefits/cards/${cardId}/assignments`);
      const j = await r.json();
      return j?.data ?? j ?? [];
    },
    enabled: open && isHRAdmin && !!cardId,
  });

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
            <Eye className="h-4 w-4" /> Benefit Details
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 pb-2">
          <BenefitDetailCard data={data} />

          {isHRAdmin && cardId && (
            <div className="mt-4 mb-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Enrolled Employees ({loadingEnrollments ? "…" : enrollments.length})
              </p>
              {loadingEnrollments ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">No employees assigned yet</p>
              ) : (
                <div className="rounded-lg border divide-y max-h-48 overflow-y-auto">
                  {enrollments.map((e) => (
                    <div key={e.id} className="flex items-center gap-2.5 px-3 py-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={`/api/employees/${e.employee_id}/avatar`} />
                        <AvatarFallback className="text-[9px]">{`${e.first_name?.[0] ?? ""}${e.last_name?.[0] ?? ""}`}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.first_name} {e.last_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{e.job_title}{e.department ? ` · ${e.department}` : ""}</p>
                      </div>
                      {e.card_number && <span className="text-[10px] font-mono text-muted-foreground">#{e.card_number}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="flex flex-wrap gap-2 px-6 py-4 border-t bg-muted/20 shrink-0">
          {isHRAdmin && onManage && (
            <Button variant="outline" size="sm" onClick={() => { onClose(); onManage(); }}>
              <Users className="h-3.5 w-3.5 mr-1.5" /> Manage Employees
            </Button>
          )}
          {isHRAdmin && onEdit && (
            <Button variant="outline" size="sm" onClick={() => { onClose(); onEdit(); }}>
              <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          )}
          <Button variant="secondary" size="sm" className="ml-auto" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function benefitCardToDetail(card: {
  title: string; category: string; provider: string | null; description: string | null;
  valid_from: string | null; valid_until: string | null; document_url: string | null;
  custom_fields?: unknown; is_active?: boolean; created_by_name?: string | null; created_at?: string;
}): BenefitDetailData {
  return {
    title: card.title,
    category: card.category,
    provider: card.provider,
    description: card.description,
    validFrom: card.valid_from,
    validUntil: card.valid_until,
    documentUrl: card.document_url,
    customFields: card.custom_fields,
    isActive: card.is_active,
    createdByName: card.created_by_name,
    createdAt: card.created_at,
  };
}

export function assignmentToDetail(a: {
  title?: string; category?: string; provider?: string | null; description?: string | null;
  valid_from?: string | null; valid_until?: string | null; document_url?: string | null;
  custom_fields?: unknown; card_number?: string | null; notes?: string | null;
  assigned_by_name?: string | null; assigned_at?: string;
}): BenefitDetailData {
  return {
    title: a.title ?? "Benefit",
    category: a.category ?? "other",
    provider: a.provider ?? null,
    description: a.description ?? null,
    validFrom: a.valid_from ?? null,
    validUntil: a.valid_until ?? null,
    documentUrl: a.document_url ?? null,
    customFields: a.custom_fields,
    cardNumber: a.card_number,
    notes: a.notes,
    assignedByName: a.assigned_by_name,
    assignedAt: a.assigned_at,
  };
}
