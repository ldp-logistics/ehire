import Layout from "@/components/layout/Layout";
import { TicketAttachmentPreview } from "@/components/TicketAttachmentPreview";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { 
  Laptop, Smartphone, Monitor, Search, Plus, Filter, Download, Upload,
  QrCode, Barcode, Package, Wrench, Archive, CheckCircle, CheckCircle2, AlertTriangle,
  Building, MapPin, Calendar, User, HardDrive, Cpu, MemoryStick, Box,
  MoreHorizontal, Eye, Edit2, Trash2, RefreshCw, FileSpreadsheet, Camera, ChevronsUpDown,
  Router, Server, Printer, Headphones, Keyboard, Mouse, Tablet, Wifi,
  TicketIcon, Clock, MessageSquare, Send, Inbox, Bell, DollarSign,
  TrendingUp, AlertCircle, PackageCheck, PackageX, Layers,
  Hash, CalendarDays, Save, X,
  Paperclip, ExternalLink, Image, File, FilePlus, FileText,
  ArrowLeft
} from "lucide-react";
import { useRef, useState, useEffect, type ReactNode } from "react";
import { EmployeeSelect } from "@/components/EmployeeSelect";
import QRCode from "qrcode";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  formatDateTimeCompact,
  formatDateTimeDisplay,
  formatLeaveDisplayDate,
} from "@/lib/dateUtils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { PRODUCT_TYPES } from "@/lib/assetProductTypes";
import { AssignAssetFromStockDialog } from "@/components/AssignAssetFromStockDialog";
import { formatEmployeeAssetAssigneeName, formatEmployeeLegalName } from "@shared/employeeDisplayName";

function employeeAssetPickerLabel(emp: {
  first_name?: string;
  last_name?: string;
  nickname?: string | null;
  employee_id?: string;
  department?: string;
}) {
  const display = formatEmployeeAssetAssigneeName(emp.first_name, emp.last_name, emp.nickname);
  const legal = formatEmployeeLegalName(emp.first_name, emp.last_name);
  const nameLine = String(emp.nickname ?? "").trim() ? `${display} (${legal})` : display;
  return `${nameLine} (${emp.employee_id}) · ${emp.department || "-"}`;
}

// ==================== TYPE DEFINITIONS ====================

interface StockItem {
  id: string;
  assetId?: string;
  name: string;
  category: string;
  productType?: string;
  quantity: number;
  available: number;
  description: string;
  location: string;
  specs?: Record<string, string | number>;
}

