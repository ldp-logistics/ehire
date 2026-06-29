import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import { EmployeeSelect } from "@/components/EmployeeSelect";
import { PRODUCT_TYPES } from "@/lib/assetProductTypes";

export interface AssignStockItem {
  id: string;
  name: string;
  category: string;
  productType?: string;
  available: number;
  specs?: Record<string, string | number>;
}

interface AssignAssetFromStockDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (employeeId?: string) => void;
  stockItems: AssignStockItem[];
  /** When set, employee picker is hidden and this id is used for assignment. */
  fixedEmployeeId?: string;
  fixedEmployeeLabel?: string;
}

export function AssignAssetFromStockDialog({
  open,
  onClose,
  onSuccess,
  stockItems,
  fixedEmployeeId,
  fixedEmployeeLabel,
}: AssignAssetFromStockDialogProps) {
  const [stockItemId, setStockItemId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [ram, setRam] = useState("");
  const [storage, setStorage] = useState("");
  const [processor, setProcessor] = useState("");
  const [generation, setGeneration] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && fixedEmployeeId) setEmployeeId(fixedEmployeeId);
    if (!open) {
      setStockItemId("");
      if (!fixedEmployeeId) setEmployeeId("");
      setRam("");
      setStorage("");
      setProcessor("");
      setGeneration("");
    }
  }, [open, fixedEmployeeId]);

  const availableStock = stockItems.filter((s) => (s.available ?? 0) > 0);

  const getBrand = (item: AssignStockItem): string => {
    const fromSpec = item.specs && typeof item.specs === "object" && item.specs.brand != null;
    const brandStr = fromSpec ? String(item.specs?.brand ?? "").trim() : "";
    return brandStr || "Unbranded";
  };

  const getTypeBucket = (item: AssignStockItem): string =>
    (item.productType || "").trim() || "other";

  const typeLabel = (t: string) => PRODUCT_TYPES.find((p) => p.id === t)?.label ?? "Other";

  const typeOrder = PRODUCT_TYPES.map((p) => p.id);
  const byTypeThenBrand = new Map<string, Map<string, AssignStockItem[]>>();
  for (const item of availableStock) {
    const bucket = getTypeBucket(item);
    const brand = getBrand(item);
    let brandMap = byTypeThenBrand.get(bucket);
    if (!brandMap) {
      brandMap = new Map();
      byTypeThenBrand.set(bucket, brandMap);
    }
    const list = brandMap.get(brand) ?? [];
    list.push(item);
    brandMap.set(brand, list);
  }

  const orderedTypes = typeOrder.filter((t) => byTypeThenBrand.has(t));
  const restTypes = Array.from(byTypeThenBrand.keys()).filter((t) => !typeOrder.includes(t));
  const stockSelectTypes = [...orderedTypes, ...restTypes];

  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/employees");
      return res.json();
    },
    enabled: open && !fixedEmployeeId,
  });

  const effectiveEmployeeId = fixedEmployeeId || employeeId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockItemId || !effectiveEmployeeId) {
      toast.error("Select a stock item" + (fixedEmployeeId ? "" : " and employee"));
      return;
    }
    setLoading(true);
    try {
      const response = await apiRequest("POST", "/api/assets/systems/assign-from-stock", {
        stockItemId,
        employeeId: effectiveEmployeeId,
        ...(ram && { ram }),
        ...(storage && { storage }),
        ...(processor && { processor }),
        ...(generation && { generation }),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Server returned an unexpected response. Please restart the server.");
      }
      const result = await response.json();
      if (!result?.id) {
        throw new Error("Assignment failed – no valid record returned.");
      }
      toast.success("Asset assigned successfully");
      onSuccess(effectiveEmployeeId);
      window.dispatchEvent(new CustomEvent("employee-updated", { detail: { employeeId: effectiveEmployeeId } }));
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Assign from stock</DialogTitle>
          <DialogDescription>
            {fixedEmployeeId
              ? "Pick an available stock item to assign to this employee. Optionally record this unit's specs."
              : "Pick an item by type and brand, then choose the employee. Optionally record this unit's specs."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Stock item *</Label>
            <Select value={stockItemId} onValueChange={setStockItemId} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Select by type → brand" />
              </SelectTrigger>
              <SelectContent>
                {availableStock.length === 0 ? (
                  <div className="py-4 px-2 text-center text-sm text-muted-foreground">No available items in stock</div>
                ) : (
                  stockSelectTypes.map((bucket) => {
                    const brandMap = byTypeThenBrand.get(bucket) ?? new Map<string, AssignStockItem[]>();
                    const brands = Array.from(brandMap.keys()).sort(
                      (a, b) => (a === "Unbranded" ? 1 : 0) - (b === "Unbranded" ? 1 : 0) || a.localeCompare(b),
                    );
                    return brands.map((brand) => {
                      const items = brandMap.get(brand) ?? [];
                      return (
                        <SelectGroup key={`${bucket}-${brand}`}>
                          <SelectLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-primary pl-2 py-1.5">
                            {typeLabel(bucket)} → {brand}
                          </SelectLabel>
                          {items.map((s) => {
                            const specEntries =
                              s.specs && typeof s.specs === "object" && Object.keys(s.specs).length > 0
                                ? (Object.entries(s.specs) as [string, string | number][]).filter(
                                    ([k, v]) => k !== "brand" && v !== "" && v != null,
                                  )
                                : [];
                            const specHint =
                              specEntries.length > 0
                                ? specEntries.slice(0, 3).map(([, v]) => String(v)).join(" · ")
                                : null;
                            const label = specHint ? `${s.name} — ${specHint}` : s.name;
                            return (
                              <SelectItem key={s.id} value={s.id}>
                                {label} — {s.available} available
                              </SelectItem>
                            );
                          })}
                        </SelectGroup>
                      );
                    });
                  })
                )}
              </SelectContent>
            </Select>
          </div>

          {fixedEmployeeId ? (
            <div className="space-y-2">
              <Label>Assign to</Label>
              <p className="text-sm font-medium rounded-md border bg-muted/40 px-3 py-2">{fixedEmployeeLabel || "This employee"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Employee *</Label>
              <EmployeeSelect
                value={employeeId}
                onChange={(id) => setEmployeeId(id)}
                employees={employees}
                disabled={loading}
                placeholder="Select employee..."
              />
            </div>
          )}

          <div className="border-t pt-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">This unit&apos;s specs (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">RAM</Label>
                <Select value={ram} onValueChange={setRam} disabled={loading}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {["4 GB", "8 GB", "12 GB", "16 GB", "32 GB", "64 GB"].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Storage</Label>
                <Select value={storage} onValueChange={setStorage} disabled={loading}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {["128 GB", "238 GB", "256 GB", "477 GB", "500 GB", "512 GB", "1 TB"].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Processor</Label>
                <Select value={processor} onValueChange={setProcessor} disabled={loading}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {["i3", "i5", "i7", "i9", "Ryzen 5", "Ryzen 7"].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Generation</Label>
                <Select value={generation} onValueChange={setGeneration} disabled={loading}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {["3rd Gen", "6th Gen", "8th Gen", "10th Gen", "11th Gen", "12th Gen", "13th Gen"].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={!stockItemId || !effectiveEmployeeId || loading}>
              {loading ? "Assigning…" : "Assign asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
