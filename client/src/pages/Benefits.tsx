import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Heart, Plus, Edit3, Trash2, Users, Calendar, Building2, FileText,
  ShieldCheck, Dumbbell, Car, Utensils, Gift,
  Search, X, CheckCircle2, AlertTriangle, MoreHorizontal, UserPlus, Eye,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { format, isPast, isWithinInterval, addDays } from "date-fns";
import { parseBenefitCustomFields, type BenefitCustomField } from "@shared/benefitFields";
import { BenefitFieldsEditor } from "@/components/benefits/BenefitFieldsEditor";
import {
  BenefitViewDialog, benefitCardToDetail, assignmentToDetail, type BenefitDetailData,
} from "@/components/benefits/BenefitDetailView";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BenefitCard {
  id: string;
  title: string;
  category: string;
  provider: string | null;
  description: string | null;
  valid_from: string | null;
  valid_until: string | null;
  document_url: string | null;
  custom_fields?: BenefitCustomField[] | unknown;
  is_active: boolean;
  created_by_name: string | null;
  created_at: string;
  assignment_count: number;
  assignments?: Assignment[];
}

interface Assignment {
  id: string;
  benefit_card_id: string;
  employee_id: string;
  status: string;
  card_number: string | null;
  notes: string | null;
  assigned_by_name: string | null;
  assigned_at: string;
  // joined from employees
  first_name?: string;
  last_name?: string;
  work_email?: string;
  job_title?: string;
  department?: string;
  avatar?: string;
  // for "my benefits" (joined from benefit_cards)
  title?: string;
  category?: string;
  provider?: string | null;
  description?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  document_url?: string | null;
  custom_fields?: BenefitCustomField[] | unknown;
}

