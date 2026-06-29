/**
 * Shared form-builder UI.
 * Used both by Settings > Application Form (global default)
 * and by Recruitment > Create/Edit Job (per-job customisation).
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useState, useCallback, useEffect } from "react";
import {
  GripVertical, Plus, Trash2, ChevronUp, ChevronDown, Pencil, Eye,
  FileText, Type, Mail, Phone, Hash, Calendar, Link2, AlignLeft, List,
  Upload, X, Briefcase, GraduationCap, RotateCcw,
} from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Types ────────────────────────────────────────────────────────────────────

export type FieldType = "text" | "email" | "phone" | "number" | "date" | "url" | "textarea" | "select" | "file" | "checkbox";

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  system: boolean;
  systemKey?: string;
  placeholder?: string;
  options?: string[];
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  system: boolean;
  /** Candidates can add multiple entries of this section (e.g. Employment History, Education). */
  repeatable?: boolean;
  /** Identifies which section template was used to create this section. */
  templateKey?: string;
  fields: FormField[];
}

export interface FormConfig {
  sections: FormSection[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function uid() { return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; }
export function sid() { return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; }

// ── DEFAULT config ────────────────────────────────────────────────────────────

export const DEFAULT_FORM_CONFIG: FormConfig = {
  sections: [
    {
      id: "s_core",
      title: "Submit Your Application",
      system: true,
      fields: [
        { id: "resume",     type: "file",  label: "Resume / CV",  required: true,  system: true,  systemKey: "resume" },
        { id: "firstName",  type: "text",  label: "First Name",   required: true,  system: true,  systemKey: "firstName" },
        { id: "middleName", type: "text",  label: "Middle Name",  required: false, system: true,  systemKey: "middleName" },
        { id: "lastName",   type: "text",  label: "Last Name",    required: true,  system: true,  systemKey: "lastName" },
        { id: "email",      type: "email", label: "Email",        required: true,  system: true,  systemKey: "email" },
        { id: "phone",      type: "phone", label: "Phone",        required: false, system: false, systemKey: "phone" },
      ],
    },
  ],
};

// ── Suggested field catalogue ─────────────────────────────────────────────────

export const SUGGESTED: { category: string; fields: Omit<FormField, "id">[] }[] = [
  {
    category: "Personal",
    fields: [
      { type: "select", label: "Gender",         required: false, system: false, systemKey: "gender",         options: ["Male", "Female", "Other", "Prefer not to say"] },
      { type: "date",   label: "Date of Birth",  required: false, system: false, systemKey: "dateOfBirth" },
      { type: "select", label: "Marital Status", required: false, system: false, systemKey: "maritalStatus",  options: ["Single", "Married", "Divorced", "Widowed"] },
      { type: "select", label: "Blood Group",    required: false, system: false, systemKey: "bloodGroup",     options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
      { type: "email",  label: "Personal Email", required: false, system: false, systemKey: "personalEmail" },
    ],
  },
  {
    category: "Profile",
    fields: [
      { type: "text",   label: "Current Company",             required: false, system: false, systemKey: "currentCompany" },
      { type: "text",   label: "Current Title / Designation", required: false, system: false, systemKey: "currentTitle" },
      { type: "number", label: "Experience (years)",          required: false, system: false, systemKey: "experienceYears" },
      { type: "url",    label: "LinkedIn URL",                required: false, system: false, systemKey: "linkedinUrl" },
    ],
  },
  {
    category: "Salary",
    fields: [
      { type: "number", label: "Expected Salary",  required: false, system: false, systemKey: "expectedSalary" },
      { type: "text",   label: "Salary Currency",  required: false, system: false, systemKey: "salaryCurrency" },
    ],
  },
  {
    category: "Contact / Address",
    fields: [
      { type: "text", label: "Street",   required: false, system: false, systemKey: "street" },
      { type: "text", label: "City",     required: false, system: false, systemKey: "city" },
      { type: "text", label: "State",    required: false, system: false, systemKey: "state" },
      { type: "text", label: "Country",  required: false, system: false, systemKey: "country" },
      { type: "text", label: "Zip Code", required: false, system: false, systemKey: "zipCode" },
    ],
  },
  {
    category: "Attachments",
    fields: [
      { type: "textarea", label: "Cover Letter", required: false, system: false, systemKey: "coverLetter" },
    ],
  },
];

// ── Section templates ─────────────────────────────────────────────────────────

export interface SectionTemplate {
  templateKey: string;
  label: string;
  description: string;
  section: Omit<FormSection, "id">;
}

export const SECTION_TEMPLATES: SectionTemplate[] = [
  {
    templateKey: "employment_history",
    label: "Employment History",
    description: "Repeatable work experience entries",
    section: {
      title: "Employment History",
      system: false,
      repeatable: true,
      templateKey: "employment_history",
      fields: [
        { id: "tpl_emp_designation", type: "text",     label: "Designation",              required: true,  system: false },
        { id: "tpl_emp_company",     type: "text",     label: "Company / Business Name",  required: true,  system: false },
        { id: "tpl_emp_from",        type: "date",     label: "From",                     required: true,  system: false },
        { id: "tpl_emp_to",          type: "date",     label: "To",                       required: false, system: false },
        { id: "tpl_emp_current",     type: "checkbox", label: "Currently works here",     required: false, system: false },
        { id: "tpl_emp_summary",     type: "textarea", label: "Summary",                  required: false, system: false },
      ],
    },
  },
  {
    templateKey: "education",
    label: "Education",
    description: "Repeatable educational background entries",
    section: {
      title: "Education",
      system: false,
      repeatable: true,
      templateKey: "education",
      fields: [
        { id: "tpl_edu_degree",      type: "text",     label: "Degree",                   required: true,  system: false },
        { id: "tpl_edu_institution", type: "text",     label: "Institution / School Name", required: true,  system: false },
        { id: "tpl_edu_field",       type: "text",     label: "Field of Study / Major",   required: false, system: false },
        { id: "tpl_edu_grade",       type: "text",     label: "Grade",                    required: false, system: false },
        { id: "tpl_edu_from",        type: "date",     label: "From",                     required: true,  system: false },
        { id: "tpl_edu_end",         type: "date",     label: "End",                      required: false, system: false },
        { id: "tpl_edu_current",     type: "checkbox", label: "Currently pursuing",       required: false, system: false },
      ],
    },
  },
];

// ── Icon map ──────────────────────────────────────────────────────────────────

export const FIELD_ICONS: Record<FieldType, React.ReactNode> = {
  text:     <Type className="h-3.5 w-3.5" />,
  email:    <Mail className="h-3.5 w-3.5" />,
  phone:    <Phone className="h-3.5 w-3.5" />,
  number:   <Hash className="h-3.5 w-3.5" />,
  date:     <Calendar className="h-3.5 w-3.5" />,
  url:      <Link2 className="h-3.5 w-3.5" />,
  textarea: <AlignLeft className="h-3.5 w-3.5" />,
  select:   <List className="h-3.5 w-3.5" />,
  file:     <Upload className="h-3.5 w-3.5" />,
  checkbox: <FileText className="h-3.5 w-3.5" />,
};

export const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text",     label: "Short Text" },
  { value: "textarea", label: "Long Text / Paragraph" },
  { value: "number",   label: "Number" },
  { value: "email",    label: "Email" },
  { value: "phone",    label: "Phone" },
  { value: "date",     label: "Date" },
  { value: "url",      label: "URL / Link" },
  { value: "select",   label: "Dropdown (Select)" },
  { value: "file",     label: "File Upload" },
  { value: "checkbox", label: "Checkbox (Yes/No)" },
];

// ── Sortable field row ────────────────────────────────────────────────────────

function SortableField({
  field, sectionId, onEdit, onRemove, onToggleRequired,
}: {
  field: FormField;
  sectionId: string;
  onEdit: (sectionId: string, field: FormField) => void;
  onRemove: (sectionId: string, fieldId: string) => void;
  onToggleRequired: (sectionId: string, fieldId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `${sectionId}::${field.id}` });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 hover:bg-muted/30"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground shrink-0"
        aria-label="Drag to reorder"
        type="button"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex items-center gap-1.5 text-muted-foreground shrink-0">{FIELD_ICONS[field.type]}</span>
      <span className="flex-1 min-w-0 text-sm font-medium truncate">{field.label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {field.system && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">System</Badge>
        )}
        <button
          type="button"
          onClick={() => !field.system && onToggleRequired(sectionId, field.id)}
          className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium transition-colors ${
            field.required
              ? "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800"
              : "bg-muted text-muted-foreground border-border hover:bg-muted/70"
          } ${field.system && field.required ? "cursor-default" : "cursor-pointer"}`}
        >
          {field.required ? "Required" : "Optional"}
        </button>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(sectionId, field)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {!field.system && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onRemove(sectionId, field.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  section, index, total,
  onMoveUp, onMoveDown, onRename, onRemove, onAddField, onEditField, onRemoveField, onToggleRequired, onFieldDragEnd,
}: {
  section: FormSection;
  index: number;
  total: number;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRename: (id: string, title: string, desc?: string) => void;
  onRemove: (id: string) => void;
  onAddField: (sectionId: string) => void;
  onEditField: (sectionId: string, field: FormField) => void;
  onRemoveField: (sectionId: string, fieldId: string) => void;
  onToggleRequired: (sectionId: string, fieldId: string) => void;
  onFieldDragEnd: (sectionId: string, event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(section.title);

  const commitTitle = () => {
    if (titleDraft.trim()) onRename(section.id, titleDraft.trim(), section.description);
    setEditingTitle(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              autoFocus
              className="w-full bg-transparent text-sm font-semibold outline-none border-b border-primary"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") setEditingTitle(false); }}
            />
          ) : (
            <button
              type="button"
              className="flex items-center gap-1.5 group text-left"
              onClick={() => !section.system && setEditingTitle(true)}
            >
              <span className="text-sm font-semibold text-foreground">{section.title}</span>
              {!section.system && <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
            </button>
          )}
          {section.system && <span className="text-xs text-muted-foreground">Core section — cannot be removed</span>}
          {section.repeatable && (
            <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400">
              <RotateCcw className="h-2.5 w-2.5" /> Repeatable — candidates add multiple entries
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMoveUp(section.id)} disabled={index === 0} aria-label="Move up">
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMoveDown(section.id)} disabled={index === total - 1} aria-label="Move down">
            <ChevronDown className="h-4 w-4" />
          </Button>
          {!section.system && (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onRemove(section.id)} aria-label="Remove section">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onFieldDragEnd(section.id, e)}>
          <SortableContext
            items={section.fields.map((f) => `${section.id}::${f.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {section.fields.map((field) => (
              <SortableField
                key={field.id}
                field={field}
                sectionId={section.id}
                onEdit={onEditField}
                onRemove={onRemoveField}
                onToggleRequired={onToggleRequired}
              />
            ))}
          </SortableContext>
        </DndContext>

        {section.fields.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No fields yet. Add a field below.</p>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1.5 border-dashed mt-1"
          onClick={() => onAddField(section.id)}
        >
          <Plus className="h-4 w-4" />
          Add field
        </Button>
      </div>
    </div>
  );
}

// ── Field edit dialog ─────────────────────────────────────────────────────────

function FieldEditDialog({
  open, field, onClose, onSave,
}: {
  open: boolean;
  field: FormField | null;
  onClose: () => void;
  onSave: (f: FormField) => void;
}) {
  const [draft, setDraft] = useState<FormField | null>(null);
  const [optionInput, setOptionInput] = useState("");

  useEffect(() => { if (field) setDraft({ ...field }); }, [field]);

  if (!draft && field) setDraft({ ...field });
  const current = draft ?? field;
  if (!current) return null;

  const addOption = () => {
    const t = optionInput.trim();
    if (!t) return;
    setDraft((d) => d ? { ...d, options: [...(d.options ?? []), t] } : d);
    setOptionInput("");
  };

  const removeOption = (opt: string) => {
    setDraft((d) => d ? { ...d, options: (d.options ?? []).filter((o) => o !== opt) } : d);
  };

  const handleSave = () => {
    if (!draft?.label.trim()) { toast.error("Label is required"); return; }
    onSave(draft!);
    setDraft(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setDraft(null); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{current.system ? "View field" : "Edit field"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input
              value={draft?.label ?? current.label}
              onChange={(e) => setDraft((d) => d ? { ...d, label: e.target.value } : d)}
              disabled={current.system}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Field type</Label>
            <Select
              value={draft?.type ?? current.type}
              onValueChange={(v) => setDraft((d) => d ? { ...d, type: v as FieldType } : d)}
              disabled={current.system}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Placeholder text</Label>
            <Input
              value={draft?.placeholder ?? ""}
              onChange={(e) => setDraft((d) => d ? { ...d, placeholder: e.target.value } : d)}
              placeholder="Optional hint shown inside the field"
              disabled={current.system}
            />
          </div>
          {(draft?.type ?? current.type) === "select" && (
            <div className="space-y-2">
              <Label>Options</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[36px] rounded-md border border-input bg-background px-3 py-2">
                {(draft?.options ?? []).map((opt) => (
                  <span key={opt} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {opt}
                    <button type="button" onClick={() => removeOption(opt)} disabled={current.system}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {!current.system && (
                  <input
                    value={optionInput}
                    onChange={(e) => setOptionInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addOption(); } }}
                    onBlur={addOption}
                    placeholder="Add option, press Enter"
                    className="flex-1 min-w-[120px] bg-transparent text-xs outline-none py-0.5"
                  />
                )}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Required field</p>
              <p className="text-xs text-muted-foreground">Applicants must fill this in</p>
            </div>
            <Switch
              checked={draft?.required ?? current.required}
              onCheckedChange={(c) => setDraft((d) => d ? { ...d, required: c } : d)}
              disabled={current.system && current.required}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setDraft(null); onClose(); }}>Cancel</Button>
          {!current.system && <Button onClick={handleSave}>Save field</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Preview modal ─────────────────────────────────────────────────────────────

function PreviewModal({ open, config, onClose }: { open: boolean; config: FormConfig; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview: Application Form</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-2">
          {config.sections.map((section) => (
            <div key={section.id}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-semibold text-sm text-foreground">{section.title}</h3>
                {section.repeatable && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 border border-blue-200 bg-blue-50 dark:bg-blue-950/30 rounded-full px-2 py-0.5">
                    <RotateCcw className="h-2.5 w-2.5" /> Repeatable
                  </span>
                )}
              </div>
              {section.repeatable && (
                <p className="text-xs text-muted-foreground mb-3 italic">Candidates can add multiple entries for this section.</p>
              )}
              <div className={section.repeatable ? "rounded-lg border border-border p-3 space-y-3" : "space-y-3"}>
                {section.fields.map((field) => (
                  <div key={field.id} className="space-y-1">
                    <Label className="text-sm">
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    {field.type === "textarea" ? (
                      <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none" placeholder={field.placeholder || ""} readOnly />
                    ) : field.type === "select" ? (
                      <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" disabled>
                        <option value="">{field.placeholder || "Select…"}</option>
                        {(field.options ?? []).map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : field.type === "file" ? (
                      <div className="rounded-md border-2 border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
                        <Upload className="h-5 w-5 mx-auto mb-1 opacity-50" /> Click to upload
                      </div>
                    ) : field.type === "checkbox" ? (
                      <label className="flex items-center gap-2 text-sm cursor-default">
                        <input type="checkbox" disabled className="rounded" /> {field.placeholder || field.label}
                      </label>
                    ) : (
                      <input
                        type={field.type === "phone" ? "tel" : field.type}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder={field.placeholder || ""}
                        readOnly
                      />
                    )}
                  </div>
                ))}
              </div>
              {section.repeatable && (
                <button type="button" className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 font-medium hover:underline" disabled>
                  <Plus className="h-3.5 w-3.5" /> Add {section.title.replace(/s$/, "").replace(/y$/, "y")}
                </button>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close preview</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main shared builder component ─────────────────────────────────────────────

export interface ApplicationFormBuilderCoreProps {
  /** Current form configuration. Pass `null` while loading to show skeleton. */
  config: FormConfig | null;
  /** Called whenever any section/field change is made. */
  onChange: (config: FormConfig) => void;
  /** Whether an external save operation is in progress. */
  saving?: boolean;
  /** Called when the "Save" button is clicked. If omitted, no save button is rendered. */
  onSave?: () => void;
  /** Called when the "Reset to default" button is clicked. */
  onReset?: () => void;
  /** Compact layout — hides the description blurb above sections (useful when embedded as a tab). */
  compact?: boolean;
}

export function ApplicationFormBuilderCore({
  config,
  onChange,
  saving,
  onSave,
  onReset,
  compact = false,
}: ApplicationFormBuilderCoreProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingField, setEditingField] = useState<{ sectionId: string; field: FormField } | null>(null);

  const sections = config?.sections ?? [];

  // ── Section operations ──────────────────────────────────────────────────────

  const addSection = () => {
    const newSection: FormSection = { id: sid(), title: "New Section", system: false, fields: [] };
    onChange(config ? { ...config, sections: [...config.sections, newSection] } : { sections: [newSection] });
  };

  const moveSection = useCallback((id: string, dir: "up" | "down") => {
    if (!config) return;
    const idx = config.sections.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const next = dir === "up" ? idx - 1 : idx + 1;
    if (next < 0 || next >= config.sections.length) return;
    const secs = [...config.sections];
    [secs[idx], secs[next]] = [secs[next], secs[idx]];
    onChange({ ...config, sections: secs });
  }, [config, onChange]);

  const renameSection = useCallback((id: string, title: string, desc?: string) => {
    if (!config) return;
    onChange({ ...config, sections: config.sections.map((s) => s.id === id ? { ...s, title, description: desc } : s) });
  }, [config, onChange]);

  const removeSection = useCallback((id: string) => {
    if (!config) return;
    onChange({ ...config, sections: config.sections.filter((s) => s.id !== id) });
  }, [config, onChange]);

  // ── Field operations ────────────────────────────────────────────────────────

  const addField = useCallback((sectionId: string) => {
    if (!config) return;
    const newField: FormField = { id: uid(), type: "text", label: "New field", required: false, system: false };
    onChange({
      ...config,
      sections: config.sections.map((s) => s.id === sectionId ? { ...s, fields: [...s.fields, newField] } : s),
    });
    setEditingField({ sectionId, field: newField });
  }, [config, onChange]);

  const editField = useCallback((sectionId: string, field: FormField) => {
    setEditingField({ sectionId, field });
  }, []);

  const saveField = useCallback((updated: FormField) => {
    if (!editingField || !config) return;
    onChange({
      ...config,
      sections: config.sections.map((s) =>
        s.id === editingField.sectionId
          ? { ...s, fields: s.fields.map((f) => f.id === updated.id ? updated : f) }
          : s
      ),
    });
    setEditingField(null);
  }, [editingField, config, onChange]);

  const removeField = useCallback((sectionId: string, fieldId: string) => {
    if (!config) return;
    onChange({
      ...config,
      sections: config.sections.map((s) => s.id === sectionId ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) } : s),
    });
  }, [config, onChange]);

  const toggleRequired = useCallback((sectionId: string, fieldId: string) => {
    if (!config) return;
    onChange({
      ...config,
      sections: config.sections.map((s) =>
        s.id === sectionId
          ? { ...s, fields: s.fields.map((f) => f.id === fieldId && !f.system ? { ...f, required: !f.required } : f) }
          : s
      ),
    });
  }, [config, onChange]);

  const handleFieldDragEnd = useCallback((sectionId: string, event: DragEndEvent) => {
    if (!config) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const parseKey = (k: string | number) => String(k).split("::")[1];
    const activeId = parseKey(active.id);
    const overId = parseKey(over.id);
    onChange({
      ...config,
      sections: config.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const oldIdx = s.fields.findIndex((f) => f.id === activeId);
        const newIdx = s.fields.findIndex((f) => f.id === overId);
        if (oldIdx < 0 || newIdx < 0) return s;
        return { ...s, fields: arrayMove(s.fields, oldIdx, newIdx) };
      }),
    });
  }, [config, onChange]);

  // ── Add section from template ────────────────────────────────────────────────

  const addSectionFromTemplate = (template: SectionTemplate) => {
    if (!config) return;
    const already = config.sections.find((s) => s.templateKey === template.templateKey);
    if (already) {
      toast.error(`"${template.label}" is already in the form`);
      return;
    }
    const newSection: FormSection = {
      ...template.section,
      id: sid(),
      fields: template.section.fields.map((f) => ({ ...f, id: uid() })),
    };
    onChange({ ...config, sections: [...config.sections, newSection] });
    toast.success(`"${template.label}" section added`);
  };

  // ── Add suggested field ─────────────────────────────────────────────────────

  const addSuggestedField = (suggestedField: Omit<FormField, "id">, targetSectionId?: string) => {
    if (!config) return;
    const allSystemKeys = sections.flatMap((s) => s.fields.map((f) => f.systemKey)).filter(Boolean);
    if (suggestedField.systemKey && allSystemKeys.includes(suggestedField.systemKey)) {
      toast.error(`"${suggestedField.label}" is already in the form`);
      return;
    }
    const newField: FormField = { ...suggestedField, id: uid() };
    const sectionId = targetSectionId ?? sections[sections.length - 1]?.id;
    if (!sectionId) { toast.error("Add a section first"); return; }
    onChange({
      ...config,
      sections: config.sections.map((s) => s.id === sectionId ? { ...s, fields: [...s.fields, newField] } : s),
    });
    toast.success(`"${suggestedField.label}" added to "${sections.find((s) => s.id === sectionId)?.title}"`);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!config) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Loading form config…
      </div>
    );
  }

  return (
    <>
      {/* Top toolbar row */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <p className="text-sm text-muted-foreground">
          {compact
            ? "Customize the application form for this job."
            : "Build the form candidates fill when applying. Drag fields to reorder. System fields are always required."}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {onReset && (
            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onReset}>
              Reset
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" /> Preview
          </Button>
          {onSave && (
            <Button type="button" size="sm" className="gap-1.5" onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save form"}
            </Button>
          )}
        </div>
      </div>

      {/* Two-column: sections left, suggested fields right */}
      <div className="flex gap-5">
        {/* Sections */}
        <div className="flex-1 min-w-0 space-y-4">
          {sections.map((section, idx) => (
            <SectionCard
              key={section.id}
              section={section}
              index={idx}
              total={sections.length}
              onMoveUp={(id) => moveSection(id, "up")}
              onMoveDown={(id) => moveSection(id, "down")}
              onRename={renameSection}
              onRemove={removeSection}
              onAddField={addField}
              onEditField={editField}
              onRemoveField={removeField}
              onToggleRequired={toggleRequired}
              onFieldDragEnd={handleFieldDragEnd}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 border-dashed text-muted-foreground hover:text-foreground"
            onClick={addSection}
          >
            <Plus className="h-4 w-4" /> Add Section
          </Button>
        </div>

        {/* Suggested fields — max-h on this element (not Radix ScrollArea) so overflow-y-auto reliably scrolls */}
        <div className="hidden lg:flex flex-col w-64 shrink-0 self-start">
          <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/20">
              <p className="text-sm font-semibold text-foreground">Suggested Fields</p>
              <p className="text-xs text-muted-foreground mt-0.5">Click to add to last section</p>
            </div>
            <div className="max-h-[min(480px,calc(100vh-11rem))] overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-4 space-y-4 [scrollbar-gutter:stable]">
                {/* Section templates */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Section Templates</p>
                  <div className="space-y-1.5">
                    {SECTION_TEMPLATES.map((tpl) => {
                      const alreadyAdded = sections.some((s) => s.templateKey === tpl.templateKey);
                      return (
                        <button
                          key={tpl.templateKey}
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => addSectionFromTemplate(tpl)}
                          className={`w-full flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors text-left ${
                            alreadyAdded
                              ? "border-border bg-muted/50 text-muted-foreground cursor-not-allowed opacity-50"
                              : "border-border bg-background hover:bg-primary/10 hover:border-primary/40"
                          }`}
                        >
                          <span className="text-muted-foreground shrink-0">
                            {tpl.templateKey === "employment_history" ? <Briefcase className="h-3.5 w-3.5" /> : <GraduationCap className="h-3.5 w-3.5" />}
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate">{tpl.label}</span>
                            <span className="text-[10px] text-muted-foreground">{tpl.description}</span>
                          </div>
                          {alreadyAdded && <span className="ml-auto text-[10px] text-green-600 shrink-0">✓ Added</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {SUGGESTED.map((group) => {
                  const usedKeys = new Set(sections.flatMap((s) => s.fields.map((f) => f.systemKey).filter(Boolean)));
                  const available = group.fields.filter((f) => !f.systemKey || !usedKeys.has(f.systemKey));
                  if (available.length === 0) return null;
                  return (
                    <div key={group.category}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{group.category}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {available.map((f) => (
                          <button
                            key={f.systemKey ?? f.label}
                            type="button"
                            onClick={() => addSuggestedField(f)}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-primary/10 hover:border-primary/40 transition-colors"
                          >
                            <span className="text-muted-foreground">{FIELD_ICONS[f.type]}</span>
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Custom</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(["text", "textarea", "number", "date", "select", "url", "file", "checkbox"] as FieldType[]).map((t) => {
                      const meta = FIELD_TYPE_OPTIONS.find((o) => o.value === t)!;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => addSuggestedField({ type: t, label: meta.label, required: false, system: false })}
                          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-primary/10 hover:border-primary/40 transition-colors text-muted-foreground"
                        >
                          {FIELD_ICONS[t]} {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <FieldEditDialog
        open={!!editingField}
        field={editingField?.field ?? null}
        onClose={() => setEditingField(null)}
        onSave={saveField}
      />
      {previewOpen && config && (
        <PreviewModal open={previewOpen} config={config} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  );
}
