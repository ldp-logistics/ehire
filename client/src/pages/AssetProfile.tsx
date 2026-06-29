import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Laptop, Package, Wrench, User, HardDrive, Cpu, Edit2, ArrowLeft, Clock, FileText,
  MessageSquare, Plus, History, MemoryStick, MapPin, Calendar, Link as LinkIcon,
  AlertCircle, CheckCircle, Headphones, Mouse, Monitor, Keyboard, QrCode, Download
} from "lucide-react";
import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Link, useRoute } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatAutoDisplay } from "@/lib/dateUtils";

function formatDate(dateStr: string, tz?: string | null, df?: string | null) {
  return formatAutoDisplay(dateStr, tz ?? null, df ?? null);
}

function getDeviceIcon(category?: string | null, system?: { asset_id?: string; notes?: string } | null) {
  const isPeripheral = system?.asset_id?.startsWith("PERIPH");
  if (isPeripheral && system?.notes) {
    const n = system.notes.toLowerCase();
    if (n.includes("headphone")) return Headphones;
    if (n.includes("mouse")) return Mouse;
    if (n.includes("lcd") || n.includes("led") || n.includes("monitor")) return Monitor;
    if (n.includes("keyboard")) return Keyboard;
    return Package;
  }
  const c = (category || "").toLowerCase();
  if (c.includes("laptop") || c.includes("system")) return Laptop;
  return Laptop;
}