interface AssignedSystem {
  id: string;
  assetId: string;
  stockItemId?: string;
  userId?: string;
  userName: string;
  userEmail: string;
  ram: string;
  storage: string;
  processor: string;
  generation: string;
  notes?: string;
  employeeId?: string;
  assetName?: string;
  assetCategory?: string;
  department?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface SupportTicket {
  id: string;
  ticketNumber: string;
  assetId?: string;
  assetName?: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  createdBy: { id: string; name: string; email: string; department: string; };
  assignedTo?: { id: string; name: string; };
  resolution?: string;
  resolvedAt?: string;
  hasAttachment?: boolean;
  attachmentName?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TicketComment {
  id: string;
  ticketId: string;
  message: string;
  authorId?: string;
  authorName: string;
  authorEmail?: string;
  authorRole: "employee" | "it_support" | "admin";
  isStatusUpdate?: string | boolean;
  oldStatus?: string;
  newStatus?: string;
  createdAt: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  vendor: string;
  purchaseDate: string;
  totalAmount: string | number;
  items: string;
  fileName?: string | null;
  fileType?: string | null;
  filePath?: string | null;
  status: "pending" | "paid" | "overdue" | "cancelled";
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ==================== API DATA TRANSFORMERS ====================

// Transform snake_case API response to camelCase frontend types
interface RecentAssetReturn {
  auditId: string;
  assignmentId: string;
  publicAssetId: string | null;
  assigneeName: string;
  employeeId?: string | null;
  stockItemId?: string | null;
  stockItemName: string | null;
  reasonKey?: string;
  reasonLabel: string;
  returnedAt: string;
  performedByEmail: string | null;
}

interface AssetAuditEntry {
  id: string;
  action: string;
  user_email?: string | null;
  created_at: string;
  changes?: string | Record<string, unknown> | null;
}

function parseAuditChangesClient(raw: AssetAuditEntry["changes"]): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return {};
  try {
    const p = JSON.parse(raw);
    return typeof p === "object" && p !== null && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

function OverviewDetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground block mb-0.5">{label}</span>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

interface StockAssignment {
  id: string;
  assetId: string;
  userId?: string;
  userName: string;
  userEmail?: string;
  employeeId?: string;
  firstName?: string;
  lastName?: string;
}

const transformStockItem = (item: any): StockItem & { assignments?: StockAssignment[] } => {
  const base: StockItem = {
    id: item.id,
    assetId: item.asset_id || undefined,
    name: item.name,
    category: item.category,
    productType: item.product_type,
    quantity: item.quantity,
    available: item.available,
    description: item.description || "",
    location: item.location || "IT Storage",
    specs: item.specs || undefined,
  };
  let rawAssignments = item.assignments;
  if (typeof rawAssignments === "string") {
    try {
      rawAssignments = JSON.parse(rawAssignments || "[]");
    } catch {
      rawAssignments = [];
    }
  }
  const assignments = Array.isArray(rawAssignments) ? rawAssignments.map((a: any) => ({
    id: a.id,
    assetId: a.asset_id,
    userId: a.user_id,
    userName: formatEmployeeAssetAssigneeName(a.first_name, a.last_name, a.nickname, a.user_name),
    userEmail: a.user_email,
    employeeId: a.employee_id,
    firstName: a.first_name,
    lastName: a.last_name,
  })) : [];
  return { ...base, assignments: assignments.length > 0 ? assignments : undefined };
};

const transformSystem = (item: any): AssignedSystem => ({
  id: item.id,
  assetId: item.asset_id,
  stockItemId: item.stock_item_id || undefined,
  userId: item.user_id || undefined,
  userName: formatEmployeeAssetAssigneeName(item.first_name, item.last_name, item.nickname, item.user_name),
  userEmail: item.user_email,
  ram: item.ram,
  storage: item.storage,
  processor: item.processor,
  generation: item.generation,
  notes: item.notes,
  employeeId: item.employee_id || undefined,
  assetName: item.asset_name || undefined,
  assetCategory: item.asset_category || undefined,
  department: item.department || undefined,
  createdAt: item.created_at || undefined,
  updatedAt: item.updated_at || undefined,
});

const transformInvoice = (item: any): Invoice => ({
  id: item.id,
  invoiceNumber: item.invoice_number,
  vendor: item.vendor,
  purchaseDate: item.purchase_date,
  totalAmount: item.total_amount ?? 0,
  items: item.items ?? "",
  fileName: item.file_name ?? null,
  fileType: item.file_type ?? null,
  filePath: item.file_path ?? null,
  status: item.status ?? "pending",
  notes: item.notes ?? null,
  createdAt: item.created_at,
  updatedAt: item.updated_at,
});

const transformTicket = (item: any): SupportTicket => ({
  id: item.id,
  ticketNumber: item.ticket_number,
  assetId: item.asset_id,
  assetName: item.asset_name,
  title: item.title,
  description: item.description,
  priority: item.priority,
  status: item.status,
  createdBy: {
    id: item.created_by_id || "",
    name: item.created_by_name,
    email: item.created_by_email || "",
    department: item.created_by_department || "",
  },
  assignedTo: item.assigned_to_id ? {
    id: item.assigned_to_id,
    name: item.assigned_to_name || "",
  } : undefined,
  resolution: item.resolution,
  resolvedAt: item.resolved_at,
  hasAttachment: !!(
    (typeof item.attachment_url === "string" && item.attachment_url.trim()) ||
    (typeof item.attachmentUrl === "string" && item.attachmentUrl.trim()) ||
    item.has_attachment
  ),
  attachmentName: item.attachment_name ?? item.attachmentName ?? null,
  createdAt: item.created_at,
  updatedAt: item.updated_at,
});

const transformTicketComment = (item: any): TicketComment => ({
  id: item.id,
  ticketId: item.ticket_id,
  message: item.message,
  authorId: item.author_id,
  authorName: item.author_name,
  authorEmail: item.author_email,
  authorRole: item.author_role,
  isStatusUpdate: item.is_status_update,
  oldStatus: item.old_status,
  newStatus: item.new_status,
  createdAt: item.created_at,
});

// ==================== HELPER FUNCTIONS ====================

/** Out-of-stock only. */
const isOutOfStock = (item: StockItem) => item.available === 0;

/** Icon component for assigned asset: Laptop for systems, Package for peripherals. */
const AssignedAssetIcon = ({ system }: { system: { assetId?: string; notes?: string } }) => {
  const isPeripheral = system.assetId?.startsWith("PERIPH");
  const notes = (system.notes || "").toLowerCase();
  if (isPeripheral) {
    if (notes.includes("headphone")) return <Headphones className="h-4 w-4 text-violet-600 shrink-0" aria-hidden />;
    if (notes.includes("mouse")) return <Mouse className="h-4 w-4 text-slate-600 shrink-0" aria-hidden />;
    if (notes.includes("lcd") || notes.includes("led") || notes.includes("monitor")) return <Monitor className="h-4 w-4 text-blue-600 shrink-0" aria-hidden />;
    if (notes.includes("keyboard")) return <Keyboard className="h-4 w-4 text-slate-600 shrink-0" aria-hidden />;
    return <Package className="h-4 w-4 text-amber-600 shrink-0" aria-hidden />;
  }
  return <Laptop className="h-4 w-4 text-blue-600 shrink-0" aria-hidden />;
};

const getPriorityBadge = (priority: string) => {
  const configs: Record<string, { label: string; className: string }> = {
    low: { label: "Low", className: "bg-slate-100 text-slate-700 border-slate-300" },
    medium: { label: "Medium", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
    high: { label: "High", className: "bg-orange-100 text-orange-700 border-orange-300" },
    critical: { label: "Critical", className: "bg-red-100 text-red-700 border-red-300 animate-pulse" }
  };
  return configs[priority] || configs.medium;
};

const getTicketStatusBadge = (status: string) => {
  const configs: Record<string, { label: string; className: string }> = {
    open: { label: "Open", className: "bg-blue-100 text-blue-700 border-blue-300" },
    in_progress: { label: "In Progress", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
    resolved: { label: "Resolved", className: "bg-green-100 text-green-700 border-green-300" },
    closed: { label: "Closed", className: "bg-slate-100 text-slate-700 border-slate-300" }
  };
  return configs[status] || configs.open;
};

const formatCalendarDate = (dateStr: string | undefined | null, tz?: string | null, df?: string | null): string => {
  if (!dateStr) return "";
  try {
    return formatLeaveDisplayDate(dateStr, tz ?? null, df ?? null);
  } catch {
    return dateStr;
  }
};

const formatTimestamp = (dateStr: string | undefined | null, tz?: string | null, df?: string | null): string => {
  if (!dateStr) return "";
  try {
    return formatDateTimeDisplay(dateStr, tz ?? null, df ?? null);
  } catch {
    return dateStr;
  }
};

const formatTimestampCompact = (dateStr: string | undefined | null, tz?: string | null, df?: string | null): string => {
  if (!dateStr) return "";
  try {
    return formatDateTimeCompact(dateStr, tz ?? null, df ?? null);
  } catch {
    return dateStr;
  }
};

// Format date for input fields (YYYY-MM-DD)
const formatDateForInput = (dateStr: string | undefined | null): string => {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
    return date.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

const generateId = () => `temp-${Date.now().toString()}`;

// ==================== DIALOG COMPONENTS ====================

// Add/Edit Stock Dialog - with product-type-specific specs. Pass defaultCategory/defaultProductType/defaultBrand when adding from a category/brand card.
function StockDialog({ item, defaultCategory, defaultProductType, defaultBrand, defaultModelName, onSave, onClose, open }: { item?: StockItem; defaultCategory?: string; defaultProductType?: string; defaultBrand?: string; defaultModelName?: string; onSave: (item: StockItem) => void; onClose: () => void; open: boolean }) {
  const defaultForm: Partial<StockItem> = {
    name: defaultModelName || "", category: defaultCategory || "Systems", productType: defaultProductType || "laptop", quantity: 0, available: 0,
    description: "", location: "IT Storage", specs: defaultBrand ? { brand: defaultBrand } : {}
  };
  const [formData, setFormData] = useState<Partial<StockItem>>(item ? {
    ...item,
    specs: item.specs || {}
  } : defaultForm);

  const selectedProductType = PRODUCT_TYPES.find(p => p.id === (formData.productType || "other")) || PRODUCT_TYPES.find(p => p.id === "other")!;

  // Update form data when item or defaults change (for editing or adding from category/brand card)
  useEffect(() => {
    if (open) {
      if (item) {
        setFormData({ ...item, specs: item.specs || {} });
      } else {
        const initialSpecs: Record<string, string | number> = defaultBrand ? { brand: defaultBrand } : {};
        setFormData({ name: defaultModelName || "", category: defaultCategory || "Systems", productType: defaultProductType || "laptop", quantity: 0, available: 0, description: "", location: "IT Storage", specs: initialSpecs });
      }
    }
  }, [item, open, defaultCategory, defaultProductType, defaultBrand, defaultModelName]);

  const handleSpecChange = (key: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      specs: { ...(prev.specs || {}), [key]: value }
    }));
  };

  const handleProductTypeChange = (productTypeId: string) => {
    const pt = PRODUCT_TYPES.find(p => p.id === productTypeId);
    setFormData(prev => ({
      ...prev,
      productType: productTypeId,
      category: pt?.category || prev.category,
      specs: {} // Reset specs when changing product type
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) { toast.error("Item name is required"); return; }
    const specs = formData.specs || {};
    Object.keys(specs).forEach(k => { if (specs[k] === "" || specs[k] == null) delete specs[k]; });
    onSave({
      id: item?.id || generateId(),
      name: formData.name || "",
      category: formData.category || selectedProductType.category,
      productType: formData.productType || undefined,
      quantity: Number(formData.quantity) || 0,
      available: Number(formData.available) || 0,
      description: formData.description || "",
      location: formData.location || "IT Storage",
      specs: Object.keys(specs).length > 0 ? specs : undefined
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Stock Item" : "Add Stock Item"}</DialogTitle>
          <DialogDescription>Fill in details. Product type determines which spec fields appear. Use a unique name per configuration (e.g. &quot;Dell Latitude i5 16GB&quot;, &quot;HP 6th Gen 8GB&quot;) so rows are easy to tell apart.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label>Product Type *</Label>
              <Select value={formData.productType || "laptop"} onValueChange={handleProductTypeChange}>
                <SelectTrigger><SelectValue placeholder="Select product type" /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map(pt => (
                    <SelectItem key={pt.id} value={pt.id}>{pt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Item Name *</Label>
              <Input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={selectedProductType ? `e.g., Dell Latitude i5 16GB, HP 6th Gen 8GB` : "e.g., Dell Latitude i5 16GB"} />
              <p className="text-xs text-muted-foreground">Use a unique name per configuration so it’s clear which row is which in the list.</p>
            </div>
            {/* Dynamic spec fields based on product type */}
            {selectedProductType.specFields.length > 0 && (
              <div className="col-span-2">
                <Separator className="my-2" />
                <p className="text-sm font-medium text-muted-foreground mb-3">Specifications</p>
                <div className="grid grid-cols-2 gap-3">
                  {selectedProductType.specFields.map(field => (
                    <div key={field.key} className="space-y-1.5">
                      <Label className="text-xs">{field.label}</Label>
                      {field.type === "select" && field.options ? (
                        <Select value={String(formData.specs?.[field.key] || "")} onValueChange={(v) => handleSpecChange(field.key, v)}>
                          <SelectTrigger className="h-9"><SelectValue placeholder={field.placeholder || "Select..."} /></SelectTrigger>
                          <SelectContent>
                            {field.options.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={formData.specs?.[field.key] ?? ""}
                          onChange={(e) => handleSpecChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="h-9"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Peripherals">Peripherals</SelectItem>
                  <SelectItem value="Components">Components</SelectItem>
                  <SelectItem value="Storage">Storage</SelectItem>
                  <SelectItem value="Network">Network</SelectItem>
                  <SelectItem value="Display">Display</SelectItem>
                  <SelectItem value="Systems">Systems</SelectItem>
                  <SelectItem value="Hardware">Hardware</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={formData.location || ""} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="IT Storage" />
            </div>
            <div className="space-y-2">
              <Label>Total Quantity</Label>
              <Input type="number" min={0} value={formData.quantity ?? 0} onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>Available</Label>
              <Input type="number" min={0} value={formData.available ?? 0} onChange={(e) => setFormData({ ...formData, available: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Description</Label>
              <Textarea value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Additional details..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit"><Save className="h-4 w-4 mr-2" />{item ? "Update" : "Add"} Item</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Stock detail: right-side panel (inventory only — quantities, not people)
function StockDetailSheet({ item, onClose, open, onEdit, onShowQr }: { item?: StockItem; onClose: () => void; open: boolean; onEdit: (item: StockItem) => void; onShowQr?: (type: "stock", id: string, label: string, publicId?: string) => void }) {
  if (!item) return null;
  const assignments = (item as StockItem & { assignments?: StockAssignment[] }).assignments || [];
  const specEntries = item.specs && typeof item.specs === "object" && Object.keys(item.specs).length > 0
    ? Object.entries(item.specs) as [string, string | number][]
    : [];
  const productTypeLabel = item.productType ? PRODUCT_TYPES.find(pt => pt.id === item.productType)?.label ?? String(item.productType) : null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-muted"><Package className="h-5 w-5 text-muted-foreground" /></div>
            <span>{item.name}</span>
          </DialogTitle>
          <DialogDescription>Inventory item — quantities and specs. Assigned units are listed in the table below.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground block text-xs">Category</span><p className="font-medium">{item.category}</p></div>
            {productTypeLabel && <div><span className="text-muted-foreground block text-xs">Product type</span><p className="font-medium">{productTypeLabel}</p></div>}
            <div><span className="text-muted-foreground block text-xs">Location</span><p className="font-medium">{item.location || "—"}</p></div>
            <div><span className="text-muted-foreground block text-xs">Stock</span><p className="font-medium">Total: {item.quantity} · Available: <span className="text-green-600 dark:text-green-400">{item.available}</span> · Assigned: {assignments.length}</p></div>
          </div>
          {specEntries.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Specs</p>
              <div className="flex flex-wrap gap-2">
                {specEntries.map(([k, v]) => (
                  <Badge key={k} variant="secondary" className="font-normal capitalize">{k.replace(/([A-Z])/g, " $1").trim()}: {String(v)}</Badge>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Assigned units ({assignments.length})</p>
            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No units assigned. Use “Assign from stock” to assign to an employee.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Employee</TableHead>
                      <TableHead className="font-mono">Asset ID</TableHead>
                      <TableHead className="w-[120px] text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.userName}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{a.assetId}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/assets/${a.id}`}>View profile</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          {item.description && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Description</p>
              <p className="text-sm bg-muted/50 rounded-lg p-3 whitespace-pre-wrap">{item.description}</p>
            </div>
          )}
        </div>
        <DialogFooter className="flex gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {item.assetId && onShowQr && (
            <Button variant="outline" onClick={() => { onShowQr("stock", item.id, item.assetId || item.name, item.assetId ?? undefined); }}>
              <QrCode className="h-4 w-4 mr-2" /> QR code
            </Button>
          )}
          <Button onClick={() => { onClose(); onEdit(item); }}><Edit2 className="h-4 w-4 mr-2" /> Edit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Drawer: list of assigned employees for a stock item (opened when clicking Assigned number)
function StockAssignedDrawer({ item, open, onClose }: { item?: StockItem | null; open: boolean; onClose: () => void }) {
  if (!item) return null;
  const assignments = (item as StockItem & { assignments?: StockAssignment[] }).assignments || [];
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto" side="right">
        <SheetHeader className="border-b pb-4">
          <SheetTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            Assigned units — {item.name}
          </SheetTitle>
          <SheetDescription>Employees who have this item assigned. Click “View profile” to open the asset record.</SheetDescription>
        </SheetHeader>
        <div className="pt-4 space-y-2">
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No units assigned.</p>
          ) : (
            assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card text-card-foreground">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{a.userName}</p>
                  <p className="text-xs text-muted-foreground font-mono">Asset ID: {a.assetId}</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/assets/${a.id}`}>View profile</Link>
                </Button>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const overviewRowClass =
  "flex items-start justify-between gap-3 p-2 rounded-lg bg-muted/50 cursor-pointer transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function OverviewAssignmentDetailDialog({
  system,
  open,
  onClose,
  stockItems,
  onOpenStock,
  timeZone,
  dateFormat,
}: {
  system?: AssignedSystem;
  open: boolean;
  onClose: () => void;
  stockItems: (StockItem & { assignments?: StockAssignment[] })[];
  onOpenStock: (item: StockItem) => void;
  timeZone?: string | null;
  dateFormat?: string | null;
}) {
  const systemId = system?.id;
  const { data: fresh, isLoading } = useQuery({
    queryKey: ["/api/assets/systems", systemId],
    enabled: open && !!systemId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/assets/systems/${systemId}`);
      return transformSystem(await res.json());
    },
  });
  const { data: audit = [] } = useQuery({
    queryKey: ["/api/assets/audit", "system", systemId],
    enabled: open && !!systemId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/assets/audit?entityType=system&entityId=${systemId}&limit=30`);
      return (await res.json()) as AssetAuditEntry[];
    },
  });

  const s = fresh ?? system;
  if (!s) return null;

  const createAudit = audit.find((a) => a.action === "create");
  const createChanges = createAudit ? parseAuditChangesClient(createAudit.changes) : {};
  const stockItemId =
    s.stockItemId ||
    (createChanges.stockItemId as string) ||
    (createChanges.stock_item_id as string) ||
    undefined;
  const stockItem = stockItemId ? stockItems.find((st) => st.id === stockItemId) : undefined;

  const isPeripheral = s.assetId?.startsWith("PERIPH");
  const peripheralLabel = isPeripheral && s.notes ? s.notes.split(" | ")[0]?.trim() : null;
  const assetLabel = s.assetName || peripheralLabel || "Assigned asset";

  const specBits = [
    s.processor && s.generation ? `${s.processor} ${s.generation}` : s.processor,
    s.ram,
    s.storage,
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Laptop className="h-5 w-5 text-blue-600" />
            Assignment details
          </DialogTitle>
          <DialogDescription>Who received this unit, when it was assigned, and linked stock.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <OverviewDetailField label="Assigned to">{s.userName}</OverviewDetailField>
              <OverviewDetailField label="Work email">{s.userEmail || "—"}</OverviewDetailField>
              <OverviewDetailField label="Employee ID">{s.employeeId || "—"}</OverviewDetailField>
              <OverviewDetailField label="Department">{s.department || "—"}</OverviewDetailField>
              <OverviewDetailField label="Asset ID">
                <span className="font-mono text-xs">{s.assetId}</span>
              </OverviewDetailField>
              <OverviewDetailField label="Item">{assetLabel}</OverviewDetailField>
              {specBits.length > 0 && (
                <div className="col-span-2">
                  <OverviewDetailField label="Unit specs">
                    <span className="font-normal text-muted-foreground">{specBits.join(" · ")}</span>
                  </OverviewDetailField>
                </div>
              )}
              <OverviewDetailField label="Assigned on">
                {s.createdAt ? formatTimestamp(s.createdAt, timeZone, dateFormat) : "—"}
              </OverviewDetailField>
              <OverviewDetailField label="Assigned by (audit)">
                {createAudit?.user_email || "—"}
              </OverviewDetailField>
            </div>
            {stockItem && (
              <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Source stock: {stockItem.name}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Total qty</p>
                    <p className="font-semibold">{stockItem.quantity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Available</p>
                    <p className="font-semibold text-green-600 dark:text-green-400">{stockItem.available}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Assigned units</p>
                    <p className="font-semibold">{stockItem.quantity - stockItem.available}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    onClose();
                    onOpenStock(stockItem);
                  }}
                >
                  View full stock item
                </Button>
              </div>
            )}
            {s.notes && (
              <OverviewDetailField label="Notes">
                <span className="font-normal text-muted-foreground whitespace-pre-wrap">{s.notes}</span>
              </OverviewDetailField>
            )}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button asChild>
            <Link href={`/assets/${s.id}`}>Open asset profile</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OverviewReturnDetailDialog({
  item,
  open,
  onClose,
  stockItems,
  onOpenStock,
  timeZone,
  dateFormat,
}: {
  item?: RecentAssetReturn;
  open: boolean;
  onClose: () => void;
  stockItems: (StockItem & { assignments?: StockAssignment[] })[];
  onOpenStock: (item: StockItem) => void;
  timeZone?: string | null;
  dateFormat?: string | null;
}) {
  const assignmentId = item?.assignmentId;
  const { data: audit = [] } = useQuery({
    queryKey: ["/api/assets/audit", "system", assignmentId],
    enabled: open && !!assignmentId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/assets/audit?entityType=system&entityId=${assignmentId}&limit=30`);
      return (await res.json()) as AssetAuditEntry[];
    },
  });

  if (!item) return null;

  const stockItem = item.stockItemId ? stockItems.find((st) => st.id === item.stockItemId) : undefined;
  const returnAudit = audit.find((a) => a.id === item.auditId);
  const createAudit = audit.find((a) => a.action === "create");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-green-600" />
            Return to stock
          </DialogTitle>
          <DialogDescription>This unit was removed from the employee and returned to inventory.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <OverviewDetailField label="Former assignee">{item.assigneeName}</OverviewDetailField>
            <OverviewDetailField label="Reason">
              <Badge variant="outline" className="font-normal text-green-700 border-green-300 dark:text-green-400">
                {item.reasonLabel}
              </Badge>
            </OverviewDetailField>
            <OverviewDetailField label="Returned at">
              {formatTimestamp(item.returnedAt, timeZone, dateFormat)}
            </OverviewDetailField>
            <OverviewDetailField label="Performed by">
              {item.performedByEmail || returnAudit?.user_email || "—"}
            </OverviewDetailField>
            <OverviewDetailField label="Asset ID">
              <span className="font-mono text-xs">{item.publicAssetId || "—"}</span>
            </OverviewDetailField>
            <OverviewDetailField label="Stock line">
              {item.stockItemName || stockItem?.name || "—"}
            </OverviewDetailField>
          </div>
          {createAudit && (
            <div className="rounded-lg border p-3 bg-muted/30 text-sm space-y-1">
              <p className="font-medium">Originally assigned</p>
              <p className="text-muted-foreground text-xs">
                {createAudit.user_email ? `By ${createAudit.user_email}` : "—"}
                {createAudit.created_at
                  ? ` · ${formatTimestamp(createAudit.created_at, timeZone, dateFormat)}`
                  : ""}
              </p>
            </div>
          )}
          {stockItem && (
            <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
              <p className="text-sm font-medium">Current stock levels</p>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Total qty</p>
                  <p className="font-semibold">{stockItem.quantity}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Available now</p>
                  <p className="font-semibold text-green-600 dark:text-green-400">{stockItem.available}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-semibold text-xs">{stockItem.category}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  onClose();
                  onOpenStock(stockItem);
                }}
              >
                View stock item
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Edit System Dialog (existing assignment only)
function SystemDialog({ item, onSave, onClose, open }: { item?: AssignedSystem; onSave: (item: AssignedSystem) => void; onClose: () => void; open: boolean }) {
  const [formData, setFormData] = useState<Partial<AssignedSystem>>(item || {
    userName: "", userEmail: "", ram: "16 GB", storage: "256 GB", processor: "i5", generation: "8th Gen"
  });
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(item?.userId || "");

  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/employees"); return res.json(); },
    enabled: open,
  });

  useEffect(() => {
    if (open && item) {
      setFormData(item);
      setSelectedEmployeeId(item.userId || "");
    }
  }, [item, open]);

  const handleEmployeeChange = (empId: string) => {
    setSelectedEmployeeId(empId);
    const emp = employees.find((e: any) => e.id === empId);
    if (emp) {
      setFormData((prev) => ({
        ...prev,
        userId: emp.id,
        userName: formatEmployeeAssetAssigneeName(emp.first_name, emp.last_name, emp.nickname),
        userEmail: emp.work_email || "",
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item?.id || (!formData.userName && !selectedEmployeeId)) { toast.error("Employee is required"); return; }
    onSave({
      ...item,
      userId: selectedEmployeeId || item.userId,
      userName: formData.userName || "",
      userEmail: formData.userEmail || "",
      ram: formData.ram || "16 GB",
      storage: formData.storage || "256 GB",
      processor: formData.processor || "i5",
      generation: formData.generation || "8th Gen",
      notes: formData.notes
    });
    onClose();
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit System Assignment</DialogTitle>
          <DialogDescription>Update assignment details</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label>Assigned To *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    <span className="truncate">{selectedEmployeeId ? (employees.find((e: any) => e.id === selectedEmployeeId) ? employeeAssetPickerLabel(employees.find((e: any) => e.id === selectedEmployeeId)) : formData.userName) : (formData.userName || "Select employee...")}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search employees..." />
                    <CommandList>
                      <CommandEmpty>No employee found.</CommandEmpty>
                      <CommandGroup>
                        {employees.map((emp: any) => (
                          <CommandItem
                            key={emp.id}
                            value={`${emp.first_name} ${emp.last_name} ${emp.nickname || ""} ${emp.employee_id} ${emp.department || ""}`}
                            onSelect={() => handleEmployeeChange(emp.id)}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{employeeAssetPickerLabel(emp)}</span>
                              <span className="text-xs text-muted-foreground">{emp.employee_id} · {emp.department || "-"}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>RAM</Label>
              <Select value={formData.ram} onValueChange={(v) => setFormData({ ...formData, ram: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="4 GB">4 GB</SelectItem>
                  <SelectItem value="8 GB">8 GB</SelectItem>
                  <SelectItem value="12 GB">12 GB</SelectItem>
                  <SelectItem value="16 GB">16 GB</SelectItem>
                  <SelectItem value="32 GB">32 GB</SelectItem>
                  <SelectItem value="64 GB">64 GB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Storage</Label>
              <Select value={formData.storage} onValueChange={(v) => setFormData({ ...formData, storage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="128 GB">128 GB</SelectItem>
                  <SelectItem value="238 GB">238 GB</SelectItem>
                  <SelectItem value="256 GB">256 GB</SelectItem>
                  <SelectItem value="477 GB">477 GB</SelectItem>
                  <SelectItem value="500 GB">500 GB</SelectItem>
                  <SelectItem value="512 GB">512 GB</SelectItem>
                  <SelectItem value="1 TB">1 TB</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Processor</Label>
              <Select value={formData.processor} onValueChange={(v) => setFormData({ ...formData, processor: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="i3">Intel Core i3</SelectItem>
                  <SelectItem value="i5">Intel Core i5</SelectItem>
                  <SelectItem value="i7">Intel Core i7</SelectItem>
                  <SelectItem value="i9">Intel Core i9</SelectItem>
                  <SelectItem value="Ryzen 5">AMD Ryzen 5</SelectItem>
                  <SelectItem value="Ryzen 7">AMD Ryzen 7</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Generation</Label>
              <Select value={formData.generation} onValueChange={(v) => setFormData({ ...formData, generation: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3rd Gen">3rd Gen</SelectItem>
                  <SelectItem value="6th Gen">6th Gen</SelectItem>
                  <SelectItem value="8th Gen">8th Gen</SelectItem>
                  <SelectItem value="10th Gen">10th Gen</SelectItem>
                  <SelectItem value="11th Gen">11th Gen</SelectItem>
                  <SelectItem value="12th Gen">12th Gen</SelectItem>
                  <SelectItem value="13th Gen">13th Gen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Notes</Label>
              <Input value={formData.notes || ""} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit"><Save className="h-4 w-4 mr-2" />{item ? "Update" : "Assign"} System</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Ticket Detail Dialog for IT Admins
function TicketDetailDialog({ 
  ticket, 
  deepLinkOpen,
  onCloseAfterDeepLink,
}: { 
  ticket: SupportTicket; 
  deepLinkOpen?: boolean;
  onCloseAfterDeepLink?: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [newStatus, setNewStatus] = useState(ticket.status);
  const [statusComment, setStatusComment] = useState("");
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [assigneeId, setAssigneeId] = useState(ticket.assignedTo?.id || "");

  // Fetch comments for this ticket
  const { data: comments = [], isLoading: loadingComments, refetch: refetchComments } = useQuery({
    queryKey: ["ticket-comments", ticket.id],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/assets/tickets/${ticket.id}/comments`);
      const data = await response.json();
      return Array.isArray(data) ? data.map(transformTicketComment) : [];
    },
    enabled: open,
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", `/api/assets/tickets/${ticket.id}/comments`, { message });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets/tickets"] });
      toast.success("Comment added successfully");
      setReply("");
    },
    onError: (error: any) => {
      toast.error("Failed to add comment", {
        description: error.message || "Please try again"
      });
    }
  });

  const { data: itAssignees = [], isLoading: loadingAssignees } = useQuery({
    queryKey: ["/api/assets/tickets/it-assignees"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/assets/tickets/it-assignees");
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: open,
  });

  const assignMutation = useMutation({
    mutationFn: async (payload: { assignedToId: string | null; assignedToName: string | null }) => {
      const response = await apiRequest("PATCH", `/api/assets/tickets/${ticket.id}`, payload);
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets/tickets"] });
      setAssigneeId(variables.assignedToId || "");
      toast.success(variables.assignedToId ? "Ticket assigned — assignee notified by email" : "Ticket unassigned");
    },
    onError: (error: any) => {
      toast.error("Failed to update assignment", {
        description: error.message || "Please try again",
      });
    },
  });

  // Status change mutation
  const statusMutation = useMutation({
    mutationFn: async ({ status, comment }: { status: string; comment?: string }) => {
      const response = await apiRequest("PATCH", `/api/assets/tickets/${ticket.id}/status`, { status, comment });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets/tickets"] });
      toast.success("Ticket status updated — creator notified by email");
      setShowStatusDialog(false);
      setStatusComment("");
    },
    onError: (error: any) => {
      toast.error("Failed to update status", {
        description: error.message || "Please try again"
      });
    }
  });

  const handleReply = () => {
    if (!reply.trim()) return;
    addCommentMutation.mutate(reply);
  };

  const handleStatusChange = () => {
    statusMutation.mutate({ status: newStatus, comment: statusComment || undefined });
  };

  const getAuthorRoleLabel = (role: string) => {
    switch (role) {
      case "it_support": return "IT Support";
      case "admin": return "Admin";
      case "employee": return "Employee";
      default: return role;
    }
  };

  const priorityBadge = getPriorityBadge(ticket.priority);
  const statusBadge = getTicketStatusBadge(ticket.status);

  useEffect(() => {
    if (deepLinkOpen) setOpen(true);
  }, [deepLinkOpen, ticket.id]);

  useEffect(() => {
    setAssigneeId(ticket.assignedTo?.id || "");
    setNewStatus(ticket.status);
  }, [ticket.id, ticket.assignedTo?.id, ticket.status]);

  const handleAssigneeChange = (value: string) => {
    if (assignMutation.isPending) return;
    if (value === "__none__") {
      assignMutation.mutate({ assignedToId: null, assignedToName: null });
      return;
    }
    const emp = itAssignees.find((e: { id: string }) => e.id === value);
    if (!emp) return;
    assignMutation.mutate({
      assignedToId: emp.id,
      assignedToName: formatEmployeeLegalName(emp.first_name, emp.last_name),
    });
  };

  return (
    <>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => setOpen(true)}
        className="gap-1"
      >
        <Eye className="h-4 w-4" />
        View
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next && deepLinkOpen) onCloseAfterDeepLink?.();
        }}
      >
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <DialogTitle className="flex items-center gap-2">
                <TicketIcon className="h-5 w-5 text-primary" />
                {ticket.ticketNumber}
              </DialogTitle>
              <div className="flex gap-2">
                <Badge variant="outline" className={priorityBadge.className}>
                  {priorityBadge.label}
                </Badge>
                <Badge variant="outline" className={statusBadge.className}>
                  {statusBadge.label}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {/* Ticket Info */}
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-semibold text-lg">{ticket.title}</h4>
              <p className="text-sm text-muted-foreground mt-1">{ticket.description}</p>
              {ticket.assetName && (
                <p className="text-sm mt-2">
                  <span className="text-muted-foreground">Related Asset:</span> {ticket.assetName}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Created By</p>
                  <p className="font-medium">{ticket.createdBy.name}</p>
                  <p className="text-xs text-muted-foreground">{ticket.createdBy.email}</p>
                  {ticket.createdBy.department && (
                    <p className="text-xs text-muted-foreground">{ticket.createdBy.department}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p>{formatTimestamp(ticket.createdAt, user?.timeZone ?? null, user?.dateFormat ?? null)}</p>
                  <p className="text-xs text-muted-foreground">Updated: {formatTimestamp(ticket.updatedAt, user?.timeZone ?? null, user?.dateFormat ?? null)}</p>
                </div>
              </div>
            </div>

            {ticket.hasAttachment && (
              <TicketAttachmentPreview ticketId={ticket.id} fileName={ticket.attachmentName} />
            )}

            {/* Status Management */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Status:</span>
                <Badge variant="outline" className={statusBadge.className}>
                  {statusBadge.label}
                </Badge>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowStatusDialog(true)}
              >
                Update Status
              </Button>
            </div>

            {/* Assignment */}
            <div className="p-3 border rounded-lg space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Assigned to</span>
                {ticket.assignedTo?.name && !assigneeId && (
                  <span className="text-xs text-muted-foreground">Previously: {ticket.assignedTo.name}</span>
                )}
              </div>
              <Select
                value={assigneeId || "__none__"}
                onValueChange={handleAssigneeChange}
                disabled={assignMutation.isPending || loadingAssignees}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingAssignees ? "Loading IT team…" : "Select IT assignee…"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {itAssignees.map((emp: { id: string; first_name: string; last_name: string; job_title?: string }) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {formatEmployeeLegalName(emp.first_name, emp.last_name)}
                      {emp.job_title ? ` · ${emp.job_title}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Assigning notifies the IT team member by email.
              </p>
            </div>

            <Separator />

            {/* Activity Log / Comments */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h5 className="font-medium flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Activity Log
                </h5>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => refetchComments()}
                  disabled={loadingComments}
                >
                  <RefreshCw className={`h-4 w-4 ${loadingComments ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <ScrollArea className="h-[200px] border rounded-lg p-3">
                {loadingComments ? (
                  <div className="flex justify-center py-4">
                    <Spinner className="h-6 w-6" />
                  </div>
                ) : comments.length > 0 ? (
                  <div className="space-y-3">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className={`p-3 rounded-lg ${
                          (comment.isStatusUpdate === true || comment.isStatusUpdate === "true")
                            ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                            : comment.authorRole === "employee"
                              ? "bg-primary/5 border border-primary/20 ml-4"
                              : "bg-muted mr-4"
                        }`}
                      >
                        {(comment.isStatusUpdate === true || comment.isStatusUpdate === "true") ? (
                          <div className="flex items-center gap-2 text-sm flex-wrap">
                            <span className="font-medium">{comment.authorName}</span>
                            <span className="text-muted-foreground">changed status:</span>
                            <Badge variant="outline" className={getTicketStatusBadge(comment.oldStatus || "").className}>
                              {getTicketStatusBadge(comment.oldStatus || "").label}
                            </Badge>
                            <span>→</span>
                            <Badge variant="outline" className={getTicketStatusBadge(comment.newStatus || "").className}>
                              {getTicketStatusBadge(comment.newStatus || "").label}
                            </Badge>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{comment.authorName}</span>
                              <Badge variant="outline" className="text-xs">
                                {getAuthorRoleLabel(comment.authorRole)}
                              </Badge>
                            </div>
                            <p className="text-sm">{comment.message}</p>
                          </>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTimestamp(comment.createdAt, user?.timeZone ?? null, user?.dateFormat ?? null)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No activity yet.
                  </p>
                )}
              </ScrollArea>
            </div>

            {/* Reply Box */}
            {ticket.status !== "closed" && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>Add Response</Label>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Type your response to the employee..."
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={2}
                      className="flex-1"
                      disabled={addCommentMutation.isPending}
                    />
                    <Button 
                      onClick={handleReply} 
                      size="icon" 
                      className="h-auto"
                      disabled={addCommentMutation.isPending || !reply.trim()}
                    >
                      {addCommentMutation.isPending ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Resolution info */}
            {ticket.resolution && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <h5 className="font-medium text-green-800 dark:text-green-300 mb-1 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Resolution
                </h5>
                <p className="text-sm text-green-700 dark:text-green-400">{ticket.resolution}</p>
                {ticket.resolvedAt && (
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                    Resolved on {formatTimestamp(ticket.resolvedAt, user?.timeZone ?? null, user?.dateFormat ?? null)}
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Update Ticket Status</DialogTitle>
            <DialogDescription>
              Change the status of this ticket. An update will be logged and visible to the employee.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as typeof newStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Comment (Optional)</Label>
              <Textarea
                placeholder="Add a note about this status change..."
                value={statusComment}
                onChange={(e) => setStatusComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleStatusChange}
              disabled={statusMutation.isPending || newStatus === ticket.status}
            >
              {statusMutation.isPending ? (
                <Spinner className="h-4 w-4 mr-2" />
              ) : null}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Add/Edit Invoice Dialog
function InvoiceDialog({ item, onSave, onClose, open }: { item?: Invoice; onSave: (inv: Invoice) => void; onClose: () => void; open: boolean }) {
  const [formData, setFormData] = useState<Partial<Invoice> & { filePath?: string | null }>(item ?? {
    invoiceNumber: "", vendor: "", purchaseDate: new Date().toISOString().split("T")[0], totalAmount: "", items: "", status: "pending", notes: ""
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      if (item) {
        setFormData({
          ...item,
          purchaseDate: item.purchaseDate ? formatDateForInput(String(item.purchaseDate)) : new Date().toISOString().split("T")[0],
          filePath: item.filePath ?? undefined,
        });
      } else {
        setFormData({
          invoiceNumber: "", vendor: "", purchaseDate: new Date().toISOString().split("T")[0], totalAmount: "", items: "", status: "pending", notes: "",
          fileName: null, fileType: null, filePath: null,
        });
      }
    }
  }, [item, open]);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Please select a PDF file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setFormData((prev) => ({ ...prev, fileName: file.name, fileType: file.type, filePath: dataUrl }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const handleRemoveFile = () => {
    setFormData((prev) => ({ ...prev, fileName: null, fileType: null, filePath: null }));
    fileInputRef.current?.value && (fileInputRef.current.value = "");
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.invoiceNumber?.trim()) { toast.error("Invoice number is required"); return; }
    if (!formData.vendor?.trim()) { toast.error("Vendor is required"); return; }
    if (!formData.items?.trim()) { toast.error("Items description is required"); return; }
    const purchaseDate = formData.purchaseDate ? new Date(formData.purchaseDate).toISOString() : new Date().toISOString();
    onSave({
      id: item?.id ?? "",
      invoiceNumber: formData.invoiceNumber!.trim(),
      vendor: formData.vendor!.trim(),
      purchaseDate,
      totalAmount: formData.totalAmount !== undefined && formData.totalAmount !== "" ? Number(formData.totalAmount) : 0,
      items: formData.items!.trim(),
      status: (formData.status as Invoice["status"]) ?? "pending",
      notes: formData.notes?.trim() || null,
      fileName: formData.fileName ?? item?.fileName ?? null,
      fileType: formData.fileType ?? item?.fileType ?? null,
      filePath: formData.filePath ?? item?.filePath ?? null,
    });
    onClose();
  };
  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Invoice" : "Add Invoice"}</DialogTitle>
          <DialogDescription>Record a purchase invoice for asset tracking. You can attach a PDF.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Invoice number *</Label>
              <Input value={formData.invoiceNumber ?? ""} onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })} placeholder="e.g. INV-2024-001" />
            </div>
            <div className="space-y-2">
              <Label>Vendor *</Label>
              <Input value={formData.vendor ?? ""} onChange={(e) => setFormData({ ...formData, vendor: e.target.value })} placeholder="Vendor name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Purchase date *</Label>
              <Input type="date" value={formData.purchaseDate ?? ""} onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Total amount</Label>
              <Input type="number" step="0.01" min="0" value={formData.totalAmount ?? ""} onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })} placeholder="0.00" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Items / description *</Label>
            <Textarea value={formData.items ?? ""} onChange={(e) => setFormData({ ...formData, items: e.target.value })} placeholder="e.g. 5x Laptop, 2x Monitor" rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Upload PDF (optional)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleFileChange}
              aria-label="Choose PDF file"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <FileText className="h-4 w-4 mr-2" /> Choose PDF
              </Button>
              {(formData.fileName || item?.fileName) && (
                <>
                  <span className="text-sm text-muted-foreground truncate max-w-[180px]" title={formData.fileName || item?.fileName || ""}>
                    {formData.fileName || item?.fileName}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={handleRemoveFile} className="text-muted-foreground">Remove</Button>
                </>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={formData.status ?? "pending"} onValueChange={(v) => setFormData({ ...formData, status: v as Invoice["status"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={formData.notes ?? ""} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes" rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit"><Save className="h-4 w-4 mr-2" /> Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// QR Code Dialog — show QR (client-generated when publicId is set, else API). Works even when API isn't reached.
function QRCodeDialog({ open, onClose, type, id, label, publicId }: { open: boolean; onClose: () => void; type: "stock" | "system"; id: string; label: string; publicId?: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrBlobUrl, setQrBlobUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const publicViewUrl = publicId ? `${window.location.origin}/assets/view/${encodeURIComponent(publicId)}` : null;

  useEffect(() => {
    if (!open || (!id && !publicId)) {
      setQrDataUrl(null);
      setQrBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    if (publicViewUrl) {
      setQrLoading(true);
      QRCode.toDataURL(publicViewUrl, { width: 256, margin: 2, type: "image/png" })
        .then(setQrDataUrl)
        .catch(() => toast.error("Failed to generate QR code"))
        .finally(() => setQrLoading(false));
      return;
    }
    let blobUrl: string | null = null;
    setQrLoading(true);
    setQrDataUrl(null);
    fetch(`/api/assets/${type}/${encodeURIComponent(id)}/qr?size=256`, { credentials: "include" })
      .then((res) => {
        const contentType = (res.headers.get("Content-Type") || "").toLowerCase();
        if (contentType.includes("text/html")) throw new Error("HTML");
        if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to load QR");
        if (!contentType.includes("image/")) throw new Error("Not an image");
        return res.blob();
      })
      .then((blob) => {
        blobUrl = URL.createObjectURL(blob);
        setQrBlobUrl(blobUrl);
      })
      .catch((err) => {
        if (err?.message === "HTML") toast.error("QR request hit the app instead of the API. Restart the dev server (npm run dev).");
        else if (err?.message === "Unauthorized") toast.error("Please sign in again.");
        else toast.error("Failed to load QR code");
      })
      .finally(() => setQrLoading(false));
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [open, id, type, publicId, publicViewUrl]);

  const handleDownload = async () => {
    try {
      if (publicViewUrl) {
        const dataUrl = await QRCode.toDataURL(publicViewUrl, { width: 512, margin: 2, type: "image/png" });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `asset-qr-${label.replace(/\s+/g, "-")}.png`;
        a.click();
        toast.success("QR code downloaded");
        return;
      }
      const res = await fetch(`/api/assets/${type}/${encodeURIComponent(id)}/qr?size=512`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to generate");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `asset-qr-${label.replace(/\s+/g, "-")}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("QR code downloaded");
    } catch {
      toast.error("Failed to download QR code");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            QR code
          </DialogTitle>
          <DialogDescription>
            Scan to open asset details on any device. Print and stick on the asset if needed.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="w-64 h-64 rounded-lg border bg-white flex items-center justify-center">
            {qrLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {!qrLoading && (qrDataUrl || qrBlobUrl) && <img src={qrDataUrl || qrBlobUrl!} alt="Asset QR code" className="w-full h-full object-contain rounded-lg" />}
            {!qrLoading && !qrDataUrl && !qrBlobUrl && <div className="text-sm text-muted-foreground">No preview</div>}
          </div>
          <Button variant="outline" className="w-full" onClick={handleDownload} disabled={qrLoading}>
            <Download className="h-4 w-4 mr-2" />
            Download PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Delete Confirmation Dialog
function DeleteConfirmDialog({ open, onClose, onConfirm, itemName, type }: { open: boolean; onClose: () => void; onConfirm: () => void; itemName: string; type?: string }) {
  const consequence = type === "stock"
    ? "This will permanently remove the stock item from inventory. Assigned units will not be automatically unassigned."
    : type === "system"
      ? "This assignment will be removed and the unit will return to available stock (if it was assigned from stock)."
      : type === "invoice"
        ? "This invoice record will be permanently removed from asset management."
        : type === "ticket"
          ? "This support ticket and its comments will be permanently removed."
          : "This action cannot be undone. This will permanently delete this item from the system.";
  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {itemName}?</AlertDialogTitle>
          <AlertDialogDescription>{consequence}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const generateTicketNumber = () => {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `TKT-${year}-${random}`;
};

function CreateTicketForEmployeeDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [formData, setFormData] = useState({
    assetId: "none",
    title: "",
    description: "",
    priority: "medium" as SupportTicket["priority"],
    status: "open" as SupportTicket["status"],
  });
  const [attachment, setAttachment] = useState<{ dataUrl: string; name: string } | null>(null);

  const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
  const ACCEPT_TYPES = "image/*,.pdf,.txt,.log";

  const { data: employeeSystems = [], isLoading: loadingSystems } = useQuery({
    queryKey: ["/api/assets/systems/user", employeeId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/assets/systems/user/${employeeId}`);
      const data = await res.json();
      return Array.isArray(data) ? data.map(transformSystem) : [];
    },
    enabled: open && !!employeeId,
  });

  useEffect(() => {
    if (!open) {
      setEmployeeId("");
      setFormData({ assetId: "none", title: "", description: "", priority: "medium", status: "open" });
      setAttachment(null);
    }
  }, [open]);

  useEffect(() => {
    setFormData((f) => ({ ...f, assetId: "none" }));
  }, [employeeId]);

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      toast.error("File must be less than 5MB");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAttachment({ dataUrl, name: file.name });
    } catch {
      toast.error("Failed to read file");
    }
    e.target.value = "";
  };

  const createTicketMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await apiRequest("POST", "/api/assets/tickets", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets/tickets"] });
      toast.success("Support ticket logged for employee");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error("Failed to create ticket", { description: error.message || "Please try again" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) {
      toast.error("Please select the employee this ticket is for");
      return;
    }
    if (!formData.title.trim()) {
      toast.error("Please enter an issue title");
      return;
    }
    if (!formData.description.trim()) {
      toast.error("Please describe the issue");
      return;
    }

    const selectedSystem =
      formData.assetId !== "none" ? employeeSystems.find((s) => s.id === formData.assetId) : null;
    const assetLabel = selectedSystem
      ? selectedSystem.assetName ||
        [selectedSystem.processor, selectedSystem.generation].filter(Boolean).join(" ") ||
        selectedSystem.assetId
      : null;

    createTicketMutation.mutate({
      ticketNumber: generateTicketNumber(),
      onBehalfOfEmployeeId: employeeId,
      assetId: formData.assetId !== "none" ? formData.assetId : null,
      assetName: assetLabel,
      title: formData.title.trim(),
      description: formData.description.trim(),
      priority: formData.priority,
      status: formData.status,
      attachmentUrl: attachment?.dataUrl ?? undefined,
      attachmentName: attachment?.name ?? undefined,
    });
  };

  const selectedSystem = employeeSystems.find((s) => s.id === formData.assetId);
  const loading = createTicketMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TicketIcon className="h-5 w-5 text-primary" />
            Log Ticket for Employee
          </DialogTitle>
          <DialogDescription>
            Create a support ticket on behalf of an employee who requested help in person, by phone, or chat.
            The ticket will appear under their name for records and notifications.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Employee *</Label>
            <EmployeeSelect
              value={employeeId}
              onChange={setEmployeeId}
              placeholder="Select employee who requested support..."
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label>Related device (optional)</Label>
            <Select
              value={formData.assetId}
              onValueChange={(value) => setFormData({ ...formData, assetId: value })}
              disabled={!employeeId || loadingSystems || loading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !employeeId
                      ? "Select an employee first"
                      : loadingSystems
                        ? "Loading devices..."
                        : "Link to a device if relevant"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific device</SelectItem>
                {employeeSystems.map((system) => {
                  const name =
                    system.assetName ||
                    [system.processor, system.generation].filter(Boolean).join(" ") ||
                    system.assetId;
                  return (
                    <SelectItem key={system.id} value={system.id}>
                      <div className="flex items-center gap-2">
                        <Laptop className="h-4 w-4" />
                        <span>
                          {name} ({system.assetId})
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedSystem && (
              <p className="text-xs text-muted-foreground">
                {selectedSystem.processor} {selectedSystem.generation} · {selectedSystem.ram} RAM ·{" "}
                {selectedSystem.storage}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Issue title *</Label>
            <Input
              placeholder="e.g. VPN not connecting, laptop screen flickering"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) =>
                  setFormData({ ...formData, priority: value as SupportTicket["priority"] })
                }
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value as SupportTicket["status"] })
                }
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea
              placeholder="What did the employee report? Include channel (walk-up, phone, Teams), symptoms, and any actions already taken..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              disabled={loading}
              rows={5}
            />
          </div>

          <div className="space-y-2">
            <Label>Attachment (optional)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_TYPES}
              className="hidden"
              onChange={handleFileChange}
            />
            {attachment ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm truncate" title={attachment.name}>
                    {attachment.name}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setAttachment(null)}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-4 text-center text-muted-foreground cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30"
              >
                <Paperclip className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm">Click to attach screenshot or document</p>
                <p className="text-xs">Images, PDF, .txt, .log (max 5MB)</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              Log ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ==================== MAIN COMPONENT ====================

export default function Assets() {
  const { user, isAdmin, isHR, isIT } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [searchTerm, setSearchTerm] = useState("");

  // Dialog states
  const [stockDialog, setStockDialog] = useState<{ open: boolean; item?: StockItem; defaultCategory?: string; defaultProductType?: string; defaultBrand?: string; defaultModelName?: string }>({ open: false });
  const [stockDetailSheet, setStockDetailSheet] = useState<{ open: boolean; item?: StockItem }>({ open: false });
  const [stockAssignedDrawer, setStockAssignedDrawer] = useState<{ open: boolean; item?: StockItem | null }>({ open: false, item: null });
  const [overviewAssignmentDetail, setOverviewAssignmentDetail] = useState<{ open: boolean; system?: AssignedSystem }>({ open: false });
  const [overviewReturnDetail, setOverviewReturnDetail] = useState<{ open: boolean; item?: RecentAssetReturn }>({ open: false });
  const [assignFromStockOpen, setAssignFromStockOpen] = useState(false);
  const [systemDialog, setSystemDialog] = useState<{ open: boolean; item?: AssignedSystem }>({ open: false });
  const [invoiceDialog, setInvoiceDialog] = useState<{ open: boolean; item?: Invoice }>({ open: false });
  const [, setLocation] = useLocation();
  const assetSearch = useSearch();
  const [ticketDeepLinkId, setTicketDeepLinkId] = useState<string | null>(null);
  const [stockPage, setStockPage] = useState(0);
  /** Stock tab: null = product-type cards; id = drill-down to that type's stock */
  const [stockSelectedProductType, setStockSelectedProductType] = useState<string | null>(null);
  const [systemsPage, setSystemsPage] = useState(0);
  const [invoicesPage, setInvoicesPage] = useState(0);
  const STOCK_PAGE_SIZE = 20;
  const SYSTEMS_PAGE_SIZE = 20;
  const INVOICES_PAGE_SIZE = 15;
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; type: string; id: string; name: string }>({ open: false, type: "", id: "", name: "" });
  const [qrDialog, setQrDialog] = useState<{ open: boolean; type: "stock" | "system"; id: string; label: string; publicId?: string }>({ open: false, type: "stock", id: "", label: "" });
  const [createTicketDialogOpen, setCreateTicketDialogOpen] = useState(false);
  const canLogTickets = isAdmin || isHR || isIT;

  useEffect(() => {
    if (activeTab !== "stock") setStockSelectedProductType(null);
  }, [activeTab]);

  useEffect(() => {
    const q = new URLSearchParams(assetSearch);
    const tid = q.get("ticket")?.trim();
    const tab = q.get("tab");
    if (tid) {
      setTicketDeepLinkId(tid);
      setActiveTab("tickets");
    } else {
      setTicketDeepLinkId(null);
      if (tab === "overview" || tab === "stock" || tab === "systems" || tab === "tickets" || tab === "invoices") {
        setActiveTab(tab);
      }
    }
  }, [assetSearch]);

  const consumeAssetsTicketDeepLink = () => {
    const q = new URLSearchParams(assetSearch);
    q.delete("ticket");
    q.delete("tab");
    const s = q.toString();
    setLocation(s ? `/assets?${s}` : "/assets");
    setTicketDeepLinkId(null);
  };

  const canManageAssets = isAdmin || isHR;
  const canManageInvoices = isAdmin || isHR || isIT;

  // ==================== DATA FETCHING WITH REACT QUERY ====================
  
  const { data: stockData = [], isLoading: stockLoading } = useQuery({
    queryKey: ["/api/assets/stock"],
    select: (data: any[]) => data.map(transformStockItem),
  });

  const { data: systems = [], isLoading: systemsLoading } = useQuery({
    queryKey: ["/api/assets/systems"],
    select: (data: any[]) => data.map(transformSystem),
  });

  const { data: tickets = [], isLoading: ticketsLoading } = useQuery({
    queryKey: ["/api/assets/tickets"],
    select: (data: any[]) => data.map(transformTicket),
  });

  const { data: invoicesData = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["/api/assets/invoices"],
    select: (data: any[]) => data.map(transformInvoice),
  });

  const { data: recentReturns = [], isLoading: recentReturnsLoading } = useQuery({
    queryKey: ["/api/assets/recent-returns"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/assets/recent-returns?limit=8");
      return res.json() as Promise<RecentAssetReturn[]>;
    },
  });

  const isLoading = stockLoading || systemsLoading || ticketsLoading || invoicesLoading;

  const recentAssignments = [...systems]
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 5);

  // ==================== MUTATIONS ====================

  // Stock mutations
  const stockMutation = useMutation({
    mutationFn: async (item: StockItem) => {
      const isUpdate = item.id && !item.id.startsWith('temp-');
      const payload = {
        name: item.name,
        category: item.category,
        productType: item.productType,
        quantity: item.quantity,
        available: item.available,
        description: item.description,
        location: item.location,
        specs: item.specs,
      };
      const res = await apiRequest(
        isUpdate ? "PATCH" : "POST",
        isUpdate ? `/api/assets/stock/${item.id}` : "/api/assets/stock",
        payload
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets/stock"] });
    },
  });

  // System mutations
  const systemMutation = useMutation({
    mutationFn: async (item: AssignedSystem) => {
      const isUpdate = item.id && !item.id.startsWith('temp-');
      const payload = {
        assetId: item.assetId,
        userId: item.userId || null,
        userName: item.userName,
        userEmail: item.userEmail,
        ram: item.ram,
        storage: item.storage,
        processor: item.processor,
        generation: item.generation,
        notes: item.notes,
      };
      const res = await apiRequest(
        isUpdate ? "PATCH" : "POST",
        isUpdate ? `/api/assets/systems/${item.id}` : "/api/assets/systems",
        payload
      );
      return { data: await res.json(), userId: item.userId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets/systems"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets/stock"] });
      // Refresh employee profile asset section
      if (result.userId) {
        queryClient.invalidateQueries({ queryKey: ["/api/assets/systems/user", result.userId] });
        window.dispatchEvent(new CustomEvent("employee-updated", { detail: { employeeId: result.userId } }));
      }
    },
  });

  // Invoice mutation
  const invoiceMutation = useMutation({
    mutationFn: async (inv: Invoice) => {
      const isUpdate = inv.id && !inv.id.startsWith("temp-");
      const payload = {
        invoice_number: inv.invoiceNumber,
        vendor: inv.vendor,
        purchase_date: typeof inv.purchaseDate === "string" ? inv.purchaseDate : new Date(inv.purchaseDate).toISOString(),
        total_amount: Number(inv.totalAmount) ?? 0,
        items: inv.items,
        status: inv.status,
        notes: inv.notes ?? null,
        file_name: inv.fileName ?? null,
        file_type: inv.fileType ?? null,
        file_path: inv.filePath ?? null,
      };
      const res = await apiRequest(
        isUpdate ? "PATCH" : "POST",
        isUpdate ? `/api/assets/invoices/${inv.id}` : "/api/assets/invoices",
        payload
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets/invoices"] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      // Capture userId before deleting so we can invalidate employee queries
      let userId: string | undefined;
      if (type === "system") {
        const sys = systems.find((s) => s.id === id);
        userId = sys?.userId;
      }
      const endpoints: Record<string, string> = {
        stock: `/api/assets/stock/${id}`,
        system: `/api/assets/systems/${id}`,
        ticket: `/api/assets/tickets/${id}`,
        invoice: `/api/assets/invoices/${id}`,
      };
      await apiRequest("DELETE", endpoints[type]);
      return { userId };
    },
    onSuccess: (result, { type }) => {
      const queryKeys: Record<string, string> = {
        stock: "/api/assets/stock",
        system: "/api/assets/systems",
        ticket: "/api/assets/tickets",
        invoice: "/api/assets/invoices",
      };
      queryClient.invalidateQueries({ queryKey: [queryKeys[type]] });
      // When a system is deleted/unassigned, refresh stock and employee profile
      if (type === "system") {
        queryClient.invalidateQueries({ queryKey: ["/api/assets/stock"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assets/recent-returns"] });
        if (result.userId) {
          queryClient.invalidateQueries({ queryKey: ["/api/assets/systems/user", result.userId] });
          window.dispatchEvent(new CustomEvent("employee-updated", { detail: { employeeId: result.userId } }));
        }
      }
    },
  });

  // Statistics
  const stats = {
    totalSystems: systems.length,
    totalStockItems: stockData.reduce((sum, item) => sum + item.quantity, 0),
    outOfStock: stockData.filter(item => item.available === 0).length,
    openTickets: tickets.filter(t => t.status === "open").length,
    criticalTickets: tickets.filter(t => t.priority === "critical" && t.status !== "resolved").length,
  };

  // ==================== CRUD HANDLERS ====================
  
  const handleSaveStock = (item: StockItem) => {
    stockMutation.mutate(item, {
      onSuccess: () => toast.success(item.id && !item.id.startsWith('temp-') ? "Stock item updated" : "Stock item added"),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    });
  };

  const handleAssignFromStockSuccess = async (employeeId?: string) => {
    // Force refetch (not just invalidate) so data is immediately fresh
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["/api/assets/stock"] }),
      queryClient.refetchQueries({ queryKey: ["/api/assets/systems"] }),
      queryClient.refetchQueries({ queryKey: ["/api/assets/recent-returns"] }),
    ]);
    if (employeeId) {
      queryClient.invalidateQueries({ queryKey: ["/api/assets/systems/user", employeeId] });
    }
  };

  const handleSaveSystem = (item: AssignedSystem) => {
    systemMutation.mutate(item, {
      onSuccess: () => toast.success("System updated"),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    });
  };

  const handleDelete = () => {
    const { type, id } = deleteDialog;
    deleteMutation.mutate({ type, id }, {
      onSuccess: () => {
        toast.success("Item deleted successfully");
        setDeleteDialog({ open: false, type: "", id: "", name: "" });
      },
      onError: (err) => toast.error(`Failed to delete: ${err.message}`),
    });
  };

  const handleSaveInvoice = (inv: Invoice) => {
    invoiceMutation.mutate(inv, {
      onSuccess: () => toast.success(inv.id ? "Invoice updated" : "Invoice added"),
      onError: (err) => toast.error(`Failed: ${err.message}`),
    });
  };

  // Export handlers
  const handleExportStock = () => {
    const headers = ["Item Name", "Category", "Product Type", "Specs", "Total Qty", "Available", "Location"];
    const rows = stockData.map(item => [
      item.name,
      item.category,
      item.productType || "-",
      item.specs && Object.keys(item.specs).length > 0 ? Object.entries(item.specs).map(([k, v]) => `${k}: ${v}`).join("; ") : "-",
      item.quantity,
      item.available,
      item.location
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `stock_report_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    toast.success("Stock report exported");
  };

  const handleExportSystems = () => {
    const headers = ["Asset ID", "User", "Email", "RAM", "Storage", "Processor", "Generation"];
    const rows = systems.map(s => [s.assetId, s.userName, s.userEmail, s.ram, s.storage, s.processor, s.generation]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `assigned_systems_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    toast.success("Systems report exported");
  };

  // Loading state
  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-500">Loading asset data...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Dialogs */}
      <StockDialog open={stockDialog.open} item={stockDialog.item} defaultCategory={stockDialog.defaultCategory} defaultProductType={stockDialog.defaultProductType} defaultBrand={stockDialog.defaultBrand} defaultModelName={stockDialog.defaultModelName} onSave={handleSaveStock} onClose={() => setStockDialog({ open: false })} />
      <StockDetailSheet open={stockDetailSheet.open} item={stockDetailSheet.item} onClose={() => setStockDetailSheet({ open: false })} onEdit={(item) => setStockDialog({ open: true, item })} onShowQr={(type, id, label, publicId) => setQrDialog({ open: true, type, id, label, publicId })} />
      <StockAssignedDrawer item={stockAssignedDrawer.item} open={stockAssignedDrawer.open} onClose={() => setStockAssignedDrawer({ open: false, item: null })} />
      <OverviewAssignmentDetailDialog
        open={overviewAssignmentDetail.open}
        system={overviewAssignmentDetail.system}
        onClose={() => setOverviewAssignmentDetail({ open: false })}
        stockItems={stockData}
        timeZone={user?.timeZone}
        dateFormat={user?.dateFormat}
        onOpenStock={(item) => setStockDetailSheet({ open: true, item })}
      />
      <OverviewReturnDetailDialog
        open={overviewReturnDetail.open}
        item={overviewReturnDetail.item}
        onClose={() => setOverviewReturnDetail({ open: false })}
        stockItems={stockData}
        timeZone={user?.timeZone}
        dateFormat={user?.dateFormat}
        onOpenStock={(item) => setStockDetailSheet({ open: true, item })}
      />
      <AssignAssetFromStockDialog
        open={assignFromStockOpen}
        onClose={() => setAssignFromStockOpen(false)}
        onSuccess={handleAssignFromStockSuccess}
        stockItems={stockData}
      />
      <SystemDialog open={systemDialog.open} item={systemDialog.item} onSave={handleSaveSystem} onClose={() => setSystemDialog({ open: false })} />
      <InvoiceDialog open={invoiceDialog.open} item={invoiceDialog.item} onSave={handleSaveInvoice} onClose={() => setInvoiceDialog({ open: false })} />
      {canLogTickets && (
        <CreateTicketForEmployeeDialog
          open={createTicketDialogOpen}
          onOpenChange={setCreateTicketDialogOpen}
        />
      )}
      <DeleteConfirmDialog open={deleteDialog.open} itemName={deleteDialog.name} type={deleteDialog.type} onClose={() => setDeleteDialog({ open: false, type: "", id: "", name: "" })} onConfirm={handleDelete} />
      <QRCodeDialog open={qrDialog.open} onClose={() => setQrDialog({ open: false, type: "stock", id: "", label: "" })} type={qrDialog.type} id={qrDialog.id} label={qrDialog.label} publicId={qrDialog.publicId} />

      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">IT Asset Management</h1>
          <p className="text-muted-foreground text-sm">Inventory, stock and assigned asset tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.info("Scan feature coming soon")}>
            <Camera className="h-4 w-4 mr-2" /> Scan
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.info("Import feature coming soon")}>
            <Upload className="h-4 w-4 mr-2" /> Import
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 gap-1 h-auto p-1">
          <TabsTrigger value="overview" className="gap-2 text-xs md:text-sm"><Layers className="h-4 w-4" /> Overview</TabsTrigger>
          <TabsTrigger value="stock" className="gap-2 text-xs md:text-sm"><Package className="h-4 w-4" /> Stock {stats.outOfStock > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1">{stats.outOfStock}</Badge>}</TabsTrigger>
          <TabsTrigger value="systems" className="gap-2 text-xs md:text-sm"><Laptop className="h-4 w-4" /> Assigned Assets</TabsTrigger>
          <TabsTrigger value="tickets" className="gap-2 text-xs md:text-sm"><TicketIcon className="h-4 w-4" /> Tickets {stats.openTickets > 0 && <Badge variant="destructive" className="ml-1 h-5 px-1">{stats.openTickets}</Badge>}</TabsTrigger>
          <TabsTrigger value="invoices" className="gap-2 text-xs md:text-sm"><FileText className="h-4 w-4" /> Invoices</TabsTrigger>
        </TabsList>

        {/* ==================== OVERVIEW TAB ==================== */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><Laptop className="h-5 w-5 text-blue-600" /></div><div><p className="text-2xl font-bold">{stats.totalSystems}</p><p className="text-xs text-muted-foreground">Assigned (systems & peripherals)</p></div></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30"><Package className="h-5 w-5 text-green-600" /></div><div><p className="text-2xl font-bold">{stats.totalStockItems}</p><p className="text-xs text-muted-foreground">Stock Items</p></div></div></CardContent></Card>
            <Card className={stats.outOfStock > 0 ? "border-red-300 bg-red-50 dark:bg-red-900/10" : ""}><CardContent className="p-4"><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30"><PackageX className="h-5 w-5 text-red-600" /></div><div><p className="text-2xl font-bold">{stats.outOfStock}</p><p className="text-xs text-muted-foreground">Out of Stock</p></div></div></CardContent></Card>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><AlertCircle className="h-5 w-5 text-red-500" />Stock Alerts</CardTitle>
                <p className="text-xs text-muted-foreground font-normal">Click a row for stock quantities and specs.</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stockData.filter(item => item.available === 0).map(item => (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      className={overviewRowClass}
                      onClick={() => setStockDetailSheet({ open: true, item })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setStockDetailSheet({ open: true, item });
                        }
                      }}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">Total: {item.quantity} · Available: {item.available}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-red-600 border-red-300">Out of stock</Badge>
                    </div>
                  ))}
                  {stockData.filter(item => item.available === 0).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">All items in stock</p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><User className="h-5 w-5 text-blue-500" />Recent Assignments</CardTitle>
                <p className="text-xs text-muted-foreground font-normal">Click a row for who assigned it and linked stock.</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentAssignments.length === 0 ? (<p className="text-sm text-muted-foreground text-center py-4">No assignments yet</p>) : recentAssignments.map(system => {
              const isPeripheral = system.assetId?.startsWith("PERIPH");
              const peripheralLabel = isPeripheral && system.notes ? system.notes.split(" | ")[0]?.trim() : null;
              const cpuPart = [system.processor, system.generation].filter(Boolean).join(" ");
              const specsPart = [cpuPart, system.ram].filter(Boolean).join(" | ");
              const label = system.assetName || peripheralLabel || specsPart || "Asset";
              return (
              <div
                key={system.id}
                role="button"
                tabIndex={0}
                className={overviewRowClass}
                onClick={() => setOverviewAssignmentDetail({ open: true, system })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOverviewAssignmentDetail({ open: true, system });
                  }
                }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar className="h-8 w-8 shrink-0"><AvatarFallback className="text-xs">{system.userName.split(" ").map(n => n[0]).join("")}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{system.userName}</p>
                    <p className="text-xs text-muted-foreground truncate">{label}</p>
                  </div>
                </div>
                {system.createdAt && (
                  <span className="text-[11px] text-muted-foreground shrink-0 text-right leading-snug max-w-[7.5rem]">
                    {formatTimestampCompact(system.createdAt, user?.timeZone ?? null, user?.dateFormat ?? null)}
                  </span>
                )}
              </div>
            ); })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <PackageCheck className="h-5 w-5 text-green-600" />
                  Recent Returns to Stock
                </CardTitle>
                <p className="text-xs text-muted-foreground font-normal">Click a row for who returned it and stock levels.</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentReturnsLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
                  ) : recentReturns.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No returns recorded yet</p>
                  ) : (
                    recentReturns.map((item) => {
                      const subtitle = item.stockItemName || item.publicAssetId || "Asset";
                      return (
                        <div
                          key={item.auditId}
                          role="button"
                          tabIndex={0}
                          className={overviewRowClass}
                          onClick={() => setOverviewReturnDetail({ open: true, item })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOverviewReturnDetail({ open: true, item });
                            }
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                              <PackageCheck className="h-4 w-4 text-green-700 dark:text-green-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">{item.assigneeName}</p>
                              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                              <Badge variant="outline" className="mt-1 text-[10px] font-normal text-green-700 border-green-300 dark:text-green-400">
                                {item.reasonLabel}
                              </Badge>
                            </div>
                          </div>
                          <span className="text-[11px] text-muted-foreground shrink-0 text-right leading-snug max-w-[7.5rem]">
                            {formatTimestampCompact(item.returnedAt, user?.timeZone ?? null, user?.dateFormat ?? null)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== STOCK TAB (Type → Brand → Configurations) ==================== */}
        <TabsContent value="stock" className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {stockSelectedProductType == null ? (
                <>
                  Choose a <b>product type</b> to view stock. Inside each type, items are grouped by <b>brand</b>, then <b>item name</b>.
                </>
              ) : (
                <>
                  <b>Product Type</b> → <b>Brand</b> → configurations. Use <b>All product types</b> to return to the type list.
                </>
              )}
            </p>
          </div>

          <div className="flex justify-between items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search stock items..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setStockPage(0);
                  setStockSelectedProductType(null);
                }}
                aria-label="Search stock items"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportStock}><Download className="h-4 w-4 mr-2" /> Export</Button>
              <Button onClick={() => setStockDialog({ open: true })}><Plus className="h-4 w-4 mr-2" /> Add Item</Button>
            </div>
          </div>

          <div className="space-y-6">
            {(() => {
              const searchFiltered = stockData.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));

              const getTypeBucket = (item: StockItem): string => {
                // "First product type" = stock_items.product_type
                return (item.productType || "").trim() || "other";
              };

              const getBrand = (item: StockItem): string => {
                const specs = item.specs;
                if (!specs || typeof specs !== "object" || specs.brand == null) return "Unbranded";
                const brandStr = String(specs.brand).trim();
                return brandStr || "Unbranded";
              };

              const filtered = searchFiltered;

              if (stockData.length === 0) {
                return (
                  <Card className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mb-3 opacity-50" />
                    <p className="font-medium">No stock items yet</p>
                    <p className="text-sm mt-1 text-center px-4">Add an item and fill Brand in specs so it groups correctly inside its type.</p>
                    <Button variant="outline" className="mt-4" onClick={() => setStockDialog({ open: true })}><Plus className="h-4 w-4 mr-2" /> Add first item</Button>
                  </Card>
                );
              }
              if (filtered.length === 0) {
                return (
                  <Card className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Search className="h-12 w-12 mb-3 opacity-50" />
                    <p className="font-medium">No matching items</p>
                    <p className="text-sm mt-1">Try a different search term or type filter.</p>
                  </Card>
                );
              }

              const specLabel = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^\w/, (c) => c.toUpperCase()).trim();

              const byTypeThenBrand = new Map<string, Map<string, (StockItem & { assignments?: StockAssignment[] })[]>>();
              for (const item of filtered) {
                const row = item as StockItem & { assignments?: StockAssignment[] };
                const bucket = getTypeBucket(item);
                const brand = getBrand(item);
                let brandMap = byTypeThenBrand.get(bucket);
                if (!brandMap) { brandMap = new Map(); byTypeThenBrand.set(bucket, brandMap); }
                const list = brandMap.get(brand) ?? [];
                list.push(row);
                brandMap.set(brand, list);
              }

              const typeOrder = PRODUCT_TYPES.map((p) => p.id);
              const knownBuckets = typeOrder.filter((t) => byTypeThenBrand.has(t));
              const extraBuckets = Array.from(byTypeThenBrand.keys()).filter((k) => !typeOrder.includes(k)).sort();
              const allTypeBuckets = [...knownBuckets, ...extraBuckets];

              const typeLabel = (t: string) => PRODUCT_TYPES.find((p) => p.id === t)?.label ?? t;

              const bucketStats = (bucket: string) => {
                const brandMap = byTypeThenBrand.get(bucket);
                if (!brandMap) return { totalConfigs: 0, totalQty: 0, totalAvail: 0, brandCount: 0 };
                let totalConfigs = 0;
                let totalQty = 0;
                let totalAvail = 0;
                for (const list of Array.from(brandMap.values())) {
                  totalConfigs += list.length;
                  for (const it of list) {
                    totalQty += it.quantity;
                    totalAvail += it.available;
                  }
                }
                return { totalConfigs, totalQty, totalAvail, brandCount: brandMap.size };
              };

              const renderItemRow = (item: StockItem & { assignments?: StockAssignment[] }) => {
                const assignments = item.assignments ?? [];
                const assignedCount = assignments.length;
                const specEntries = item.specs && typeof item.specs === "object" && Object.keys(item.specs).length > 0
                  ? (Object.entries(item.specs) as [string, string | number][]).filter(([, v]) => v !== "" && v != null)
                  : [];
                return (
                  <TableRow key={item.id} className={item.available === 0 ? "bg-red-50/50 dark:bg-red-900/10" : ""}>
                    <TableCell className="max-w-[180px]">
                      <button type="button" className="font-medium text-left hover:underline text-foreground" onClick={() => setStockDetailSheet({ open: true, item })} title={item.name}>
                        {item.name}
                      </button>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="flex flex-wrap gap-1">
                        {specEntries.slice(0, 4).map(([k, v]) => (
                          <span key={k} className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {specLabel(k)}: {String(v)}
                          </span>
                        ))}
                        {specEntries.length > 4 && <span className="text-xs text-muted-foreground">+{specEntries.length - 4}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-center">{item.quantity}</TableCell>
                    <TableCell className="font-mono text-center text-green-600 dark:text-green-400">{item.available}</TableCell>
                    <TableCell className="text-center">
                      {assignedCount > 0 ? (
                        <button type="button" className="font-mono text-blue-600 hover:underline" onClick={() => setStockAssignedDrawer({ open: true, item })}>{assignedCount}</button>
                      ) : (
                        <span className="font-mono text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="sm" onClick={() => setStockDetailSheet({ open: true, item })}>View</Button>
                        {item.assetId && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`QR for ${item.name}`} onClick={() => setQrDialog({ open: true, type: "stock", id: item.id, label: item.assetId || item.name, publicId: item.assetId })}><QrCode className="h-4 w-4" /></Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${item.name}`} onClick={() => setStockDialog({ open: true, item })}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" aria-label={`Delete ${item.name}`} onClick={() => setDeleteDialog({ open: true, type: "stock", id: item.id, name: item.name })}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              };

              const renderTypeDetailCard = (bucket: string) => {
                const brandMap = byTypeThenBrand.get(bucket) ?? new Map();
                const brands = Array.from(brandMap.keys()).sort((a, b) => (a === "Unbranded" ? 1 : 0) - (b === "Unbranded" ? 1 : 0) || a.localeCompare(b));
                const totalConfigs = Array.from(brandMap.values()).reduce((s, list) => s + list.length, 0);

                const ptConfig = PRODUCT_TYPES.find((p) => p.id === bucket);
                const defaultCategory = ptConfig?.category ?? "Other";
                const defaultProductType = bucket;

                return (
                  <Card key={bucket} className="overflow-hidden">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 border-b bg-muted/30">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{typeLabel(bucket)}</CardTitle>
                          <Badge variant="secondary" className="font-normal">
                            {brands.length} brand{brands.length !== 1 ? "s" : ""} · {totalConfigs} config{totalConfigs !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Add configurations for different brands inside this type. Fill Brand in specs to group correctly.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setStockDialog({
                            open: true,
                            defaultCategory,
                            defaultProductType,
                          })
                        }
                      >
                        <Plus className="h-4 w-4 mr-2" /> Add configuration
                      </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                      {brands.map((brand) => {
                        const items = [...(brandMap.get(brand) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
                        return (
                          <div key={brand} className="border-b border-border/50 last:border-b-0">
                            <div className="flex flex-row items-center justify-between pl-4 pr-3 py-3 bg-muted/40 dark:bg-muted/30 border-l-4 border-primary">
                              <span className="text-sm font-semibold uppercase tracking-wider text-foreground/90">{brand}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() =>
                                  setStockDialog({
                                    open: true,
                                    defaultCategory,
                                    defaultProductType,
                                    defaultBrand: brand === "Unbranded" ? undefined : brand,
                                  })
                                }
                              >
                                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add configuration
                              </Button>
                            </div>
                            <div className="rounded-b-lg">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/60 dark:bg-muted/50 border-b-2 border-border">
                                    <TableHead className="max-w-[180px] text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name / Model</TableHead>
                                    <TableHead className="max-w-[260px] text-xs font-semibold uppercase tracking-wider text-muted-foreground">Specs</TableHead>
                                    <TableHead className="w-[80px] text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</TableHead>
                                    <TableHead className="w-[90px] text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available</TableHead>
                                    <TableHead className="w-[90px] text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assigned</TableHead>
                                    <TableHead className="w-[140px] text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {items.map(renderItemRow)}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              };

              if (stockSelectedProductType == null) {
                return (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {allTypeBuckets.map((bucket) => {
                      const stats = bucketStats(bucket);
                      const ptConfig = PRODUCT_TYPES.find((p) => p.id === bucket);
                      const categoryLabel = ptConfig?.category ?? "Other";
                      return (
                        <Card
                          key={bucket}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer overflow-hidden transition-shadow hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setStockSelectedProductType(bucket)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setStockSelectedProductType(bucket);
                            }
                          }}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                                  <Package className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <div className="min-w-0">
                                  <CardTitle className="text-lg leading-tight truncate">{typeLabel(bucket)}</CardTitle>
                                  <p className="text-xs text-muted-foreground mt-0.5">{categoryLabel}</p>
                                </div>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
                              <span>{stats.brandCount} brand{stats.brandCount !== 1 ? "s" : ""}</span>
                              <span aria-hidden>·</span>
                              <span>{stats.totalConfigs} line{stats.totalConfigs !== 1 ? "s" : ""}</span>
                              <span aria-hidden>·</span>
                              <span className="font-mono text-green-600 dark:text-green-400">{stats.totalAvail} available</span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                );
              }

              const selectedBucket = stockSelectedProductType;
              if (!byTypeThenBrand.has(selectedBucket)) {
                return (
                  <div className="space-y-4">
                    <Button variant="outline" size="sm" onClick={() => setStockSelectedProductType(null)}>
                      <ArrowLeft className="h-4 w-4 mr-2" /> All product types
                    </Button>
                    <Card className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Search className="h-12 w-12 mb-3 opacity-50" />
                      <p className="font-medium">Nothing in this product type</p>
                      <p className="text-sm mt-1 text-center px-4">Clear search or choose another type.</p>
                    </Card>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setStockSelectedProductType(null)}>
                      <ArrowLeft className="h-4 w-4 mr-2" /> All product types
                    </Button>
                    <span className="text-sm font-medium text-foreground">{typeLabel(selectedBucket)}</span>
                  </div>
                  {renderTypeDetailCard(selectedBucket)}
                </div>
              );
            })()}
          </div>
        </TabsContent>

        {/* ==================== ASSIGNED ASSETS TAB (physical assets assigned to people) ==================== */}
        <TabsContent value="systems" className="space-y-4">
          <p className="text-sm text-muted-foreground">Systems and peripherals assigned to employees. Each row is one asset.</p>
          <div className="flex justify-between items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, processor, asset..." className="pl-9" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setSystemsPage(0); }} aria-label="Search assigned assets" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportSystems}><Download className="h-4 w-4 mr-2" /> Export</Button>
              <Button onClick={() => setAssignFromStockOpen(true)}><Plus className="h-4 w-4 mr-2" /> Assign from stock</Button>
            </div>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Asset</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Specs</TableHead>
                  <TableHead>Processor</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const filtered = systems.filter(s => {
                    const term = searchTerm.toLowerCase();
                    const notes = (s.notes || "").toLowerCase();
                    const assetLabel = (s.assetCategory || s.assetName || (s.assetId?.startsWith("PERIPH") && s.notes ? s.notes.split(" | ")[0] : "") || "").toLowerCase();
                    return s.userName.toLowerCase().includes(term) || (s.processor ?? "").toLowerCase().includes(term) || (s.assetName || "").toLowerCase().includes(term) || (s.assetId ?? "").toLowerCase().includes(term) || notes.includes(term) || assetLabel.includes(term);
                  });
                  const paginated = filtered.slice(systemsPage * SYSTEMS_PAGE_SIZE, (systemsPage + 1) * SYSTEMS_PAGE_SIZE);
                  if (filtered.length === 0) {
                    return (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                          <Laptop className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p className="font-medium">No assigned assets</p>
                          <p className="text-sm mt-1">Assign from stock to give equipment to employees. Stock items are in the Stock tab.</p>
                          <Button variant="outline" className="mt-4" onClick={() => setAssignFromStockOpen(true)}><Plus className="h-4 w-4 mr-2" /> Assign from stock</Button>
                        </TableCell>
                      </TableRow>
                    );
                  }
                    return paginated.map(system => {
                    const isPeripheral = system.assetId?.startsWith("PERIPH");
                    const peripheralLabel = isPeripheral && system.notes ? system.notes.split(" | ")[0]?.trim() : null;
                    const assetNameDisplay = system.assetName || peripheralLabel || system.assetCategory || "Asset";
                    const sourceStock = system.assetId?.includes("-")
                      ? (system.assetId.startsWith("PERIPH") ? "Peripheral" : system.assetId.split("-")[0])
                      : null;
                    return (
                      <TableRow
                        key={system.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setLocation(`/assets/${system.id}`)}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLocation(`/assets/${system.id}`); } }}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <AssignedAssetIcon system={system} />
                            <div>
                              <p className="font-medium text-sm">{assetNameDisplay}</p>
                              <p className="text-xs text-muted-foreground font-mono">Asset ID: {system.assetId}</p>
                              {sourceStock && <p className="text-xs text-muted-foreground">From stock: {sourceStock}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{system.userName.split(" ").map(n => n[0]).join("")}</AvatarFallback></Avatar>
                            <div>
                              <p className="font-medium text-sm">{system.userName}</p>
                              <p className="text-xs text-muted-foreground">{system.employeeId || system.userEmail || "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isPeripheral ? (
                            <Badge variant="secondary" className="text-xs font-normal">Peripheral</Badge>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {system.ram && <Badge variant="outline" className="text-xs font-normal"><MemoryStick className="h-3 w-3 mr-1" />{system.ram}</Badge>}
                              {system.storage && <Badge variant="outline" className="text-xs font-normal"><HardDrive className="h-3 w-3 mr-1" />{system.storage}</Badge>}
                              {!system.ram && !system.storage && <span className="text-muted-foreground text-xs">—</span>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isPeripheral ? (
                              <span className="text-muted-foreground text-sm">—</span>
                            ) : (
                              <>
                                <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="font-medium">{system.processor || "—"}</span>
                                {system.generation && <span className="text-muted-foreground text-sm">{system.generation}</span>}
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`QR code for ${system.assetId}`} onClick={() => setQrDialog({ open: true, type: "system", id: system.assetId, label: system.assetId || system.userName, publicId: system.assetId })}><QrCode className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${system.assetId}`} onClick={() => setSystemDialog({ open: true, item: system })}><Edit2 className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" aria-label={`Delete assignment`} onClick={() => setDeleteDialog({ open: true, type: "system", id: system.id, name: system.assetId || system.userName })}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  });
                })()}
              </TableBody>
            </Table>
            {systems.filter(s => {
              const term = searchTerm.toLowerCase();
              return s.userName.toLowerCase().includes(term) || (s.processor ?? "").toLowerCase().includes(term) || (s.assetName || "").toLowerCase().includes(term) || (s.assetId ?? "").toLowerCase().includes(term);
            }).length > SYSTEMS_PAGE_SIZE && (
              <div className="flex items-center justify-between border-t px-4 py-2">
                <p className="text-sm text-muted-foreground">
                  Page {systemsPage + 1} of {Math.ceil(systems.filter(s => {
                    const term = searchTerm.toLowerCase();
                    return s.userName.toLowerCase().includes(term) || (s.processor ?? "").toLowerCase().includes(term) || (s.assetName || "").toLowerCase().includes(term) || (s.assetId ?? "").toLowerCase().includes(term);
                  }).length / SYSTEMS_PAGE_SIZE)}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={systemsPage === 0} onClick={() => setSystemsPage(p => Math.max(0, p - 1))}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={systemsPage >= Math.ceil(systems.filter(s => {
                    const term = searchTerm.toLowerCase();
                    return s.userName.toLowerCase().includes(term) || (s.processor ?? "").toLowerCase().includes(term) || (s.assetName || "").toLowerCase().includes(term) || (s.assetId ?? "").toLowerCase().includes(term);
                  }).length / SYSTEMS_PAGE_SIZE) - 1} onClick={() => setSystemsPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ==================== TICKETS TAB ==================== */}
        <TabsContent value="tickets" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TicketIcon className="h-5 w-5" />
                    Support Tickets
                    {stats.openTickets > 0 && <Badge variant="destructive">{stats.openTickets} Open</Badge>}
                  </CardTitle>
                  <CardDescription>Manage IT support requests from employees</CardDescription>
                </div>
                {canLogTickets && (
                  <Button className="gap-2 shrink-0" onClick={() => setCreateTicketDialogOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Log ticket for employee
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Ticket #</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map(ticket => {
                    const priorityBadge = getPriorityBadge(ticket.priority);
                    const statusBadge = getTicketStatusBadge(ticket.status);
                    return (
                      <TableRow key={ticket.id} className={ticket.priority === "critical" ? "bg-red-50 dark:bg-red-900/10" : ""}>
                        <TableCell className="font-mono text-sm">{ticket.ticketNumber}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{ticket.title}</p>
                            <p className="text-xs text-muted-foreground">{ticket.assetName}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">
                                {ticket.createdBy.name.split(" ").map(n => n[0]).join("")}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm">{ticket.createdBy.name}</p>
                              <p className="text-xs text-muted-foreground">{ticket.createdBy.department}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={priorityBadge.className}>
                            {priorityBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadge.className}>
                            {statusBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatTimestampCompact(ticket.updatedAt, user?.timeZone ?? null, user?.dateFormat ?? null)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <TicketDetailDialog 
                              ticket={ticket} 
                              deepLinkOpen={ticketDeepLinkId === ticket.id}
                              onCloseAfterDeepLink={consumeAssetsTicketDeepLink}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              aria-label={`Delete ticket ${ticket.ticketNumber}`}
                              onClick={() => setDeleteDialog({ open: true, type: "ticket", id: ticket.id, name: ticket.ticketNumber })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== INVOICES TAB ==================== */}
        <TabsContent value="invoices" className="space-y-4">
          <p className="text-sm text-muted-foreground">Purchase invoices for asset/IT procurement. Record vendor, amount, and items for audit and tracking.</p>
          <div className="flex justify-between items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by invoice #, vendor..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setInvoicesPage(0); }}
                aria-label="Search invoices"
              />
            </div>
            {canManageInvoices && (
              <Button onClick={() => setInvoiceDialog({ open: true })}><Plus className="h-4 w-4 mr-2" /> Add Invoice</Button>
            )}
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Purchase date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[90px]">PDF</TableHead>
                  {canManageInvoices && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const term = searchTerm.toLowerCase().trim();
                  const filtered = term
                    ? invoicesData.filter(
                        (inv) =>
                          (inv.invoiceNumber || "").toLowerCase().includes(term) ||
                          (inv.vendor || "").toLowerCase().includes(term) ||
                          (inv.items || "").toLowerCase().includes(term)
                      )
                    : invoicesData;
                  const paginated = filtered.slice(invoicesPage * INVOICES_PAGE_SIZE, (invoicesPage + 1) * INVOICES_PAGE_SIZE);
                  if (filtered.length === 0) {
                    return (
                      <TableRow>
                        <TableCell colSpan={canManageInvoices ? 7 : 6} className="text-center py-12 text-muted-foreground">
                          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p className="font-medium">No invoices yet</p>
                          <p className="text-sm mt-1">Add purchase invoices to track asset procurement.</p>
                          {canManageInvoices && (
                            <Button variant="outline" className="mt-4" onClick={() => setInvoiceDialog({ open: true })}><Plus className="h-4 w-4 mr-2" /> Add first invoice</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  const statusLabels: Record<string, string> = { pending: "Pending", paid: "Paid", overdue: "Overdue", cancelled: "Cancelled" };
                  const openPdf = async (invoiceId: string) => {
                    try {
                      const res = await apiRequest("GET", `/api/assets/invoices/${invoiceId}/file`);
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      window.open(url, "_blank", "noopener");
                      setTimeout(() => URL.revokeObjectURL(url), 60000);
                    } catch {
                      toast.error("Failed to open PDF");
                    }
                  };
                  return paginated.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                      <TableCell>{inv.vendor}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatCalendarDate(inv.purchaseDate, user?.timeZone ?? null, user?.dateFormat ?? null)}</TableCell>
                      <TableCell className="text-right font-mono">{typeof inv.totalAmount === "number" ? inv.totalAmount.toFixed(2) : inv.totalAmount}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">{statusLabels[inv.status] ?? inv.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {(inv.fileName || inv.filePath) ? (
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => openPdf(inv.id)}>
                            <FileText className="h-3 w-3" /> View PDF
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {canManageInvoices && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${inv.invoiceNumber}`} onClick={() => setInvoiceDialog({ open: true, item: inv })}><Edit2 className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" aria-label={`Delete ${inv.invoiceNumber}`} onClick={() => setDeleteDialog({ open: true, type: "invoice", id: inv.id, name: inv.invoiceNumber })}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ));
                })()}
              </TableBody>
            </Table>
            {(() => {
              const term = searchTerm.toLowerCase().trim();
              const filtered = term ? invoicesData.filter((inv) => (inv.invoiceNumber || "").toLowerCase().includes(term) || (inv.vendor || "").toLowerCase().includes(term) || (inv.items || "").toLowerCase().includes(term)) : invoicesData;
              if (filtered.length <= INVOICES_PAGE_SIZE) return null;
              return (
                <div className="flex items-center justify-between border-t px-4 py-2">
                  <p className="text-sm text-muted-foreground">
                    Page {invoicesPage + 1} of {Math.ceil(filtered.length / INVOICES_PAGE_SIZE)}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={invoicesPage === 0} onClick={() => setInvoicesPage((p) => Math.max(0, p - 1))}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={invoicesPage >= Math.ceil(filtered.length / INVOICES_PAGE_SIZE) - 1} onClick={() => setInvoicesPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              );
            })()}
          </Card>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
