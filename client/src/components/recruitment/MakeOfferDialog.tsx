import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatLeaveDisplayDate } from "@/lib/dateUtils";
import { mapToEmployeeType } from "@shared/employeeTypes";
import {
  X,
  CheckCircle,
  Clock,
  Upload,
  FileText,
  Send,
  ChevronRight,
  Info,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type AppRow = {
  id: string;
  first_name: string;
  last_name: string;
  candidate_email?: string;
  job_title?: string;
  job_department?: string;
  job_location?: string | null;
  offer_id?: string | null;
  offer_status?: string | null;
};

type OfferApiRow = Record<string, unknown>;

function offerStr(row: OfferApiRow, snake: string, camel: string): string {
  const v = row[snake] ?? row[camel];
  return v != null && v !== "" ? String(v) : "";
}

function offerNum(row: OfferApiRow, snake: string, camel: string): number | null {
  const v = row[snake] ?? row[camel];
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatDateInputFromOffer(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  const head = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : "";
}

function resetNewOfferForm(application: AppRow | null) {
  return {
    salary: "",
    salaryCurrency: "PKR",
    jobTitle: application?.job_title || "",
    department: application?.job_department || "",
    startDate: "",
    employmentType: "full_time",
    terms: "",
  };
}

type OfferCreatedMeta = {
  openEmailComposer?: boolean;
};

interface MakeOfferDialogProps {
  open: boolean;
  onClose: () => void;
  application: AppRow | null;
  onOfferCreated?: (
    application: AppRow,
    offer: { id: string; status: string; approval_status?: string | null },
    meta?: OfferCreatedMeta,
  ) => void;
}

const STEPS = [
  { id: 1, label: "Offer Details" },
  { id: 2, label: "Approvals" },
  { id: 3, label: "Offer Letter" },
  { id: 4, label: "Send to Candidate" },
] as const;

const CURRENCY_OPTIONS = ["PKR", "AED", "USD", "EUR", "GBP", "SAR", "OMR", "BHD", "KWD", "QAR"];
const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contractor", label: "Contract" },
  { value: "intern", label: "Internship" },
  { value: "temporary", label: "Temporary" },
];

export function MakeOfferDialog({ open, onClose, application, onOfferCreated }: MakeOfferDialogProps) {
  const queryClient = useQueryClient();
  const { isLimitedRecruiter } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loadingOffer, setLoadingOffer] = useState(false);
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [createdOfferId, setCreatedOfferId] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [existingManualLetterName, setExistingManualLetterName] = useState<string | null>(null);

  // Step 1 — offer form
  const [form, setForm] = useState({
    salary: "",
    salaryCurrency: "PKR",
    jobTitle: "",
    department: "",
    startDate: "",
    employmentType: "full_time",
    terms: "",
  });

  // Step 3 — letter source
  const [letterSource, setLetterSource] = useState<"none" | "template" | "manual">("none");
  const [templateId, setTemplateId] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [manualFile, setManualFile] = useState<{ name: string; dataUrl: string } | null>(null);

  const { data: templatesEnvelope } = useQuery<{
    success?: boolean;
    data?: {
      templates: Array<{ id: string; name: string; description: string | null; placeholders: string[]; is_active: boolean }>;
    };
  }>({
    queryKey: ["/api/offer-templates"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/offer-templates");
      return r.json();
    },
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const templates = templatesEnvelope?.data?.templates?.filter((t) => t.is_active) ?? [];

  const editingOfferId = application?.offer_id?.trim() || null;
  const isEditMode = !!editingOfferId;

  // New offer: reset form. Edit draft: load from API.
  useEffect(() => {
    if (!open || !application) return;

    if (!editingOfferId) {
      setLoadingOffer(false);
      setStep(1);
      setCreatedOfferId(null);
      setApprovalStatus(null);
      setExistingManualLetterName(null);
      setForm(resetNewOfferForm(application));
      setLetterSource("none");
      setTemplateId("");
      setPreviewHtml(null);
      setManualFile(null);
      return;
    }

    let cancelled = false;
    setLoadingOffer(true);
    setStep(1);
    setPreviewHtml(null);
    setManualFile(null);

    (async () => {
      try {
        const res = await apiRequest("GET", `/api/recruitment/offers/${editingOfferId}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "Failed to load offer");
        }
        const offer = (await res.json()) as OfferApiRow;
        if (cancelled) return;

        const status = offerStr(offer, "status", "status") || "draft";
        if (status !== "draft") {
          toast.error("Only draft offers can be edited.");
          onClose();
          return;
        }

        const id = offerStr(offer, "id", "id") || editingOfferId;
        setCreatedOfferId(id);
        setApprovalStatus(offerStr(offer, "approval_status", "approvalStatus") || null);

        const salary = offerNum(offer, "salary", "salary");
        setForm({
          salary: salary != null ? String(salary) : "",
          salaryCurrency: offerStr(offer, "salary_currency", "salaryCurrency") || "PKR",
          jobTitle: offerStr(offer, "job_title", "jobTitle") || application.job_title || "",
          department: offerStr(offer, "department", "department") || application.job_department || "",
          startDate: formatDateInputFromOffer(offer.start_date ?? offer.startDate),
          employmentType: mapToEmployeeType(offerStr(offer, "employment_type", "employmentType") || "full_time"),
          terms: offerStr(offer, "terms", "terms"),
        });

        const templateIdVal = offerStr(offer, "template_id", "templateId");
        const merged = offerStr(offer, "merged_document_url", "mergedDocumentUrl");
        const letterUrl = offerStr(offer, "offer_letter_url", "offerLetterUrl");
        if (templateIdVal) {
          setLetterSource("template");
          setTemplateId(templateIdVal);
          setExistingManualLetterName(null);
        } else if (merged || letterUrl) {
          setLetterSource("manual");
          setTemplateId("");
          setExistingManualLetterName(
            offerStr(offer, "offer_letter_filename", "offerLetterFilename") || "Uploaded offer letter",
          );
        } else {
          setLetterSource("none");
          setTemplateId("");
          setExistingManualLetterName(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load offer draft");
          onClose();
        }
      } finally {
        if (!cancelled) setLoadingOffer(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, application?.id, editingOfferId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── File upload handler ────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxMb = 10;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`File too large — max ${maxMb} MB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setManualFile({ name: file.name, dataUrl: String(ev.target?.result ?? "") });
      setExistingManualLetterName(null);
    };
    reader.readAsDataURL(file);
  };

  // ── Template preview ───────────────────────────────────────────────────────
  const handlePreviewTemplate = async () => {
    if (!templateId) return;
    setPreviewLoading(true);
    try {
      const candidateName = `${application?.first_name ?? ""} ${application?.last_name ?? ""}`.trim();
      const startDateFmt = form.startDate ? formatLeaveDisplayDate(form.startDate, null, null) : "";
      const vars: Record<string, string> = {
        "applicant.name": candidateName,
        "applicant.first_name": application?.first_name ?? "",
        "applicant.last_name": application?.last_name ?? "",
        "applicant.email": application?.candidate_email ?? "",
        "offer.job_title": form.jobTitle,
        "offer.department": form.department,
        "offer.salary": form.salary ? Number(form.salary).toLocaleString() : "",
        "offer.currency": form.salaryCurrency,
        "offer.start_date": startDateFmt,
        "offer.employment_type": form.employmentType?.replace(/_/g, " ") ?? "",
        "company.name": "LDP Logistics",
        "candidate.name": candidateName,
        "candidate.signature": "\u200B\u2063ESIGN_SIGNATURE\u2063\u200B",
        "signature": "\u200B\u2063ESIGN_SIGNATURE\u2063\u200B",
        "signature.date": "\u200B\u2063ESIGN_DATE\u2063\u200B",
      };
      const res = await apiRequest("POST", `/api/offer-templates/${templateId}/preview`, { variables: vars });
      const data = await res.json();
      setPreviewHtml(data?.data?.html || "<p>No content</p>");
    } catch {
      toast.error("Template preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── Core save/send logic ───────────────────────────────────────────────────
  const buildOfferPayload = (status: string) => ({
    applicationId: application!.id,
    salary: parseFloat(form.salary),
    salaryCurrency: form.salaryCurrency,
    jobTitle: form.jobTitle,
    department: form.department,
    startDate: form.startDate || null,
    employmentType: form.employmentType,
    terms: form.terms || null,
    status,
  });

  const ensureOfferCreated = async (status: "draft" | "sent"): Promise<{ id: string; approval_status: string | null }> => {
    if (createdOfferId) {
      const patchRes = await apiRequest("PATCH", `/api/recruitment/offers/${createdOfferId}`, {
        ...buildOfferPayload(status),
        applicationId: undefined,
      });
      const updated = (await patchRes.json()) as { approval_status?: string | null };
      const ap = (updated.approval_status ?? approvalStatus) ?? null;
      setApprovalStatus(ap);
      return { id: createdOfferId, approval_status: ap };
    }
    if (!application || !form.salary || !form.jobTitle) {
      throw new Error("Salary and Job Title are required");
    }
    const res = await apiRequest("POST", "/api/recruitment/offers", buildOfferPayload(status));
    const created = await res.json() as { id: string; status: string; approval_status?: string | null };
    setCreatedOfferId(created.id);
    const ap = created.approval_status ?? "approved";
    setApprovalStatus(ap);
    return { id: created.id, approval_status: ap };
  };

  const applyLetterSource = async (offerId: string) => {
    if (letterSource === "template" && templateId) {
      await apiRequest("POST", `/api/recruitment/offers/${offerId}/merge-template`, { templateId });
    } else if (letterSource === "manual" && manualFile) {
      await apiRequest("POST", `/api/recruitment/offers/${offerId}/set-manual-doc`, {
        fileUrl: manualFile.dataUrl,
        fileName: manualFile.name,
      });
    }
    // manual + existing letter only: keep current document unless user uploads a new file
  };

  const invalidateQueries = (offerId?: string | null) => {
    queryClient.invalidateQueries({ queryKey: ["/api/recruitment/applications"] });
    queryClient.invalidateQueries({ queryKey: ["/api/recruitment/offers"] });
    if (offerId) {
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/offers", offerId] });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
  };

  const handleRequestApproval = async () => {
    if (!application || !form.salary || !form.jobTitle) {
      toast.error("Salary and Job Title are required");
      return;
    }
    setRequestingApproval(true);
    try {
      const { id } = await ensureOfferCreated("draft");
      await apiRequest("POST", `/api/recruitment/offers/${id}/request-approval`);
      const refreshed = await apiRequest("GET", `/api/recruitment/offers/${id}`).then((r) => r.json()) as {
        approval_status?: string | null;
      };
      const ap = refreshed.approval_status ?? "pending";
      setApprovalStatus(ap);
      invalidateQueries(id);
      toast.success("HR and recruiters have been emailed to review and approve this offer.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to request approval");
    } finally {
      setRequestingApproval(false);
    }
  };

  const handleSaveAsDraft = async () => {
    if (!application || !form.salary || !form.jobTitle) {
      toast.error("Salary and Job Title are required");
      return;
    }
    setSaving(true);
    try {
      const { id: offerId, approval_status: ap } = await ensureOfferCreated("draft");
      await applyLetterSource(offerId);
      invalidateQueries(offerId);
      toast.success(isEditMode ? "Offer draft updated" : "Offer saved as draft");
      onOfferCreated?.(application, { id: offerId, status: "draft", approval_status: ap });
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const handleSendToCandidate = async () => {
    if (!application || !form.salary || !form.jobTitle) {
      toast.error("Salary and Job Title are required");
      return;
    }
    setSaving(true);
    try {
      // For templates: create as draft, apply template (merge sends email when status=sent), then set sent
      if (letterSource === "template" && templateId) {
        const { id: offerId, approval_status: ap } = await ensureOfferCreated("draft");
        await apiRequest("PATCH", `/api/recruitment/offers/${offerId}`, { status: "sent" });
        await applyLetterSource(offerId);
        invalidateQueries(offerId);
        toast.success("Offer sent to candidate with e-sign link");
        onOfferCreated?.(application, { id: offerId, status: "sent", approval_status: ap });
        onClose();
        return;
      }

      // For manual doc: create, upload doc, then set sent (triggers offer email)
      if (letterSource === "manual" && manualFile) {
        const { id: offerId, approval_status: ap } = await ensureOfferCreated("draft");
        await applyLetterSource(offerId);
        await apiRequest("PATCH", `/api/recruitment/offers/${offerId}`, { status: "sent" });
        invalidateQueries(offerId);
        toast.success("Offer sent to candidate with e-sign link");
        onOfferCreated?.(application, { id: offerId, status: "sent", approval_status: ap });
        onClose();
        return;
      }

      // No letter — create as sent (legacy /offer-response flow)
      const { id: offerId, approval_status: ap } = await ensureOfferCreated("sent");
      invalidateQueries(offerId);
      toast.success("Offer sent to candidate");
      onOfferCreated?.(application, { id: offerId, status: "sent", approval_status: ap });
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to send offer");
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => setStep((s) => Math.min(s + 1, 4) as 1 | 2 | 3 | 4);
  const handleBack = () => setStep((s) => Math.max(s - 1, 1) as 1 | 2 | 3 | 4);

  if (!application) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent showClose={false} className="max-w-5xl h-[88vh] p-0 flex flex-col gap-0 overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {isEditMode ? "Edit Offer" : "Make an Offer"}
            </span>
            <Badge variant="secondary" className="text-xs">{isEditMode ? "Draft" : "New"}</Badge>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium text-sm">{application.first_name} {application.last_name}</span>
            {application.job_title && (
              <span className="text-muted-foreground text-sm">({application.job_title})</span>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <nav className="w-48 shrink-0 border-r bg-muted/20 p-3 flex flex-col gap-1">
            {STEPS.map((s) => {
              const done = s.id < step;
              const active = s.id === step;
              return (
                <button
                  key={s.id}
                  onClick={() => setStep(s.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : done
                      ? "text-foreground/70 hover:bg-muted"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      active
                        ? "bg-primary text-primary-foreground"
                        : done
                        ? "bg-primary/20 text-primary"
                        : "bg-muted-foreground/20 text-muted-foreground",
                    )}
                  >
                    {done ? <CheckCircle className="h-3.5 w-3.5" /> : s.id}
                  </span>
                  {s.label}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {loadingOffer ? (
              <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                Loading offer draft…
              </div>
            ) : (
              <>
                {step === 1 && (
                  <StepOfferDetails
                    application={application}
                    form={form}
                    onFormChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                  />
                )}
                {step === 2 && (
                  <StepApprovals
                    approvalStatus={approvalStatus}
                    isLimitedRecruiter={isLimitedRecruiter}
                    requestingApproval={requestingApproval}
                    onRequestApproval={handleRequestApproval}
                  />
                )}
                {step === 3 && (
                  <StepOfferLetter
                    letterSource={letterSource}
                    setLetterSource={setLetterSource}
                    templates={templates}
                    templateId={templateId}
                    setTemplateId={setTemplateId}
                    previewHtml={previewHtml}
                    previewLoading={previewLoading}
                    onPreview={handlePreviewTemplate}
                    manualFile={manualFile}
                    existingManualLetterName={existingManualLetterName}
                    fileInputRef={fileInputRef}
                    onFileChange={handleFileChange}
                  />
                )}
                {step === 4 && (
                  <StepSendToCandidate
                    application={application}
                    form={form}
                    letterSource={letterSource}
                    templateId={templateId}
                    manualFile={manualFile}
                    templates={templates}
                    approvalStatus={approvalStatus}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 bg-muted/10 shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button variant="ghost" size="sm" onClick={handleSaveAsDraft} disabled={saving || loadingOffer}>
              {isEditMode ? "Update draft" : "Save as Draft"}
            </Button>
            {approvalStatus === "pending" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  toast.message("Offer is still waiting for HR approval. You can reopen it from this candidate’s pipeline when ready.");
                  onClose();
                }}
              >
                Exit — approval pending
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button variant="outline" size="sm" onClick={handleBack} disabled={saving || loadingOffer}>
                Back
              </Button>
            )}
            {step < 4 && (
              <Button size="sm" onClick={handleNext} disabled={saving || loadingOffer}>
                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {step === 4 && (
              <Button
                size="sm"
                onClick={handleSendToCandidate}
                disabled={
                  saving ||
                  loadingOffer ||
                  approvalStatus === "pending" ||
                  approvalStatus === "not_requested" ||
                  approvalStatus === "rejected"
                }
                className="bg-primary"
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {saving ? "Sending…" : "Send to Candidate"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Step 1: Offer Details ──────────────────────────────────────────────────────
function StepOfferDetails({
  application,
  form,
  onFormChange,
}: {
  application: AppRow;
  form: {
    salary: string;
    salaryCurrency: string;
    jobTitle: string;
    department: string;
    startDate: string;
    employmentType: string;
    terms: string;
  };
  onFormChange: (patch: Partial<typeof form>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold mb-1">Offer Details</h2>
        <p className="text-sm text-muted-foreground">Fill in the offer information for this candidate.</p>
      </div>

      <Accordion type="multiple" defaultValue={["personal", "job", "compensation"]} className="space-y-2">
        {/* Personal details */}
        <AccordionItem value="personal" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium py-3">Personal details</AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Full Name</p>
                <p className="font-medium">{application.first_name} {application.last_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Email Address</p>
                <p className="font-medium">{application.candidate_email || "—"}</p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Job details */}
        <AccordionItem value="job" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium py-3">Job details</AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Job Title *</Label>
                <Input
                  value={form.jobTitle}
                  onChange={(e) => onFormChange({ jobTitle: e.target.value })}
                  placeholder="e.g. Software Engineer"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Department</Label>
                <Input
                  value={form.department}
                  onChange={(e) => onFormChange({ department: e.target.value })}
                  placeholder="e.g. Engineering"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Joining Date</Label>
                <Input type="date" value={form.startDate} onChange={(e) => onFormChange({ startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Employment Type</Label>
                <Select value={form.employmentType} onValueChange={(v) => onFormChange({ employmentType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Compensation */}
        <AccordionItem value="compensation" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium py-3">Compensation — Salary &amp; Other Components</AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Annual Salary *</Label>
                <Input
                  type="number"
                  value={form.salary}
                  onChange={(e) => onFormChange({ salary: e.target.value })}
                  placeholder="e.g. 840000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Select value={form.salaryCurrency} onValueChange={(v) => onFormChange({ salaryCurrency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Other details */}
        <AccordionItem value="other" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-medium py-3">Other details</AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Terms / Notes</Label>
              <Textarea
                value={form.terms}
                onChange={(e) => onFormChange({ terms: e.target.value })}
                rows={4}
                placeholder="Offer terms, probation period, benefits, etc."
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

// ── Step 2: Approvals ─────────────────────────────────────────────────────────
function StepApprovals({
  approvalStatus,
  isLimitedRecruiter,
  requestingApproval,
  onRequestApproval,
}: {
  approvalStatus: string | null;
  isLimitedRecruiter: boolean;
  requestingApproval: boolean;
  onRequestApproval: () => void | Promise<void>;
}) {
  const isApproved = approvalStatus === "approved" || approvalStatus === null;
  const notYetRequested = approvalStatus === "not_requested";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold mb-1">Approvals</h2>
        <p className="text-sm text-muted-foreground">
          {isLimitedRecruiter
            ? "When you are ready, ask HR or a recruiter to review and approve this offer before it can be sent."
            : "Offer approvals apply when the draft is created by a limited recruiter."}
        </p>
      </div>

      <div className={cn(
        "rounded-lg border p-4 flex items-start gap-3",
        isApproved ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      )}>
        {isApproved ? (
          <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <p className={cn("font-medium text-sm", isApproved ? "text-emerald-800" : "text-amber-800")}>
            {isApproved
              ? "Offer approved"
              : notYetRequested
                ? "Approval not requested yet"
                : "Awaiting HR / recruiter approval"}
          </p>
          <p className={cn("text-xs", isApproved ? "text-emerald-700" : "text-amber-700")}>
            {isApproved
              ? isLimitedRecruiter
                ? "This offer has been approved. You can continue with the offer letter and send it to the candidate."
                : "As an HR manager or recruiter, your offer is automatically approved. You can proceed to attach the offer letter."
              : notYetRequested
                ? "No email has been sent yet. Use the button below when the offer details are ready for HR to review."
                : "HR and recruiters have been notified by email. You will see an in-app notification when the offer is approved. Use Exit — approval pending in the footer to close this window and work elsewhere; your request stays in the queue."}
          </p>
          {isLimitedRecruiter && notYetRequested && (
            <Button size="sm" className="mt-1" onClick={() => void onRequestApproval()} disabled={requestingApproval}>
              {requestingApproval ? "Sending request…" : "Ask for approval"}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-4 bg-muted/30">
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Approval roles</span>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1 pl-6 list-disc">
          <li>Admin, HR Manager, Recruiter — auto-approved</li>
          <li>Limited Recruiter — request approval when ready; then HR/recruiter approves in Recruitment</li>
          <li>Once approved, the offer can be sent to the candidate</li>
        </ul>
      </div>
    </div>
  );
}

// ── Step 3: Offer Letter ──────────────────────────────────────────────────────
function StepOfferLetter({
  letterSource,
  setLetterSource,
  templates,
  templateId,
  setTemplateId,
  previewHtml,
  previewLoading,
  onPreview,
  manualFile,
  existingManualLetterName,
  fileInputRef,
  onFileChange,
}: {
  letterSource: "none" | "template" | "manual";
  setLetterSource: (v: "none" | "template" | "manual") => void;
  templates: Array<{ id: string; name: string; description: string | null; is_active: boolean }>;
  templateId: string;
  setTemplateId: (id: string) => void;
  previewHtml: string | null;
  previewLoading: boolean;
  onPreview: () => void;
  manualFile: { name: string; dataUrl: string } | null;
  existingManualLetterName?: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold mb-1">Offer Letter</h2>
        <p className="text-sm text-muted-foreground">
          Choose how you want to provide the offer letter for e-signing.
        </p>
      </div>

      <RadioGroup
        value={letterSource}
        onValueChange={(v) => setLetterSource(v as typeof letterSource)}
        className="space-y-3"
      >
        {/* Manual upload */}
        <label
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
            letterSource === "manual" ? "border-primary bg-primary/5" : "hover:bg-muted/40",
          )}
        >
          <RadioGroupItem value="manual" id="source-manual" className="mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-sm">Upload document manually</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload your own DOCX file. Include <code className="bg-muted px-1 rounded text-xs">{"{{candidate.signature}}"}</code> placeholder
              where you want the candidate to sign. Only that placeholder will be replaced — the rest of the document is preserved.
            </p>

            {letterSource === "manual" && (
              <div className="mt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.doc"
                  className="hidden"
                  onChange={onFileChange}
                />
                {manualFile ? (
                  <div className="flex items-center gap-2 rounded-md border bg-background p-2.5">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium truncate flex-1">{manualFile.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Change
                    </Button>
                  </div>
                ) : existingManualLetterName ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-2.5">
                      <FileText className="h-4 w-4 text-emerald-700 shrink-0" />
                      <span className="text-sm font-medium truncate flex-1">{existingManualLetterName}</span>
                      <span className="text-xs text-muted-foreground shrink-0">Saved</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      Replace file
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Choose DOCX file
                  </Button>
                )}
              </div>
            )}
          </div>
        </label>

        {/* Template */}
        <label
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
            letterSource === "template" ? "border-primary bg-primary/5" : "hover:bg-muted/40",
          )}
        >
          <RadioGroupItem value="template" id="source-template" className="mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-sm">Use offer letter template</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose a pre-configured template. Variables will be filled automatically from the offer details.
            </p>

            {letterSource === "template" && (
              <div className="mt-3 space-y-2">
                {templates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No templates yet —{" "}
                    <a href="/settings/offer-templates" className="text-primary hover:underline">
                      add one in Settings
                    </a>
                    .
                  </p>
                ) : (
                  <>
                    <Select value={templateId || "__none__"} onValueChange={(v) => { setTemplateId(v === "__none__" ? "" : v); }}>
                      <SelectTrigger className="text-sm"><SelectValue placeholder="Choose template…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Choose template…</SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {templateId && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={onPreview}
                        disabled={previewLoading}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        {previewLoading ? "Loading…" : "Preview merged letter"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </label>

        {/* None / skip */}
        <label
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
            letterSource === "none" ? "border-primary bg-primary/5" : "hover:bg-muted/40",
          )}
        >
          <RadioGroupItem value="none" id="source-none" className="mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-sm">No offer letter (skip)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The candidate will receive a simple acceptance/decline link without a document to review.
            </p>
          </div>
        </label>
      </RadioGroup>

      {/* Template preview */}
      {previewHtml && letterSource === "template" && (
        <div className="border rounded-lg p-4 max-h-52 overflow-y-auto bg-white">
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Preview</p>
          <div dangerouslySetInnerHTML={{ __html: previewHtml }} className="prose prose-sm max-w-none text-xs" />
        </div>
      )}
    </div>
  );
}

// ── Step 4: Send to Candidate ─────────────────────────────────────────────────
function StepSendToCandidate({
  application,
  form,
  letterSource,
  templateId,
  manualFile,
  templates,
  approvalStatus,
}: {
  application: AppRow;
  form: {
    salary: string;
    salaryCurrency: string;
    jobTitle: string;
    department: string;
    startDate: string;
    employmentType: string;
    terms: string;
  };
  letterSource: "none" | "template" | "manual";
  templateId: string;
  manualFile: { name: string; dataUrl: string } | null;
  templates: Array<{ id: string; name: string }>;
  approvalStatus: string | null;
}) {
  const selectedTemplate = templates.find((t) => t.id === templateId);
  const salary = form.salary ? `${Number(form.salary).toLocaleString()} ${form.salaryCurrency}` : "—";
  const startDate = form.startDate ? formatLeaveDisplayDate(form.startDate, null, null) : "—";
  const empType = EMPLOYMENT_TYPES.find((t) => t.value === form.employmentType)?.label ?? form.employmentType;
  const sendBlocked =
    approvalStatus === "pending" || approvalStatus === "not_requested" || approvalStatus === "rejected";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold mb-1">Send to Candidate</h2>
        <p className="text-sm text-muted-foreground">
          Review the offer summary before sending to {application.first_name} {application.last_name}.
        </p>
      </div>

      {sendBlocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {approvalStatus === "not_requested" && "Request HR approval on the Approvals step before sending this offer."}
          {approvalStatus === "pending" && "This offer is still awaiting HR or recruiter approval."}
          {approvalStatus === "rejected" && "This offer was rejected and cannot be sent to the candidate."}
        </div>
      )}

      {/* Summary */}
      <div className="rounded-lg border divide-y text-sm">
        <SummaryRow label="Candidate" value={`${application.first_name} ${application.last_name}`} />
        <SummaryRow label="Email" value={application.candidate_email || "—"} />
        <SummaryRow label="Job Title" value={form.jobTitle || "—"} />
        <SummaryRow label="Department" value={form.department || "—"} />
        <SummaryRow label="Salary" value={salary} />
        <SummaryRow label="Joining Date" value={startDate} />
        <SummaryRow label="Employment Type" value={empType} />
        <SummaryRow
          label="Offer Letter"
          value={
            letterSource === "template"
              ? `Template: ${selectedTemplate?.name ?? templateId}`
              : letterSource === "manual"
              ? `Manual upload: ${manualFile?.name ?? "—"}`
              : "None (simple accept/decline link)"
          }
        />
      </div>

      {/* CTA note */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-start gap-2">
        <Send className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-800">
          {letterSource !== "none"
            ? "An e-sign link will be emailed to the candidate. Once they sign, both parties receive a copy of the signed offer letter."
            : "The candidate will receive an email with a link to accept or decline the offer."}
        </p>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
