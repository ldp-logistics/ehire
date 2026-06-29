import { SettingsSubpageLayout } from "@/pages/settings/SettingsSubpageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Upload, Pencil, Trash2, FileText, Eye, FileCheck2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import { OFFER_MERGE_TEXT_FIELD_KEYS } from "@shared/offerMergeFields";

/** Max raw .docx file size (must stay below Express JSON body limit after base64 inflation). */
const MAX_OFFER_DOCX_BYTES = 5 * 1024 * 1024;
/** Max raw .pdf file size for PDF form templates. */
const MAX_OFFER_PDF_BYTES  = 10 * 1024 * 1024;

interface OfferTemplate {
  id: string;
  name: string;
  description: string | null;
  docx_filename: string;
  placeholders: string[];
  is_active: boolean;
  version: number;
  template_type: "docx" | "pdf_form";
  pdf_template_url: string | null;
  created_at: string;
  updated_at: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// PDF Form Upload sub-panel (inside TemplateDialog, edit mode only)
// ---------------------------------------------------------------------------
function PdfFormUploadPanel({ template }: { template: OfferTemplate }) {
  const queryClient = useQueryClient();
  const pdfRef = useRef<HTMLInputElement>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [discoveredFields, setDiscoveredFields] = useState<string[] | null>(null);

  const handleUpload = async () => {
    if (!pdfFile) { toast.error("Select a PDF first"); return; }
    setUploading(true);
    try {
      const pdfBase64 = await fileToBase64(pdfFile);
      const res = await apiRequest("POST", `/api/offer-templates/${template.id}/upload-pdf`, {
        pdfBase64,
        pdfFilename: pdfFile.name,
      });
      const data = await res.json();
      if (!data?.data?.success) throw new Error(data?.error || "Upload failed");
      setDiscoveredFields(data.data.fields ?? []);
      queryClient.invalidateQueries({ queryKey: ["/api/offer-templates"] });
      toast.success("PDF form template saved — template type switched to PDF Form");
    } catch (e: any) {
      toast.error(e?.message || "PDF upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3 pt-2 border-t mt-4">
      <div className="flex items-center gap-2">
        <FileCheck2 className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-medium">PDF Form Template</span>
        {template.template_type === "pdf_form" && (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] px-1.5">PDF Form active</Badge>
        )}
      </div>

      <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-md p-3 space-y-1">
        <p className="font-medium text-blue-800">How to create a PDF Form template:</p>
        <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
          <li>Design your offer letter in Word / Google Docs.</li>
          <li>Export / Save as PDF.</li>
          <li>Open in <strong>Adobe Acrobat</strong>, <strong>PDF24</strong>, or <strong>LibreOffice Draw</strong>.</li>
          <li>
            Add <strong>Text Field</strong> widgets (AcroForm) named like the list below. If you only have typed{" "}
            <code className="text-[10px]">{"{{placeholders}}"}</code> in a PDF from Word, use a <strong>.docx</strong> template instead — that path merges placeholders properly.
          </li>
          <li>Save and upload here.</li>
        </ol>
        <p className="font-medium text-blue-800 mt-1">Field names (dots or spaces OK — we match both), no braces in the name:</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {OFFER_MERGE_TEXT_FIELD_KEYS.map((f) => (
            <code key={f} className="bg-white border border-blue-200 rounded px-1 py-0.5 text-[10px] text-blue-900">{f}</code>
          ))}
        </div>
      </div>

      <div
        className="border-2 border-dashed border-blue-200 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
        onClick={() => pdfRef.current?.click()}
      >
        <Upload className="h-6 w-6 mx-auto mb-1 text-blue-400" />
        {pdfFile ? (
          <p className="text-sm font-medium">{pdfFile.name} ({(pdfFile.size / 1024).toFixed(0)} KB)</p>
        ) : template.template_type === "pdf_form" ? (
          <p className="text-sm text-muted-foreground">PDF form attached — click to replace (max 10 MB)</p>
        ) : (
          <p className="text-sm text-muted-foreground">Click to upload .pdf AcroForm (max 10 MB)</p>
        )}
        <input
          ref={pdfRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > MAX_OFFER_PDF_BYTES) { toast.error("PDF too large (max 10 MB)"); return; }
            setPdfFile(f);
            setDiscoveredFields(null);
          }}
        />
      </div>

      {pdfFile && (
        <Button size="sm" onClick={handleUpload} disabled={uploading} className="w-full">
          <Upload className="h-4 w-4 mr-1" />
          {uploading ? "Uploading…" : "Save PDF Form Template"}
        </Button>
      )}

      {discoveredFields !== null && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-green-700">
            {discoveredFields.length} field{discoveredFields.length !== 1 ? "s" : ""} found in PDF:
          </p>
          <div className="flex flex-wrap gap-1">
            {discoveredFields.length === 0 ? (
              <span className="text-xs text-amber-600">No AcroForm fields detected — make sure you added form fields in your PDF editor.</span>
            ) : (
              discoveredFields.map((f) => {
                const isKnown = (OFFER_MERGE_TEXT_FIELD_KEYS as readonly string[]).includes(f);
                return (
                  <Badge
                    key={f}
                    variant="outline"
                    className={`font-mono text-[10px] px-1.5 py-0 ${isKnown ? "border-green-400 text-green-700" : "border-amber-400 text-amber-700"}`}
                  >
                    {f}
                  </Badge>
                );
              })
            )}
          </div>
          {discoveredFields.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Green = recognized field name · Amber = unrecognized (will be skipped at fill time)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main template dialog (create / edit)
// ---------------------------------------------------------------------------
function TemplateDialog({
  open,
  onClose,
  template,
}: {
  open: boolean;
  onClose: () => void;
  template: OfferTemplate | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!template;
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [file, setFile] = useState<File | null>(null);
  const [pdfCreateFile, setPdfCreateFile] = useState<File | null>(null);
  const [createKind, setCreateKind] = useState<"docx" | "pdf">("docx");
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfCreateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setFile(null);
    setPdfCreateFile(null);
    setPreviewHtml(null);
    if (!template) setCreateKind("docx");
  }, [open, template]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!isEdit) {
      if (createKind === "docx" && !file) { toast.error("Select a DOCX file"); return; }
      if (createKind === "pdf" && !pdfCreateFile) { toast.error("Select a PDF form file"); return; }
    }
    setSaving(true);
    try {
      let docxBase64: string | undefined;
      let docxFilename: string | undefined;
      if (file) {
        docxBase64 = await fileToBase64(file);
        docxFilename = file.name;
      }
      const body: Record<string, unknown> = { name: name.trim(), description: description.trim() || null };
      if (docxBase64) { body.docxBase64 = docxBase64; body.docxFilename = docxFilename; }
      if (!isEdit && createKind === "pdf" && pdfCreateFile) {
        body.pdfBase64 = await fileToBase64(pdfCreateFile);
        body.pdfFilename = pdfCreateFile.name;
      }
      if (isEdit) {
        await apiRequest("PATCH", `/api/offer-templates/${template.id}`, body);
        toast.success("Template updated");
      } else {
        await apiRequest("POST", "/api/offer-templates", body);
        toast.success("Template created");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/offer-templates"] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save template");
    } finally { setSaving(false); }
  };

  const handlePreview = async () => {
    if (!template) return;
    setPreviewLoading(true);
    try {
      const res = await apiRequest("POST", `/api/offer-templates/${template.id}/preview`, { variables: {} });
      const data = await res.json();
      setPreviewHtml(data?.data?.html || "<p>No content</p>");
    } catch {
      toast.error("Preview failed");
    } finally { setPreviewLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit template" : "Add offer template"}</DialogTitle>
          <DialogDescription className="space-y-2">
            {!isEdit && (
              <div className="flex flex-wrap gap-2 pb-1">
                <Button
                  type="button"
                  size="sm"
                  variant={createKind === "docx" ? "default" : "outline"}
                  onClick={() => { setCreateKind("docx"); setPdfCreateFile(null); }}
                >
                  Word (.docx)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={createKind === "pdf" ? "default" : "outline"}
                  onClick={() => { setCreateKind("pdf"); setFile(null); }}
                >
                  PDF form only
                </Button>
              </div>
            )}
            <span className="block">
              {!isEdit && createKind === "pdf" ? (
                <>Upload an AcroForm PDF whose field names match the merge keys below (no Word file needed).</>
              ) : isEdit && template?.template_type === "pdf_form" && template.docx_filename === "(PDF form)" ? (
                <>PDF form template — optional Word backup below, or replace the PDF in the panel at the bottom.</>
              ) : (
                <>Upload a DOCX file with <code className="text-xs bg-muted px-1 rounded">{"{{placeholder}}"}</code> merge fields.</>
              )}
            </span>
            <span className="block text-xs">
              <strong>Common variables:</strong>{" "}
              <code className="bg-muted px-1 rounded">{"{{applicant.name}}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{{offer.salary}}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{{offer.start_date}}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{{job.title}}"}</code>{" "}
              <code className="bg-muted px-1 rounded">{"{{employee_portal.company_name}}"}</code>
            </span>
            {(createKind === "docx" || isEdit) &&
              !(isEdit && template?.template_type === "pdf_form" && template.docx_filename === "(PDF form)") && (
              <span className="block text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                ✍ For the e-signature line, place <code>{"{{candidate.signature}}"}</code> exactly where you want the signature to appear. For the date, use <code>{"{{signature.date}}"}</code>.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Template name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Full-time Offer Letter" maxLength={160} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Short description..." maxLength={500} />
          </div>

          {/* ── DOCX upload (create: Word path, or edit) ───────────────── */}
          {(isEdit || createKind === "docx") && (
            <div className="space-y-2">
              <Label>{isEdit ? "Replace DOCX (optional)" : "DOCX file *"}</Label>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                {file ? (
                  <p className="text-sm font-medium">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>
                ) : isEdit ? (
                  <p className="text-sm text-muted-foreground">
                    Current:{" "}
                    <span className="font-medium">{template.docx_filename === "(PDF form)" ? "— (PDF only)" : template.docx_filename}</span>
                    {" — "}click to replace
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Click to upload .docx (max 5 MB)</p>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > MAX_OFFER_DOCX_BYTES) { toast.error("File too large (max 5 MB)"); return; }
                      setFile(f);
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* ── PDF form upload (create: PDF-only path) ─────────────────── */}
          {!isEdit && createKind === "pdf" && (
            <div className="space-y-2">
              <Label>PDF form template *</Label>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors border-blue-200 bg-blue-50/30"
                onClick={() => pdfCreateRef.current?.click()}
              >
                <FileCheck2 className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                {pdfCreateFile ? (
                  <p className="text-sm font-medium">{pdfCreateFile.name} ({(pdfCreateFile.size / 1024).toFixed(0)} KB)</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Click to upload AcroForm .pdf (max 10 MB)</p>
                )}
                <input
                  ref={pdfCreateRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > MAX_OFFER_PDF_BYTES) { toast.error("File too large (max 10 MB)"); return; }
                      setPdfCreateFile(f);
                    }
                  }}
                />
              </div>
            </div>
          )}

          {isEdit && template.placeholders.length > 0 && (
            <div className="space-y-2">
              <Label>Placeholders found</Label>
              <div className="flex flex-wrap gap-1.5">
                {template.placeholders.map((p) => (
                  <Badge key={p} variant="secondary" className="font-mono text-xs">
                    {`{{${p}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {isEdit &&
            (template.template_type === "docx" ||
              (template.template_type === "pdf_form" && template.pdf_template_url)) && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewLoading}>
                <Eye className="h-4 w-4 mr-1" />
                {previewLoading ? "Loading…" : template.template_type === "pdf_form" ? "Preview filled PDF" : "Preview as HTML"}
              </Button>
            </div>
          )}

          {previewHtml && (
            <div className="border rounded-lg p-4 max-h-64 overflow-y-auto bg-white">
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} className="prose prose-sm max-w-none" />
            </div>
          )}

          {/* ── PDF Form upload (edit mode only) ────────────────────────── */}
          {isEdit && <PdfFormUploadPanel template={template} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function OfferTemplatesSettingsPage() {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; template: OfferTemplate | null }>({ open: false, template: null });

  const { data: envelope, isPending } = useQuery<{ success?: boolean; data?: { templates: OfferTemplate[] } }>({
    queryKey: ["/api/offer-templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/offer-templates?includeInactive=true");
      return res.json();
    },
  });
  const templates = envelope?.data?.templates ?? [];

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/offer-templates/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offer-templates"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/offer-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offer-templates"] });
      toast.success("Template deleted");
    },
    onError: () => toast.error("Failed to delete template"),
  });

  return (
    <SettingsSubpageLayout
      title="Offer letter templates"
      description="Add a Word (.docx) template, or a PDF form only — no DOCX required. Used when sending offers with e-sign."
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
          <Button onClick={() => setDialog({ open: true, template: null })} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add template
          </Button>
        </div>

        {isPending ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium mb-1">No templates yet</p>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Use <strong>Word (.docx)</strong> for normal <code className="text-xs">{"{{placeholders}}"}</code> merge.
              Use <strong>PDF form only</strong> when the PDF has real AcroForm text fields (not just typed text from Word).
            </p>
            <Button onClick={() => setDialog({ open: true, template: null })} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add template
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>File / Fields</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                    </TableCell>
                    <TableCell>
                      {t.template_type === "pdf_form" ? (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] px-1.5 whitespace-nowrap">
                          PDF Form
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 whitespace-nowrap">
                          DOCX
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.template_type === "pdf_form" ? (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">AcroForm PDF</span>
                          {t.placeholders.length > 0 && (
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {t.placeholders.slice(0, 3).map((p) => (
                                <Badge key={p} variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                                  {p}
                                </Badge>
                              ))}
                              {t.placeholders.length > 3 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  +{t.placeholders.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">{t.docx_filename}</div>
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {t.placeholders.slice(0, 3).map((p) => (
                              <Badge key={p} variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                                {p}
                              </Badge>
                            ))}
                            {t.placeholders.length > 3 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                +{t.placeholders.length - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">v{t.version}</TableCell>
                    <TableCell>
                      <Switch
                        checked={t.is_active}
                        onCheckedChange={(checked) => toggleActive.mutate({ id: t.id, isActive: checked })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDialog({ open: true, template: t })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            if (confirm(`Delete "${t.name}"?`)) deleteMut.mutate(t.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {dialog.open && (
        <TemplateDialog
          open={dialog.open}
          onClose={() => setDialog({ open: false, template: null })}
          template={dialog.template}
        />
      )}
    </SettingsSubpageLayout>
  );
}