// Create Ticket Dialog — calls real API
function CreateTicketDialog({ assetId, assetName, onSuccess }: { assetId: string; assetName: string; onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({ title: "", description: "", priority: "medium" as string });
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (body: { title: string; description: string; priority: string; assetId: string; assetName: string }) => {
      await apiRequest("POST", "/api/assets/tickets", {
        title: body.title,
        description: body.description,
        priority: body.priority,
        assetId: body.assetId,
        assetName: body.assetName,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets/tickets"] });
      toast.success("Ticket created");
      setOpen(false);
      setFormData({ title: "", description: "", priority: "medium" });
      onSuccess?.();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create ticket"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.description.trim()) {
      toast.error("Title and description are required");
      return;
    }
    createMutation.mutate({
      ...formData,
      assetId,
      assetName,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Create ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create support ticket</DialogTitle>
          <DialogDescription>
            Report an issue for asset: <span className="font-mono font-medium">{assetId}</span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input placeholder="Brief description" value={formData.title} onChange={(e) => setFormData(f => ({ ...f, title: e.target.value }))} disabled={createMutation.isPending} />
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={formData.priority} onValueChange={(v) => setFormData(f => ({ ...f, priority: v }))} disabled={createMutation.isPending}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea placeholder="Details..." value={formData.description} onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))} disabled={createMutation.isPending} rows={4} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={createMutation.isPending}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Submitting..." : "Submit"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssetProfile() {
  const [, params] = useRoute("/assets/:id");
  const id = params?.id;
  const { user, isAdmin, isHR, isIT } = useAuth();
  const canViewAudit = isAdmin || isIT;
  const queryClient = useQueryClient();

  const { data: system, isLoading: systemLoading, error: systemError } = useQuery({
    queryKey: ["/api/assets/systems", id],
    queryFn: async () => {
      const res = await fetch(`/api/assets/systems/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Asset not found");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: ticketsRaw = [] } = useQuery({
    queryKey: ["/api/assets/tickets"],
    queryFn: async () => {
      const res = await fetch("/api/assets/tickets", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });
  const tickets = (Array.isArray(ticketsRaw) ? ticketsRaw : []).filter((t: { asset_id?: string }) => t.asset_id === id);

  const { data: auditRaw = [] } = useQuery({
    queryKey: ["/api/assets/audit", id],
    queryFn: async () => {
      const res = await fetch(`/api/assets/audit?entityType=system&entityId=${id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id && canViewAudit,
  });
  const auditLog = Array.isArray(auditRaw) ? auditRaw : [];
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrBlobUrl, setQrBlobUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const assetIdForQr = system?.asset_id;
  const publicViewUrl = assetIdForQr ? `${typeof window !== "undefined" ? window.location.origin : ""}/assets/view/${encodeURIComponent(assetIdForQr)}` : null;

  useEffect(() => {
    if (!qrOpen || !id) {
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
    fetch(`/api/assets/systems/${encodeURIComponent(id)}/qr?size=256`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : "Failed to load QR");
        const contentType = res.headers.get("Content-Type") || "";
        if (!contentType.includes("image/")) throw new Error("Not an image");
        return res.blob();
      })
      .then((blob) => {
        blobUrl = URL.createObjectURL(blob);
        setQrBlobUrl(blobUrl);
      })
      .catch((err) => {
        toast.error(err?.message === "Unauthorized" ? "Please sign in again." : "Failed to load QR code");
      })
      .finally(() => setQrLoading(false));
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [qrOpen, id, publicViewUrl]);

  const canEdit = isAdmin || isHR;
  const isPeripheral = system?.asset_id?.startsWith("PERIPH");
  const peripheralName = isPeripheral && system?.notes ? system.notes.split(" | ")[0]?.trim() : null;
  const sourceStock = system?.asset_id?.includes("-")
    ? (system!.asset_id.startsWith("PERIPH") ? "Peripheral" : system!.asset_id.split("-")[0])
    : null;
  const assetDisplayName = system?.asset_name || peripheralName || "Assigned asset";
  const DeviceIcon = getDeviceIcon(system?.asset_category, system);

  if (!id) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">Invalid asset ID.</p>
          <Link href="/assets"><Button variant="outline" className="mt-4">Back to assets</Button></Link>
        </div>
      </Layout>
    );
  }

  if (systemLoading || (!system && !systemError)) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </Layout>
    );
  }

  if (systemError || !system) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">Asset not found.</p>
          <Link href="/assets"><Button variant="outline" className="mt-4">Back to assets</Button></Link>
        </div>
      </Layout>
    );
  }

  const employeeName = [system.first_name, system.last_name].filter(Boolean).join(" ") || system.user_name || "—";
  const handleQrDownload = async () => {
    try {
      if (publicViewUrl) {
        const dataUrl = await QRCode.toDataURL(publicViewUrl, { width: 512, margin: 2, type: "image/png" });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `asset-qr-${system.asset_id}.png`;
        a.click();
        toast.success("QR code downloaded");
        return;
      }
      const res = await fetch(`/api/assets/systems/${encodeURIComponent(id)}/qr?size=512`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to generate");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `asset-qr-${system.asset_id}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("QR code downloaded");
    } catch {
      toast.error("Failed to download QR code");
    }
  };

  return (
    <Layout>
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-4">
          <Link href="/assets">
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Back to assets">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">{assetDisplayName}</h1>
            <p className="text-muted-foreground font-mono text-sm">Asset ID: {system.asset_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={() => setQrOpen(true)}>
            <QrCode className="h-4 w-4" /> QR code
          </Button>
          {canEdit && (
            <Button variant="outline" className="gap-2" asChild>
              <Link href="/assets">
                <Edit2 className="h-4 w-4" /> Edit (in list)
              </Link>
            </Button>
          )}
          <CreateTicketDialog assetId={id} assetName={assetDisplayName} onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/assets/tickets"] })} />
        </div>
      </div>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
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
            <Button variant="outline" className="w-full" onClick={handleQrDownload} disabled={qrLoading}>
              <Download className="h-4 w-4 mr-2" />
              Download PNG
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          {/* Asset identity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <DeviceIcon className="h-4 w-4" /> Asset identity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div><p className="text-xs text-muted-foreground">Asset ID</p><p className="font-mono text-sm font-medium">{system.asset_id}</p></div>
              <div><p className="text-xs text-muted-foreground">Type</p><p className="text-sm font-medium">{isPeripheral ? "Peripheral" : (system.asset_category === "Systems" || !system.asset_category || system.asset_category === "Other" ? "Laptop" : system.asset_category)}</p></div>
              <div><p className="text-xs text-muted-foreground">Name</p><p className="text-sm font-medium">{assetDisplayName}</p></div>
              {sourceStock && (
                <div className="flex items-center gap-1">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">From stock: </span>
                  <Link href="/assets" className="text-sm text-primary hover:underline">{sourceStock}</Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Current assignment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4" /> Current assignment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-xs">{employeeName.split(" ").map((n: string) => n[0]).join("") || "?"}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm">{employeeName}</p>
                  {system.user_email && <p className="text-xs text-muted-foreground">{system.user_email}</p>}
                  {system.department && <p className="text-xs text-muted-foreground">{system.department}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Specs (structured) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">Specs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {system.ram && <Badge variant="secondary" className="font-normal"><MemoryStick className="h-3 w-3 mr-1" />{system.ram}</Badge>}
                {system.storage && <Badge variant="secondary" className="font-normal"><HardDrive className="h-3 w-3 mr-1" />{system.storage}</Badge>}
                {system.processor && <Badge variant="secondary" className="font-normal"><Cpu className="h-3 w-3 mr-1" />{system.processor}{system.generation ? ` ${system.generation}` : ""}</Badge>}
              </div>
              {!system.ram && !system.storage && !system.processor && <p className="text-sm text-muted-foreground">No specs recorded.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          <Tabs defaultValue="tickets" className="w-full">
            <TabsList className="bg-muted p-1 mb-6 w-full justify-start">
              <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
              <TabsTrigger value="tickets">Support tickets</TabsTrigger>
              <TabsTrigger value="history">Audit history</TabsTrigger>
            </TabsList>

            {/* Lifecycle (visual only) */}
            <TabsContent value="lifecycle" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">Lifecycle</CardTitle>
                  <CardDescription>Assignment summary. Visual only.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative border-l border-border ml-3 pl-6">
                    <div className="relative">
                      <div className="absolute -left-[25px] top-0 h-4 w-4 rounded-full border-2 border-background bg-primary" />
                      <div>
                        <p className="font-medium text-sm">Assigned to</p>
                        <p className="text-xs text-muted-foreground">{employeeName}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {system.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Notes</CardTitle>
                  </CardHeader>
                  <CardContent><p className="text-sm whitespace-pre-wrap">{system.notes}</p></CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Support tickets */}
            <TabsContent value="tickets" className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Support tickets</CardTitle>
                    <CardDescription>Issues and requests for this asset</CardDescription>
                  </div>
                  <CreateTicketDialog assetId={id} assetName={assetDisplayName} />
                </CardHeader>
                <CardContent>
                  {tickets.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No tickets for this asset.</p>
                      <CreateTicketDialog assetId={id} assetName={assetDisplayName} />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tickets.map((ticket: { id: string; ticket_number?: string; title: string; description: string; priority: string; status: string; created_at?: string; resolved_at?: string; created_by_name?: string }) => (
                        <div key={ticket.id} className="p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                          <div className="flex items-start justify-between mb-2">
                            <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_number || ticket.id}</span>
                            <div className="flex gap-2">
                              <Badge variant="outline" className="text-xs capitalize">{ticket.priority}</Badge>
                              <Badge variant="outline" className={ticket.status === "open" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30" : ticket.status === "resolved" || ticket.status === "closed" ? "bg-green-100 text-green-800 dark:bg-green-900/30" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30"}>{ticket.status.replace("_", " ")}</Badge>
                            </div>
                          </div>
                          <h4 className="font-medium mb-1">{ticket.title}</h4>
                          <p className="text-sm text-muted-foreground mb-3">{ticket.description}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {ticket.created_by_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{ticket.created_by_name}</span>}
                            {ticket.created_at && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(ticket.created_at, user?.timeZone ?? null, user?.dateFormat ?? null)}</span>}
                            {ticket.resolved_at && <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" />Resolved {formatDate(ticket.resolved_at, user?.timeZone ?? null, user?.dateFormat ?? null)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Audit history */}
            <TabsContent value="history" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" /> Audit history</CardTitle>
                  <CardDescription>Changes to this asset record</CardDescription>
                </CardHeader>
                <CardContent>
                  {auditLog.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No audit entries yet.</p>
                  ) : (
                    <div className="relative border-l border-border ml-3 space-y-4 pl-6">
                      {auditLog.map((entry: { id?: string; action: string; changes?: string; created_at?: string; user_email?: string }, i: number) => (
                        <div key={entry.id || i} className="relative">
                          <div className="absolute -left-[25px] top-0 h-4 w-4 rounded-full border-2 border-background bg-muted" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm capitalize">{entry.action}</span>
                              {entry.created_at && <span className="text-xs text-muted-foreground">{formatDate(entry.created_at, user?.timeZone ?? null, user?.dateFormat ?? null)}</span>}
                            </div>
                            {entry.user_email && <p className="text-xs text-muted-foreground">by {entry.user_email}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}

export default AssetProfile;
