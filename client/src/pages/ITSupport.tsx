import Layout from "@/components/layout/Layout";
import { TicketAttachmentPreview } from "@/components/TicketAttachmentPreview";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { 
  Laptop, 
  Smartphone, 
  Monitor, 
  QrCode,
  Package, 
  Wrench, 
  CheckCircle, 
  AlertTriangle,
  Calendar, 
  HardDrive, 
  Cpu, 
  Plus,
  Send,
  Paperclip,
  Clock,
  MessageSquare,
  AlertCircle,
  Router,
  Server,
  Printer,
  Headphones,
  Keyboard,
  Mouse,
  Tablet,
  Wifi,
  FileText,
  History,
  Eye,
  TicketIcon,
  Inbox,
  RefreshCw,
  ArrowRight,
  Trash2
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useNotificationStore } from "@/store/useNotificationStore";
import { formatDateTimeDisplay } from "@/lib/dateUtils";

// Asset interface for assigned assets (from API)
interface AssignedSystem {
  id: string;
  assetId: string;
  assetName?: string;
  assetCategory?: string;
  userId: string;
  userName: string;
  userEmail: string;
  ram: string;
  storage: string;
  processor: string;
  generation: string;
  notes?: string;
}

// Ticket interface (from API)
interface SupportTicket {
  id: string;
  ticketNumber: string;
  assetId?: string;
  assetName?: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  createdById: string;
  createdByName: string;
  createdByEmail: string;
  createdByDepartment?: string;
  assignedToId?: string;
  assignedToName?: string;
  resolution?: string;
  resolvedAt?: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  hasAttachment?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Ticket comment interface
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

// API transformers
const transformSystem = (item: any): AssignedSystem => ({
  id: item.id,
  assetId: item.asset_id || item.assetId,
  assetName: item.asset_name || item.assetName,
  assetCategory: item.asset_category || item.assetCategory,
  userId: item.user_id || item.userId,
  userName: item.user_name || item.userName,
  userEmail: item.user_email || item.userEmail,
  ram: item.ram,
  storage: item.storage,
  processor: item.processor,
  generation: item.generation,
  notes: item.notes,
});

const transformTicket = (item: any): SupportTicket => ({
  id: item.id,
  ticketNumber: item.ticket_number || item.ticketNumber,
  assetId: item.asset_id || item.assetId,
  assetName: item.asset_name || item.assetName,
  title: item.title,
  description: item.description,
  priority: item.priority,
  status: item.status,
  createdById: item.created_by_id || item.createdById,
  createdByName: item.created_by_name || item.createdByName,
  createdByEmail: item.created_by_email || item.createdByEmail,
  createdByDepartment: item.created_by_department || item.createdByDepartment,
  assignedToId: item.assigned_to_id || item.assignedToId,
  assignedToName: item.assigned_to_name || item.assignedToName,
  resolution: item.resolution,
  resolvedAt: item.resolved_at || item.resolvedAt,
  attachmentUrl: item.attachment_url ?? item.attachmentUrl ?? null,
  attachmentName: item.attachment_name ?? item.attachmentName ?? null,
  hasAttachment: !!(
    (typeof item.attachment_url === "string" && item.attachment_url.trim()) ||
    (typeof item.attachmentUrl === "string" && item.attachmentUrl.trim()) ||
    item.has_attachment
  ),
  createdAt: item.created_at || item.createdAt,
  updatedAt: item.updated_at || item.updatedAt,
});

const transformComment = (item: any): TicketComment => ({
  id: item.id,
  ticketId: item.ticket_id || item.ticketId,
  message: item.message,
  authorId: item.author_id || item.authorId,
  authorName: item.author_name || item.authorName,
  authorEmail: item.author_email || item.authorEmail,
  authorRole: item.author_role || item.authorRole,
  isStatusUpdate: item.is_status_update || item.isStatusUpdate,
  oldStatus: item.old_status || item.oldStatus,
  newStatus: item.new_status || item.newStatus,
  createdAt: item.created_at || item.createdAt,
});

// Generate ticket number
const generateTicketNumber = () => {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `TKT-${year}-${random}`;
};

// Helper function to get device icon
const getDeviceIcon = (type: string) => {
  const icons: Record<string, any> = {
    laptop: Laptop,
    phone: Smartphone,
    monitor: Monitor,
    tablet: Tablet,
    router: Router,
    server: Server,
    printer: Printer,
    headphones: Headphones,
    keyboard: Keyboard,
    mouse: Mouse,
    wifi: Wifi,
    other: Package
  };
  return icons[type.toLowerCase()] || Package;
};

// Helper function to get priority badge
const getPriorityBadge = (priority: string) => {
  const configs: Record<string, { label: string; className: string }> = {
    low: { label: "Low", className: "bg-slate-100 text-slate-700 border-slate-300" },
    medium: { label: "Medium", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
    high: { label: "High", className: "bg-orange-100 text-orange-700 border-orange-300" },
    critical: { label: "Critical", className: "bg-red-100 text-red-700 border-red-300" }
  };
  return configs[priority] || configs.medium;
};

// Helper function to get ticket status badge
const getTicketStatusBadge = (status: string) => {
  const configs: Record<string, { label: string; className: string; icon: any }> = {
    open: { label: "Open", className: "bg-blue-100 text-blue-700 border-blue-300", icon: Inbox },
    in_progress: { label: "In Progress", className: "bg-yellow-100 text-yellow-700 border-yellow-300", icon: Clock },
    resolved: { label: "Resolved", className: "bg-green-100 text-green-700 border-green-300", icon: CheckCircle },
    closed: { label: "Closed", className: "bg-slate-100 text-slate-700 border-slate-300", icon: CheckCircle }
  };
  return configs[status] || configs.open;
};

// Format date helper
function formatDate(dateStr: string, tz?: string | null, df?: string | null) {
  return formatDateTimeDisplay(dateStr, tz ?? null, df ?? null);
}

// Create Ticket Dialog Component
function CreateTicketDialog({
  systems,
  onSuccess,
  open,
  onOpenChange,
  defaultSystemId,
}: {
  systems: AssignedSystem[];
  onSuccess?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When the dialog opens, pre-select this assigned system (systems[].id) */
  defaultSystemId?: string | null;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    assetId: "none",
    title: "",
    description: "",
    priority: "medium"
  });
  const [attachment, setAttachment] = useState<{ dataUrl: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5MB
  const ACCEPT_TYPES = "image/*,.pdf,.txt,.log";

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const id =
        defaultSystemId && systems.some((s) => s.id === defaultSystemId) ? defaultSystemId : "none";
      setFormData((f) => ({ ...f, assetId: id }));
    }
    wasOpenRef.current = open;
  }, [open, defaultSystemId, systems]);

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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
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
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const clearAttachment = () => setAttachment(null);

  const addNotification = useNotificationStore((s) => s.addNotification);
  const createTicketMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/assets/tickets", data);
      return response.json();
    },
    onSuccess: (data: { id?: string }, variables) => {
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
      const ticketId = data?.id ? String(data.id) : "";
      addNotification({
        type: "ticket",
        title: "New Support Ticket",
        message: `${variables.title} — IT team will respond shortly.`,
        roles: ["it"],
        link: ticketId ? `/assets?tab=tickets&ticket=${encodeURIComponent(ticketId)}` : "/assets?tab=tickets",
        icon: "Laptop",
      });
      toast.success("Support ticket created successfully! IT team has been notified.", {
        description: "You'll receive updates via email and in this portal."
      });
      setFormData({ assetId: "none", title: "", description: "", priority: "medium" });
      setAttachment(null);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error("Failed to create ticket", {
        description: error.message || "Please try again"
      });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast.error("Please enter an issue title");
      return;
    }
    if (!formData.description.trim()) {
      toast.error("Please describe the issue");
      return;
    }

    const selectedSystem = formData.assetId !== "none" ? systems.find(s => s.id === formData.assetId) : null;

    createTicketMutation.mutate({
      ticketNumber: generateTicketNumber(),
      assetId: formData.assetId !== "none" ? formData.assetId : null,
      assetName: selectedSystem ? (selectedSystem.assetName || [selectedSystem.processor, selectedSystem.generation].filter(Boolean).join(" ") || selectedSystem.assetId) : null,
      title: formData.title,
      description: formData.description,
      priority: formData.priority,
      createdByName: user?.email || "Unknown User",
      attachmentUrl: attachment?.dataUrl ?? undefined,
      attachmentName: attachment?.name ?? undefined,
    });
  };

  const selectedSystem = systems.find(s => s.id === formData.assetId);

  const loading = createTicketMutation.isPending;

  const handleOpenChange = (next: boolean) => {
    if (!next) setAttachment(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TicketIcon className="h-5 w-5 text-primary" />
            Create Support Ticket
          </DialogTitle>
          <DialogDescription>
            Report an IT issue or request support. The IT team will be notified immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* System Selection (Optional) */}
          <div className="space-y-2">
            <Label>Related System (Optional)</Label>
            <Select
              value={formData.assetId}
              onValueChange={(value) => setFormData({ ...formData, assetId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a system if this issue is related to a specific device" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific system</SelectItem>
                {systems.map((system) => {
                  const name = system.assetName || [system.processor, system.generation].filter(Boolean).join(" ") || system.assetId;
                  return (
                    <SelectItem key={system.id} value={system.id}>
                      <div className="flex items-center gap-2">
                        <Laptop className="h-4 w-4" />
                        <span>{name} ({system.assetId})</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedSystem && (
              <p className="text-xs text-muted-foreground">
                {selectedSystem.assetName && <span className="font-medium">{selectedSystem.assetName} · </span>}
                Asset ID: {selectedSystem.assetId}
                {(selectedSystem.ram || selectedSystem.storage) && ` · ${[selectedSystem.ram, selectedSystem.storage].filter(Boolean).join(" · ")}`}
              </p>
            )}
          </div>

          {/* Issue Title */}
          <div className="space-y-2">
            <Label>Issue Title *</Label>
            <Input
              placeholder="Brief description of the problem"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              disabled={loading}
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select
              value={formData.priority}
              onValueChange={(value) => setFormData({ ...formData, priority: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-400" />
                    Low - Minor issue, no urgency
                  </div>
                </SelectItem>
                <SelectItem value="medium">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-500" />
                    Medium - Affecting productivity
                  </div>
                </SelectItem>
                <SelectItem value="high">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    High - Blocking work
                  </div>
                </SelectItem>
                <SelectItem value="critical">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    Critical - Complete system failure
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea
              placeholder="Please describe the issue in detail. Include any error messages, when it started, and steps to reproduce..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              disabled={loading}
              rows={5}
            />
          </div>

          {/* Attachment */}
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
                  <span className="text-sm truncate" title={attachment.name}>{attachment.name}</span>
                </div>
                <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={clearAttachment}>
                  Remove
                </Button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed rounded-lg p-4 text-center text-muted-foreground cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <Paperclip className="h-6 w-6 mx-auto mb-2" />
                <p className="text-sm">Drag & drop or click to attach</p>
                <p className="text-xs">Images, PDF, .txt, .log (max 5MB)</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit Ticket
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Ticket Detail Dialog
function TicketDetailDialog({
  ticket,
  onRequestDelete,
  deepLinkOpen,
  onCloseAfterDeepLink,
}: {
  ticket: SupportTicket;
  onRequestDelete?: () => void;
  deepLinkOpen?: boolean;
  onCloseAfterDeepLink?: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const statusBadge = getTicketStatusBadge(ticket.status);
  const priorityBadge = getPriorityBadge(ticket.priority);
  const StatusIcon = statusBadge.icon;

  // Fetch comments for this ticket
  const { data: comments = [], isLoading: loadingComments, refetch: refetchComments } = useQuery({
    queryKey: ["ticket-comments", ticket.id],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/assets/tickets/${ticket.id}/comments`);
      const data = await response.json();
      return Array.isArray(data) ? data.map(transformComment) : [];
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
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
      toast.success("Reply sent successfully!");
      setReply("");
    },
    onError: (error: any) => {
      toast.error("Failed to send reply", {
        description: error.message || "Please try again"
      });
    }
  });

  const handleReply = () => {
    if (!reply.trim()) return;
    addCommentMutation.mutate(reply);
  };

  useEffect(() => {
    if (deepLinkOpen) setOpen(true);
  }, [deepLinkOpen, ticket.id]);

  const getAuthorRoleLabel = (role: string) => {
    switch (role) {
      case "it_support": return "IT Support";
      case "admin": return "Admin";
      case "employee": return "Employee";
      default: return role;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && deepLinkOpen) onCloseAfterDeepLink?.();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1">
          <Eye className="h-4 w-4" />
          View
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <TicketIcon className="h-5 w-5 text-primary" />
              {ticket.ticketNumber}
            </DialogTitle>
            <div className="flex gap-2">
              <Badge variant="outline" className={priorityBadge.className}>
                {priorityBadge.label}
              </Badge>
              <Badge variant="outline" className={statusBadge.className}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusBadge.label}
              </Badge>
            </div>
          </div>
          <DialogDescription className="text-left">
            {ticket.assetName && (
              <span className="text-xs text-muted-foreground">
                Related to: {ticket.assetName}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Ticket Info */}
          <div>
            <h4 className="font-semibold text-lg">{ticket.title}</h4>
            <p className="text-sm text-muted-foreground mt-1">{ticket.description}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Created: {formatDate(ticket.createdAt, user?.timeZone ?? null, user?.dateFormat ?? null)} | Last Updated: {formatDate(ticket.updatedAt, user?.timeZone ?? null, user?.dateFormat ?? null)}
            </p>
            {ticket.assignedToName && (
              <p className="text-xs text-muted-foreground mt-1">
                Assigned to: <span className="font-medium">{ticket.assignedToName}</span>
              </p>
            )}
            {ticket.hasAttachment && (
              <div className="mt-3">
                <TicketAttachmentPreview ticketId={ticket.id} fileName={ticket.attachmentName} />
              </div>
            )}
          </div>

          <Separator />

          {/* Conversation / Activity Log */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h5 className="font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Activity & Updates
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
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-3">
                {loadingComments ? (
                  <div className="flex justify-center py-4">
                    <Spinner className="h-6 w-6" />
                  </div>
                ) : comments.length > 0 ? (
                  comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`p-3 rounded-lg ${
                        (comment.isStatusUpdate === true || comment.isStatusUpdate === "true")
                          ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                          : comment.authorRole === "employee"
                            ? "bg-primary/5 border border-primary/20 ml-8"
                            : "bg-muted mr-8"
                      }`}
                    >
                      {(comment.isStatusUpdate === true || comment.isStatusUpdate === "true") ? (
                        <div className="flex items-center gap-2 text-sm">
                          <ArrowRight className="h-4 w-4 text-blue-600" />
                          <span className="font-medium">{comment.authorName}</span>
                          <span className="text-muted-foreground">updated status:</span>
                          <Badge variant="outline" className={getTicketStatusBadge(comment.oldStatus || "").className}>
                            {getTicketStatusBadge(comment.oldStatus || "").label}
                          </Badge>
                          <ArrowRight className="h-3 w-3" />
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
                        {formatDate(comment.createdAt, user?.timeZone ?? null, user?.dateFormat ?? null)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No activity yet. IT team will respond shortly.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Resolution info (if resolved) */}
          {ticket.resolution && (
            <>
              <Separator />
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <h5 className="font-medium text-green-800 dark:text-green-300 mb-1 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Resolution
                </h5>
                <p className="text-sm text-green-700 dark:text-green-400">{ticket.resolution}</p>
                {ticket.resolvedAt && (
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                    Resolved on {formatDate(ticket.resolvedAt, user?.timeZone ?? null, user?.dateFormat ?? null)}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Reply box: employee can always reply to IT (including after resolved/closed for follow-up) */}
          <Separator />
          <div className="space-y-2">
            <div>
              <Label>Add your reply</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Reply to IT responses. Your message will be visible to the support team.</p>
            </div>
            <div className="flex gap-2">
              <Textarea
                placeholder="Type your message..."
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
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {onRequestDelete && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive border-destructive/50 hover:bg-destructive/10"
              onClick={() => {
                onRequestDelete();
                setOpen(false);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove ticket
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ITSupport() {
  const { user, isAdmin, isIT } = useAuth();
  const canDeleteTickets = isAdmin || isIT;
  const [, setLocation] = useLocation();
  const itSearch = useSearch();
  const [activeTab, setActiveTab] = useState("assets");
  const [ticketDeepLinkId, setTicketDeepLinkId] = useState<string | null>(null);
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [createTicketDefaultSystemId, setCreateTicketDefaultSystemId] = useState<string | null>(null);

  const openCreateTicket = (systemId?: string | null) => {
    setCreateTicketDefaultSystemId(systemId ?? null);
    setCreateTicketOpen(true);
  };
  const handleCreateTicketOpenChange = (o: boolean) => {
    if (!o) setCreateTicketDefaultSystemId(null);
    setCreateTicketOpen(o);
  };

  useEffect(() => {
    const q = new URLSearchParams(itSearch);
    const tid = q.get("ticket")?.trim();
    if (tid) {
      setTicketDeepLinkId(tid);
      setActiveTab("tickets");
    } else {
      setTicketDeepLinkId(null);
    }
  }, [itSearch]);

  const consumeItTicketDeepLink = () => {
    const q = new URLSearchParams(itSearch);
    q.delete("ticket");
    const s = q.toString();
    setLocation(s ? `/it-support?${s}` : "/it-support");
    setTicketDeepLinkId(null);
  };

  // Fetch user's assigned systems
  const { data: mySystems = [], isLoading: loadingSystems } = useQuery({
    queryKey: ["my-systems"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/assets/my-systems");
      const data = await response.json();
      return Array.isArray(data) ? data.map(transformSystem) : [];
    },
  });

  // Fetch user's tickets
  const { data: myTickets = [], isLoading: loadingTickets } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/assets/my-tickets");
      const data = await response.json();
      return Array.isArray(data) ? data.map(transformTicket) : [];
    },
  });

  const queryClient = useQueryClient();
  const [ticketToDelete, setTicketToDelete] = useState<SupportTicket | null>(null);
  const deleteTicketMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      await apiRequest("DELETE", `/api/assets/tickets/${ticketId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
      setTicketToDelete(null);
      toast.success("Ticket removed");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove ticket");
      setTicketToDelete(null);
    },
  });

  const isLoading = loadingSystems || loadingTickets;

  // Stats
  const openTickets = myTickets.filter(t => t.status === "open" || t.status === "in_progress").length;
  const resolvedTickets = myTickets.filter(t => t.status === "resolved" || t.status === "closed").length;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Spinner className="h-8 w-8" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">IT Support</h1>
          <p className="text-muted-foreground">
            View your assigned devices and get help from IT
          </p>
        </div>
        <Button className="gap-2" onClick={() => openCreateTicket(null)}>
          <Plus className="h-4 w-4" />
          Create Support Ticket
        </Button>
        <CreateTicketDialog
          systems={mySystems}
          open={createTicketOpen}
          onOpenChange={handleCreateTicketOpenChange}
          defaultSystemId={createTicketDefaultSystemId}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Laptop className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{mySystems.length}</p>
                <p className="text-sm text-muted-foreground">My Devices</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{openTickets}</p>
                <p className="text-sm text-muted-foreground">Open Tickets</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{resolvedTickets}</p>
                <p className="text-sm text-muted-foreground">Resolved</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <TicketIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{myTickets.length}</p>
                <p className="text-sm text-muted-foreground">Total Tickets</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Card>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <CardHeader className="pb-0">
            <TabsList>
              <TabsTrigger value="assets" className="gap-2">
                <Laptop className="h-4 w-4" />
                My Devices
              </TabsTrigger>
              <TabsTrigger value="tickets" className="gap-2">
                <TicketIcon className="h-4 w-4" />
                My Tickets
                {openTickets > 0 && (
                  <Badge variant="secondary" className="ml-1">{openTickets}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="pt-6">
            {/* My Devices Tab */}
            <TabsContent value="assets" className="m-0">
              {mySystems.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No devices assigned</h3>
                  <p className="text-muted-foreground">
                    You don't have any IT equipment assigned to you yet.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {mySystems.map((system) => {
                    const isPeripheral = system.assetId?.startsWith("PERIPH");
                    const peripheralLabel = isPeripheral && system.notes ? system.notes.split(" | ")[0]?.trim() : null;
                    const assetDisplayName = system.assetName || peripheralLabel || system.assetCategory || [system.processor, system.generation].filter(Boolean).join(" ") || "Device";
                    return (
                      <Card key={system.id} className="overflow-hidden">
                        <div className="bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 p-4 flex items-center gap-4">
                          <div className="p-3 rounded-xl bg-white dark:bg-slate-700 shadow-sm">
                            <Laptop className="h-8 w-8 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate">{assetDisplayName}</h3>
                            <p className="text-sm text-muted-foreground font-mono truncate">
                              {system.assetId}
                            </p>
                          </div>
                        </div>
                        <CardContent className="p-4 space-y-3">
                          <div className="text-sm">
                            <p className="text-muted-foreground">Asset ID</p>
                            <p className="font-mono font-medium">{system.assetId}</p>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {system.processor && (
                              <Badge variant="outline" className="text-xs">
                                <Cpu className="h-3 w-3 mr-1" />
                                {system.processor}
                              </Badge>
                            )}
                            {system.ram && (
                              <Badge variant="outline" className="text-xs">
                                {system.ram}
                              </Badge>
                            )}
                            {system.storage && (
                              <Badge variant="outline" className="text-xs">
                                <HardDrive className="h-3 w-3 mr-1" />
                                {system.storage}
                              </Badge>
                            )}
                            {!system.processor && !system.ram && !system.storage && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>

                          {system.notes && (
                            <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                              {system.notes}
                            </p>
                          )}

                          <Button
                            variant="outline"
                            className="w-full gap-2"
                            onClick={() => openCreateTicket(system.id)}
                          >
                            <AlertCircle className="h-4 w-4" />
                            Report Issue
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* My Tickets Tab */}
            <TabsContent value="tickets" className="m-0">
              {myTickets.length === 0 ? (
                <div className="text-center py-12">
                  <TicketIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No support tickets</h3>
                  <p className="text-muted-foreground mb-4">
                    You haven't created any support tickets yet.
                  </p>
                  <Button onClick={() => openCreateTicket(null)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create your first ticket
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {myTickets.map((ticket) => {
                    const statusBadge = getTicketStatusBadge(ticket.status);
                    const priorityBadge = getPriorityBadge(ticket.priority);
                    const StatusIcon = statusBadge.icon;

                    return (
                      <Card key={ticket.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-mono text-sm text-muted-foreground">
                                  {ticket.ticketNumber}
                                </span>
                                <Badge variant="outline" className={priorityBadge.className}>
                                  {priorityBadge.label}
                                </Badge>
                                <Badge variant="outline" className={statusBadge.className}>
                                  <StatusIcon className="h-3 w-3 mr-1" />
                                  {statusBadge.label}
                                </Badge>
                              </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold">{ticket.title}</h3>
                                <div className="flex gap-1 ml-auto shrink-0">
                                  <TicketDetailDialog
                                    ticket={ticket}
                                    onRequestDelete={canDeleteTickets ? () => setTicketToDelete(ticket) : undefined}
                                    deepLinkOpen={ticketDeepLinkId === ticket.id}
                                    onCloseAfterDeepLink={consumeItTicketDeepLink}
                                  />
                                  {canDeleteTickets && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-muted-foreground hover:text-destructive gap-1"
                                      onClick={() => setTicketToDelete(ticket)}
                                      aria-label={`Remove ticket ${ticket.ticketNumber}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Remove
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {ticket.assetName && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                  <Laptop className="h-3 w-3" />
                                  {ticket.assetName}
                                </p>
                              )}
                              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                {ticket.description}
                              </p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Created: {formatDate(ticket.createdAt, user?.timeZone ?? null, user?.dateFormat ?? null)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Updated: {formatDate(ticket.updatedAt, user?.timeZone ?? null, user?.dateFormat ?? null)}
                                </span>
                                {ticket.assignedToName && (
                                  <span className="flex items-center gap-1">
                                    <Wrench className="h-3 w-3" />
                                    {ticket.assignedToName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </CardContent>
        </Tabs>

        {/* Confirm remove ticket */}
        <AlertDialog open={!!ticketToDelete} onOpenChange={(open) => !open && setTicketToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this ticket?</AlertDialogTitle>
              <AlertDialogDescription>
                {ticketToDelete && (
                  <>This will permanently remove ticket <span className="font-mono font-medium">{ticketToDelete.ticketNumber}</span>. This cannot be undone.</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteTicketMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => ticketToDelete && deleteTicketMutation.mutate(ticketToDelete.id)}
                disabled={deleteTicketMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteTicketMutation.isPending ? "Removing…" : "Remove"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    </Layout>
  );
}
