import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Sparkles } from "lucide-react";
import {
  type BenefitCustomField,
  BENEFIT_FIELD_TYPES,
  getCategoryFieldPresets,
} from "@shared/benefitFields";

function newCustomField(): BenefitCustomField {
  const id = Date.now().toString(36);
  return { key: `custom_${id}`, label: "", type: "text", value: "" };
}

export function BenefitFieldsEditor({
  category,
  fields,
  onChange,
}: {
  category: string;
  fields: BenefitCustomField[];
  onChange: (fields: BenefitCustomField[]) => void;
}) {
  const updateField = (index: number, patch: Partial<BenefitCustomField>) => {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const loadPresets = () => {
    const presets = getCategoryFieldPresets(category);
    if (presets.length === 0) return;
    const existingKeys = new Set(fields.map((f) => f.key));
    const merged = [...fields];
    for (const p of presets) {
      if (!existingKeys.has(p.key)) merged.push(p);
    }
    onChange(merged);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">Benefit Details & Limits</Label>
        <div className="flex gap-1">
          {getCategoryFieldPresets(category).length > 0 && (
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={loadPresets}>
              <Sparkles className="h-3 w-3 mr-1" /> Load suggested
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onChange([...fields, newCustomField()])}>
            <Plus className="h-3 w-3 mr-1" /> Add field
          </Button>
        </div>
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center">
          No custom fields yet. Use &quot;Load suggested&quot; for category defaults or add your own.
        </p>
      ) : (
        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
          {fields.map((field, index) => (
            <div key={`${field.key}-${index}`} className="grid grid-cols-12 gap-2 items-end rounded-lg border bg-muted/20 p-2">
              <div className="col-span-12 sm:col-span-4 space-y-1">
                <Label className="text-[10px] text-muted-foreground">Label</Label>
                <Input
                  className="h-8 text-sm"
                  value={field.label}
                  placeholder="e.g. OPD Limit"
                  onChange={(e) => {
                    const label = e.target.value;
                    const patch: Partial<BenefitCustomField> = { label };
                    if (field.key.startsWith("custom_") && label.trim()) {
                      patch.key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || field.key;
                    }
                    updateField(index, patch);
                  }}
                />
              </div>
              <div className="col-span-6 sm:col-span-2 space-y-1">
                <Label className="text-[10px] text-muted-foreground">Type</Label>
                <Select value={field.type} onValueChange={(v) => updateField(index, { type: v as BenefitCustomField["type"] })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BENEFIT_FIELD_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-6 sm:col-span-2 space-y-1">
                <Label className="text-[10px] text-muted-foreground">Unit</Label>
                <Input
                  className="h-8 text-sm"
                  value={field.unit ?? ""}
                  placeholder="PKR"
                  disabled={field.type === "boolean"}
                  onChange={(e) => updateField(index, { unit: e.target.value || undefined })}
                />
              </div>
              <div className="col-span-10 sm:col-span-3 space-y-1">
                <Label className="text-[10px] text-muted-foreground">Value / Limit</Label>
                {field.type === "boolean" ? (
                  <Select value={field.value || "yes"} onValueChange={(v) => updateField(index, { value: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-8 text-sm"
                    value={field.value}
                    placeholder={field.type === "currency" ? "50000" : "Enter value"}
                    onChange={(e) => updateField(index, { value: e.target.value })}
                  />
                )}
              </div>
              <div className="col-span-2 sm:col-span-1 flex justify-end pb-0.5">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600" onClick={() => removeField(index)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Separator />
    </div>
  );
}

/** Read-only display of benefit custom fields */
export function BenefitFieldsDisplay({ fields }: { fields: BenefitCustomField[] }) {
  const filled = fields.filter((f) => f.label && (f.value || f.type === "boolean"));
  if (filled.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 divide-y">
      {filled.map((f) => (
        <div key={f.key} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
          <span className="text-muted-foreground">{f.label}</span>
          <span className="font-medium text-foreground text-right">
            {(() => {
              if (f.type === "boolean") {
                return f.value === "yes" || f.value === "true" ? "Yes" : "No";
              }
              if (f.type === "currency" && f.value) {
                const n = Number(f.value.replace(/,/g, ""));
                const formatted = Number.isFinite(n) ? n.toLocaleString("en-PK") : f.value;
                return `${f.unit ? `${f.unit} ` : ""}${formatted}`;
              }
              if (f.unit && f.value) return `${f.value} ${f.unit}`;
              return f.value || "—";
            })()}
          </span>
        </div>
      ))}
    </div>
  );
}