/** Refresh profile benefits tabs and employee timeline after assignment changes. */
function invalidateBenefitEmployeeCaches(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["/api/benefits/my"] });
  qc.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      (q.queryKey[0] === "/api/benefits/employee" ||
        (q.queryKey[0] === "/api/employees" && q.queryKey[2] === "timeline")),
  });
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "medical",        label: "Medical",        icon: Heart,       color: "text-red-500",    bg: "bg-red-50 dark:bg-red-950/30" },
  { id: "life_insurance", label: "Life Insurance",  icon: ShieldCheck, color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-950/30" },
  { id: "gym",            label: "Gym / Wellness",  icon: Dumbbell,    color: "text-green-500",  bg: "bg-green-50 dark:bg-green-950/30" },
  { id: "transport",      label: "Transport",       icon: Car,         color: "text-amber-500",  bg: "bg-amber-50 dark:bg-amber-950/30" },
  { id: "meal",           label: "Meal / Food",     icon: Utensils,    color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30" },
  { id: "other",          label: "Other",           icon: Gift,        color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950/30" },
];

function getCategoryMeta(cat: string) {
  return CATEGORIES.find((c) => c.id === cat) ?? CATEGORIES[CATEGORIES.length - 1];
}

function validityStatus(validUntil: string | null): "active" | "expiring" | "expired" | "none" {
  if (!validUntil) return "none";
  const d = new Date(validUntil);
  if (isPast(d)) return "expired";
  if (isWithinInterval(new Date(), { start: new Date(), end: addDays(d, 30) }) && isWithinInterval(d, { start: new Date(), end: addDays(new Date(), 30) })) return "expiring";
  return "active";
}

function ValidityBadge({ validUntil }: { validUntil: string | null }) {
  const status = validityStatus(validUntil);
  if (status === "none") return null;
  if (status === "expired")  return <Badge className="bg-red-100 text-red-700 text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />Expired</Badge>;
  if (status === "expiring") return <Badge className="bg-amber-100 text-amber-700 text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />Expiring soon</Badge>;
  return <Badge className="bg-green-100 text-green-700 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>;
}

// ── Create / Edit Card Dialog ──────────────────────────────────────────────────

function CardFormDialog({
  open, onClose, card,
}: {
  open: boolean;
  onClose: () => void;
  card: BenefitCard | null;
}) {
  const qc = useQueryClient();
  const [title, setTitle]           = useState(card?.title ?? "");
  const [category, setCategory]     = useState(card?.category ?? "medical");
  const [provider, setProvider]     = useState(card?.provider ?? "");
  const [description, setDescription] = useState(card?.description ?? "");
  const [validFrom, setValidFrom]   = useState(card?.valid_from ? format(new Date(card.valid_from), "yyyy-MM-dd") : "");
  const [validUntil, setValidUntil] = useState(card?.valid_until ? format(new Date(card.valid_until), "yyyy-MM-dd") : "");
  const [customFields, setCustomFields] = useState<BenefitCustomField[]>([]);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(card?.title ?? "");
    setCategory(card?.category ?? "medical");
    setProvider(card?.provider ?? "");
    setDescription(card?.description ?? "");
    setValidFrom(card?.valid_from ? format(new Date(card.valid_from), "yyyy-MM-dd") : "");
    setValidUntil(card?.valid_until ? format(new Date(card.valid_until), "yyyy-MM-dd") : "");
    setCustomFields(parseBenefitCustomFields(card?.custom_fields));
  }, [open, card?.id]);

  const save = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setLoading(true);
    try {
      const body = {
        title: title.trim(),
        category,
        provider:    provider.trim()    || null,
        description: description.trim() || null,
        validFrom:   validFrom          || null,
        validUntil:  validUntil         || null,
        customFields: customFields.filter((f) => f.label.trim()),
      };
      if (card) {
        await apiRequest("PATCH", `/api/benefits/cards/${card.id}`, body);
        toast.success("Benefit updated");
      } else {
        await apiRequest("POST", "/api/benefits/cards", body);
        toast.success("Benefit created");
      }
      qc.invalidateQueries({ queryKey: ["/api/benefits/cards"] });
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{card ? "Edit Benefit" : "Create Benefit"}</DialogTitle>
          <DialogDescription>
            {card ? "Update this benefit card's details." : "Define a new benefit card. You can add employees after creating it."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Manager Health Card 2025" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Provider / Insurer</Label>
              <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. EFU, Adamjee" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Coverage / Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="OPD, IPD, family cover, annual limit…" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valid From</Label>
              <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Valid Until</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>

          <BenefitFieldsEditor
            category={category}
            fields={customFields}
            onChange={setCustomFields}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={save} disabled={loading || !title.trim()}>
            {loading ? "Saving…" : card ? "Save Changes" : "Create Benefit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Manage Employees Dialog ────────────────────────────────────────────────────

function ManageEmployeesDialog({
  open, onClose, card,
}: {
  open: boolean;
  onClose: () => void;
  card: BenefitCard;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addMode, setAddMode] = useState(false);

  const resetAddForm = () => {
    setAddMode(false);
    setSelectedIds(new Set());
    setSearch("");
    setCardNumber("");
    setNotes("");
  };

  const { data: assignments = [], isLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/benefits/cards", card.id, "assignments"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/benefits/cards/${card.id}/assignments`);
      const j = await r.json();
      return j?.data ?? j ?? [];
    },
    enabled: open,
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const r = await fetch("/api/employees?limit=2000", { credentials: "include" });
      const j = await r.json();
      return Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
    },
    enabled: open && addMode,
  });

  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.employee_id)), [assignments]);

  const availableEmployees = useMemo(() => {
    return employees
      .filter((e) => !assignedIds.has(e.id))
      .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  }, [employees, assignedIds]);

  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return availableEmployees;
    return availableEmployees.filter((e) =>
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
      (e.work_email || "").toLowerCase().includes(q) ||
      (e.department || "").toLowerCase().includes(q) ||
      (e.job_title || "").toLowerCase().includes(q) ||
      (e.employee_id || "").toLowerCase().includes(q)
    );
  }, [availableEmployees, search]);

  const toggleEmployee = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredEmployees.map((e) => e.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const addMutation = useMutation({
    mutationFn: async (employeeIds: string[]) => {
      const body = {
        cardNumber: cardNumber.trim() || null,
        notes: notes.trim() || null,
      };
      const results = await Promise.allSettled(
        employeeIds.map((employeeId) =>
          apiRequest("POST", `/api/benefits/cards/${card.id}/assignments`, { employeeId, ...body }).then((r) => r.json())
        )
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length === results.length) {
        const reason = failed[0].status === "rejected" ? failed[0].reason : null;
        throw new Error(reason instanceof Error ? reason.message : "Failed to add employees");
      }
      return { added: results.length - failed.length, failed: failed.length };
    },
    onSuccess: ({ added, failed }) => {
      qc.invalidateQueries({ queryKey: ["/api/benefits/cards", card.id, "assignments"] });
      qc.invalidateQueries({ queryKey: ["/api/benefits/cards"] });
      invalidateBenefitEmployeeCaches(qc);
      resetAddForm();
      if (failed > 0) {
        toast.success(`Added ${added} employee${added !== 1 ? "s" : ""}`, { description: `${failed} could not be added (may already be enrolled).` });
      } else {
        toast.success(`Added ${added} employee${added !== 1 ? "s" : ""} to benefit`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      await apiRequest("DELETE", `/api/benefits/cards/${card.id}/assignments/${assignmentId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/benefits/cards", card.id, "assignments"] });
      qc.invalidateQueries({ queryKey: ["/api/benefits/cards"] });
      invalidateBenefitEmployeeCaches(qc);
      toast.success("Employee removed from benefit");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const catMeta = getCategoryMeta(card.category);

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); resetAddForm(); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${catMeta.bg}`}>
              <catMeta.icon className={`h-4 w-4 ${catMeta.color}`} />
            </div>
            {card.title}
          </DialogTitle>
          <DialogDescription>
            {card.provider && <span className="font-medium">{card.provider} · </span>}
            Manage which employees receive this benefit.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
          {/* Add employee section */}
          {!addMode ? (
            <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => setAddMode(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-2" /> Add Employees
            </Button>
          ) : (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30 shrink-0">
              <div className="flex items-center justify-between shrink-0">
                <p className="text-sm font-medium">Add Employees</p>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={resetAddForm}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-9 text-sm"
                  placeholder="Search by name, email, department…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between gap-2 shrink-0">
                <p className="text-[11px] text-muted-foreground">
                  {filteredEmployees.length} available · {selectedIds.size} selected
                </p>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllFiltered} disabled={filteredEmployees.length === 0}>
                    Select all
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection} disabled={selectedIds.size === 0}>
                    Clear
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[220px] w-full rounded-md border bg-background">
                {filteredEmployees.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8 px-3">
                    {availableEmployees.length === 0 ? "All employees are already enrolled" : "No employees match your search"}
                  </p>
                ) : (
                  <div className="p-1 pr-3">
                    {filteredEmployees.map((e) => {
                      const checked = selectedIds.has(e.id);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-left transition-colors ${checked ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted"}`}
                          onClick={() => toggleEmployee(e.id)}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleEmployee(e.id)}
                            onClick={(ev) => ev.stopPropagation()}
                            className="shrink-0"
                          />
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage src={`/api/employees/${e.id}/avatar`} />
                            <AvatarFallback className="text-[9px]">{`${e.first_name?.[0] ?? ""}${e.last_name?.[0] ?? ""}`}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{e.first_name} {e.last_name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{e.job_title} · {e.department}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              <div className="grid grid-cols-2 gap-3 shrink-0">
                <div className="space-y-1">
                  <Label className="text-xs">Card / Policy # (optional, applies to all)</Label>
                  <Input className="h-8 text-sm" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="e.g. MC-00123" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes (optional, applies to all)</Label>
                  <Input className="h-8 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Family tier" />
                </div>
              </div>

              <Button
                size="sm"
                disabled={selectedIds.size === 0 || addMutation.isPending}
                onClick={() => addMutation.mutate(Array.from(selectedIds))}
                className="w-full shrink-0"
              >
                {addMutation.isPending
                  ? "Adding…"
                  : `Add ${selectedIds.size} employee${selectedIds.size !== 1 ? "s" : ""}`}
              </Button>
            </div>
          )}

          {/* Assigned employees list */}
          <div className="flex flex-col min-h-0">
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1 shrink-0">
              <Users className="h-3.5 w-3.5" /> {assignments.length} employee{assignments.length !== 1 ? "s" : ""} enrolled
            </p>
            <ScrollArea className={`w-full rounded-md border ${addMode ? "h-[180px]" : "h-[280px]"}`}>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : assignments.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">No employees assigned yet</p>
                </div>
              ) : (
                <div className="space-y-1 p-1 pr-3">
                  {assignments.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 group transition-colors">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={`/api/employees/${a.employee_id}/avatar`} />
                        <AvatarFallback className="text-[10px]">{`${a.first_name?.[0] ?? ""}${a.last_name?.[0] ?? ""}`}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.first_name} {a.last_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {a.job_title} · {a.department}
                          {a.card_number && <span className="ml-2 font-medium">#{a.card_number}</span>}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0 hidden group-hover:block">
                        {format(new Date(a.assigned_at), "MMM d, yyyy")}
                      </span>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeMutation.mutate(a.id)}
                        disabled={removeMutation.isPending}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── HR Benefit Card Row ────────────────────────────────────────────────────────

function BenefitCardRow({
  card, onEdit, onDelete, onManage, onView,
}: {
  card: BenefitCard;
  onEdit: () => void;
  onDelete: () => void;
  onManage: () => void;
  onView: () => void;
}) {
  const catMeta = getCategoryMeta(card.category);
  const CatIcon = catMeta.icon;
  const count = Number(card.assignment_count ?? 0);
  const fields = parseBenefitCustomFields(card.custom_fields);
  const fieldPreview = fields.filter((f) => f.label && f.value).slice(0, 3);

  return (
    <div
      className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors rounded-lg group cursor-pointer"
      onClick={onView}
    >
      <div className={`p-2.5 rounded-xl ${catMeta.bg} shrink-0`}>
        <CatIcon className={`h-5 w-5 ${catMeta.color}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm">{card.title}</p>
          {!card.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
          <ValidityBadge validUntil={card.valid_until} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <Badge variant="outline" className="text-[10px] capitalize">{catMeta.label}</Badge>
          {card.provider && <span className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />{card.provider}</span>}
          {card.valid_until && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Until {format(new Date(card.valid_until), "MMM d, yyyy")}
            </span>
          )}
        </div>
        {card.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{card.description}</p>}
        {fieldPreview.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {fieldPreview.map((f) => (
              <Badge key={f.key} variant="secondary" className="text-[10px] font-normal">
                {f.label}: {f.type === "currency" && f.value
                  ? (() => { const n = Number(f.value.replace(/,/g, "")); return `${f.unit ? `${f.unit} ` : ""}${Number.isFinite(n) ? n.toLocaleString("en-PK") : f.value}`; })()
                  : f.value}
              </Badge>
            ))}
            {fields.filter((f) => f.label && f.value).length > 3 && (
              <Badge variant="outline" className="text-[10px]">+{fields.filter((f) => f.label && f.value).length - 3} more</Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => { e.stopPropagation(); onManage(); }}
        >
          <Users className="h-4 w-4" />
          <span className="font-medium">{count}</span>
          <span className="hidden sm:inline text-xs">employee{count !== 1 ? "s" : ""}</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={onView}><Eye className="h-3.5 w-3.5 mr-2" /> View Details</DropdownMenuItem>
            <DropdownMenuItem onClick={onManage}><Users className="h-3.5 w-3.5 mr-2" />Manage Employees</DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}><Edit3 className="h-3.5 w-3.5 mr-2" />Edit Details</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-600"><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ── Employee Benefit Card ──────────────────────────────────────────────────────

function MyBenefitCard({ assignment, onView }: { assignment: Assignment; onView: () => void }) {
  const catMeta = getCategoryMeta(assignment.category ?? "other");
  const CatIcon = catMeta.icon;
  const customFields = parseBenefitCustomFields(assignment.custom_fields);
  const topFields = customFields.filter((f) => f.label && f.value).slice(0, 2);

  return (
    <Card className="border hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group" onClick={onView}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className={`p-2.5 rounded-xl ${catMeta.bg} shrink-0`}>
            <CatIcon className={`h-5 w-5 ${catMeta.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors">{assignment.title}</p>
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
              <Badge key={f.key} variant="secondary" className="text-[10px] font-normal">{f.label}: {f.value}</Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-[11px] text-muted-foreground">
            {assignment.valid_until ? `Until ${format(new Date(assignment.valid_until), "MMM d, yyyy")}` : "View details"}
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={(e) => { e.stopPropagation(); onView(); }}>
            <Eye className="h-3.5 w-3.5" /> View card
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MyBenefitsContent({
  loading,
  myBenefits,
  onView,
}: {
  loading: boolean;
  myBenefits: Assignment[];
  onView: (assignment: Assignment) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (myBenefits.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="p-3 bg-muted rounded-full">
            <Heart className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="font-medium text-muted-foreground">No benefits assigned yet</p>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Contact HR if you believe you should have benefits assigned to your account.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {myBenefits.map((b) => (
        <MyBenefitCard
          key={b.id}
          assignment={b}
          onView={() => onView(b)}
        />
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Benefits() {
  const { isAdmin, isHR, user } = useAuth();
  const qc = useQueryClient();
  const isHRAdmin = isAdmin || isHR;
  const canViewMyBenefits = !!user?.employeeId;

  const [formDialog, setFormDialog] = useState<{ open: boolean; card: BenefitCard | null }>({ open: false, card: null });
  const [manageDialog, setManageDialog] = useState<{ open: boolean; card: BenefitCard | null }>({ open: false, card: null });
  const [viewDialog, setViewDialog] = useState<{ data: BenefitDetailData; cardId?: string; card?: BenefitCard } | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  // HR: fetch all benefit cards
  const { data: cards = [], isLoading: cardsLoading } = useQuery<BenefitCard[]>({
    queryKey: ["/api/benefits/cards"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/benefits/cards");
      const j = await r.json();
      return j?.data ?? j ?? [];
    },
    enabled: isHRAdmin,
    refetchInterval: 30000,
  });

  // Employee: fetch own benefits
  const { data: myBenefits = [], isLoading: myLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/benefits/my"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/benefits/my");
      const j = await r.json();
      return j?.data ?? j ?? [];
    },
    enabled: canViewMyBenefits,
    refetchInterval: 60000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/benefits/cards/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/benefits/cards"] });
      toast.success("Benefit deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleDelete = (card: BenefitCard) => {
    if (!confirm(`Delete "${card.title}"? This will also remove all employee assignments.`)) return;
    deleteMutation.mutate(card.id);
  };

  const filteredCards = useMemo(() => {
    const q = search.toLowerCase();
    return cards.filter((c) => {
      if (filterCategory !== "all" && c.category !== filterCategory) return false;
      if (q && !c.title.toLowerCase().includes(q) && !(c.provider ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cards, search, filterCategory]);

  // ── Stats for HR ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = cards.filter((c) => c.is_active);
    const expiring = active.filter((c) => validityStatus(c.valid_until) === "expiring");
    const totalEnrolled = active.reduce((s, c) => s + Number(c.assignment_count ?? 0), 0);
    return { total: active.length, expiring: expiring.length, enrolled: totalEnrolled };
  }, [cards]);

  // ── Employee view ───────────────────────────────────────────────────────────
  if (!isHRAdmin) {
    return (
      <Layout>
        <div className="mb-6">
          <h1 className="text-2xl font-display font-bold text-foreground">My Benefits</h1>
          <p className="text-muted-foreground text-sm">Your current benefits and entitlements.</p>
        </div>

        <MyBenefitsContent
          loading={myLoading}
          myBenefits={myBenefits}
          onView={(b) => setViewDialog({ data: assignmentToDetail(b) })}
        />

        <BenefitViewDialog
          open={!!viewDialog}
          onClose={() => setViewDialog(null)}
          data={viewDialog?.data ?? null}
        />
      </Layout>
    );
  }

  const manageBenefitsContent = (
    <>
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Benefits</h1>
          <p className="text-muted-foreground text-sm">Create benefit cards and manage employee assignments.</p>
        </div>
        <Button onClick={() => setFormDialog({ open: true, card: null })}>
          <Plus className="h-4 w-4 mr-2" /> Create Benefit
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><Heart className="h-4 w-4 text-blue-600" /></div>
            <div><p className="text-xl font-bold">{stats.total}</p><p className="text-[11px] text-muted-foreground">Active Benefits</p></div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg"><Users className="h-4 w-4 text-green-600" /></div>
            <div><p className="text-xl font-bold">{stats.enrolled}</p><p className="text-[11px] text-muted-foreground">Total Enrollments</p></div>
          </CardContent>
        </Card>
        <Card className={`border ${stats.expiring > 0 ? "border-amber-200 dark:border-amber-800" : ""}`}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stats.expiring > 0 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-muted"}`}>
              <AlertTriangle className={`h-4 w-4 ${stats.expiring > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className={`text-xl font-bold ${stats.expiring > 0 ? "text-amber-600" : ""}`}>{stats.expiring}</p>
              <p className="text-[11px] text-muted-foreground">Expiring Soon</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search benefits…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Benefit cards list */}
      <Card className="border">
        <CardContent className="p-0">
          {cardsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin h-7 w-7 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="p-3 bg-muted rounded-full">
                <Heart className="h-8 w-8 text-muted-foreground opacity-50" />
              </div>
              <p className="font-medium text-muted-foreground">
                {cards.length === 0 ? "No benefit cards yet" : "No benefits match filters"}
              </p>
              {cards.length === 0 && (
                <Button variant="outline" size="sm" onClick={() => setFormDialog({ open: true, card: null })}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Create your first benefit
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filteredCards.map((card) => (
                <BenefitCardRow
                  key={card.id}
                  card={card}
                  onView={() => setViewDialog({ data: benefitCardToDetail(card), cardId: card.id, card })}
                  onEdit={() => setFormDialog({ open: true, card })}
                  onDelete={() => handleDelete(card)}
                  onManage={() => setManageDialog({ open: true, card })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );

  // ── HR / Admin view ─────────────────────────────────────────────────────────
  return (
    <Layout>
      {canViewMyBenefits ? (
        <Tabs defaultValue="manage" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="manage">Manage Benefits</TabsTrigger>
            <TabsTrigger value="my">My Benefits</TabsTrigger>
          </TabsList>
          <TabsContent value="manage" className="mt-0">
            {manageBenefitsContent}
          </TabsContent>
          <TabsContent value="my" className="mt-0">
            <div className="mb-6">
              <h2 className="text-xl font-display font-bold text-foreground">My Benefits</h2>
              <p className="text-muted-foreground text-sm">Your personal benefit cards and entitlements.</p>
            </div>
            <MyBenefitsContent
              loading={myLoading}
              myBenefits={myBenefits}
              onView={(b) => setViewDialog({ data: assignmentToDetail(b) })}
            />
          </TabsContent>
        </Tabs>
      ) : (
        manageBenefitsContent
      )}

      {/* Dialogs */}
      <CardFormDialog
        open={formDialog.open}
        onClose={() => setFormDialog({ open: false, card: null })}
        card={formDialog.card}
      />
      {manageDialog.card && (
        <ManageEmployeesDialog
          open={manageDialog.open}
          onClose={() => setManageDialog({ open: false, card: null })}
          card={manageDialog.card}
        />
      )}
      <BenefitViewDialog
        open={!!viewDialog}
        onClose={() => setViewDialog(null)}
        data={viewDialog?.data ?? null}
        cardId={viewDialog?.cardId}
        isHRAdmin
        onEdit={viewDialog?.card ? () => setFormDialog({ open: true, card: viewDialog.card! }) : undefined}
        onManage={viewDialog?.card ? () => setManageDialog({ open: true, card: viewDialog.card! }) : undefined}
      />
    </Layout>
  );
}
