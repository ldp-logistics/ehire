import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Link, useSearch } from "wouter";
import {
  FileEdit,
  Inbox,
  CheckCircle,
  XCircle,
  Loader2,
  User,
  ArrowRight,
  Trash2,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatChangeRequestValue, formatDateTimeDisplay } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

// Match backend ChangeRequestResponseDTO (camelCase)
interface ChangeRequestRow {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  requesterEmail?: string;
  category: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  status: string;
  createdAt: string;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
}

function categoryLabel(cat: string) {
  const labels: Record<string, string> = {
    personal_details: "Personal details",
    address: "Address",
    contact: "Contact",
    dependents: "Dependents",
    emergency_contacts: "Emergency contacts",
    bank_details: "Bank details",
  };
  return labels[cat] || cat;
}

function fieldLabel(fieldName: string) {
  if (fieldName === "avatar") return "Profile photo";
  return fieldName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusBadgeClass(status: string) {
  if (status === "pending") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "approved") return "bg-green-50 text-green-700 border-green-200";
  return "bg-red-50 text-red-700 border-red-200";
}

function AvatarChangeValue({
  requestId,
  side,
  value,
  className,
}: {
  requestId: string;
  side: "old" | "new";
  value: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!value?.trim()) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {side === "old" ? "No previous photo on file" : "—"}
      </p>
    );
  }

  const trimmed = value.trim();
  // SharePoint / https URLs must be proxied; data URLs can load directly
  const src = trimmed.startsWith("data:image")
    ? trimmed
    : `/api/change-requests/${requestId}/image?side=${side}`;

  if (failed) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {side === "old" ? "Previous photo could not be loaded" : "Requested photo could not be loaded"}
      </p>
    );
  }

  return (
    <img
      src={src}
      alt={side === "old" ? "Previous profile photo" : "Requested profile photo"}
      className={cn("max-h-40 rounded-lg border border-border object-contain bg-muted/30", className)}
      onError={() => setFailed(true)}
    />
  );
}

function ChangeValueDisplay({
  requestId,
  value,
  fieldName,
  side,
  tz,
  df,
  className,
}: {
  requestId: string;
  value: string | null;
  fieldName: string;
  side: "old" | "new";
  tz: string | null;
  df: string | null;
  className?: string;
}) {
  if (fieldName === "avatar") {
    return (
      <AvatarChangeValue
        requestId={requestId}
        side={side}
        value={value}
        className={className}
      />
    );
  }
  return (
    <p className={cn("text-sm whitespace-pre-wrap break-words", className)}>
      {formatChangeRequestValue(value, tz, df, 2000)}
    </p>
  );
}

function ChangeRequestDetailDialog({
  request,
  open,
  onOpenChange,
  tz,
  df,
  isApprover,
  onApprove,
  onReject,
  onDelete,
  actionsPending,
}: {
  request: ChangeRequestRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tz: string | null;
  df: string | null;
  isApprover: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string, notes: string) => void;
  onDelete: (id: string) => void;
  actionsPending: boolean;
}) {
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  useEffect(() => {
    if (!open) {
      setRejectNotes("");
      setShowRejectForm(false);
    }
  }, [open]);

  if (!request) return null;

  const handleReject = () => {
    const notes = rejectNotes.trim();
    if (!notes) {
      toast.error("Rejection reason is required");
      return;
    }
    onReject(request.id, notes);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            Change request
            <Badge variant="outline" className={statusBadgeClass(request.status)}>
              {request.status}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {categoryLabel(request.category)} · {fieldLabel(request.fieldName)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-muted-foreground text-xs">Employee</Label>
              <p className="font-medium mt-0.5">{request.employeeName ?? "—"}</p>
              {request.employeeCode && (
                <p className="text-xs text-muted-foreground">{request.employeeCode}</p>
              )}
            </div>
            {request.requesterEmail && (
              <div>
                <Label className="text-muted-foreground text-xs">Requested by</Label>
                <p className="mt-0.5 break-all">{request.requesterEmail}</p>
              </div>
            )}
          </div>

          <Link href={`/employees/${request.employeeId}`}>
            <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto">
              <ExternalLink className="h-4 w-4" />
              View employee profile
            </Button>
          </Link>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <Label className="text-muted-foreground text-xs">Previous value</Label>
              <div className="mt-2">
                <ChangeValueDisplay
                  requestId={request.id}
                  value={request.oldValue}
                  fieldName={request.fieldName}
                  side="old"
                  tz={tz}
                  df={df}
                />
              </div>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <Label className="text-muted-foreground text-xs">Requested value</Label>
              <div className="mt-2">
                <ChangeValueDisplay
                  requestId={request.id}
                  value={request.newValue}
                  fieldName={request.fieldName}
                  side="new"
                  tz={tz}
                  df={df}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Submitted:</span>{" "}
              {formatDateTimeDisplay(request.createdAt, tz, df)}
            </p>
            {request.reviewedAt && (
              <p>
                <span className="font-medium text-foreground">Reviewed:</span>{" "}
                {formatDateTimeDisplay(request.reviewedAt, tz, df)}
              </p>
            )}
          </div>

          {request.status === "rejected" && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <span className="font-medium">Rejection reason:</span>{" "}
              {request.reviewNotes?.trim() ? request.reviewNotes : "No reason provided"}
            </div>
          )}

          {request.status === "approved" && request.reviewNotes?.trim() && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              <span className="font-medium">Review notes:</span> {request.reviewNotes}
            </div>
          )}

          {isApprover && request.status === "pending" && showRejectForm && (
            <div className="space-y-2">
              <Label htmlFor="reject-notes">Rejection reason (required)</Label>
              <Textarea
                id="reject-notes"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                rows={3}
                placeholder="Explain why this change cannot be approved…"
              />
            </div>
          )}
        </div>

        {isApprover && (
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-muted-foreground hover:text-destructive hover:border-destructive/30"
              onClick={() => {
                if (window.confirm("Delete this change request? This cannot be undone.")) {
                  onDelete(request.id);
                  onOpenChange(false);
                }
              }}
              disabled={actionsPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            <div className="flex flex-wrap gap-2 justify-end w-full sm:w-auto">
              {request.status === "pending" && (
                <>
                  {showRejectForm ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowRejectForm(false)}
                        disabled={actionsPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={handleReject}
                        disabled={actionsPending}
                      >
                        Confirm reject
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setShowRejectForm(true)}
                      disabled={actionsPending}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="text-green-700 bg-green-50 hover:bg-green-100 border border-green-200"
                    onClick={() => {
                      onApprove(request.id);
                      onOpenChange(false);
                    }}
                    disabled={actionsPending || showRejectForm}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ChangeRequests() {
  const { user, isAdmin, isHR } = useAuth();
  const tz = user?.timeZone ?? null;
  const df = user?.dateFormat ?? null;
  const queryClient = useQueryClient();
  const crSearch = useSearch();
  const [selected, setSelected] = useState<ChangeRequestRow | null>(null);

  const { data: requests = [], isLoading, error } = useQuery<ChangeRequestRow[]>({
    queryKey: ["/api/change-requests"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/change-requests");
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, reviewNotes }: { id: string; reviewNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/change-requests/${id}/approve`, { reviewNotes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast.success("Change request approved");
      setSelected(null);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to approve"),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reviewNotes }: { id: string; reviewNotes: string }) => {
      const res = await apiRequest("PATCH", `/api/change-requests/${id}/reject`, { reviewNotes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast.success("Change request rejected");
      setSelected(null);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to reject"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/change-requests/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast.success("Change request deleted");
      setSelected(null);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to delete"),
  });

  const pending = requests.filter((r) => r.status === "pending");
  const isApprover = isAdmin || isHR;
  const actionsPending =
    approveMutation.isPending || rejectMutation.isPending || deleteMutation.isPending;

  // Open detail from notification link ?request=<id>
  useEffect(() => {
    const id = new URLSearchParams(crSearch).get("request")?.trim();
    if (!id) return;
    const row = requests.find((r) => r.id === id);
    if (row) setSelected(row);
  }, [crSearch, requests]);

  // Keep selected row in sync after list refresh
  useEffect(() => {
    if (!selected) return;
    const updated = requests.find((r) => r.id === selected.id);
    if (updated) setSelected(updated);
    else setSelected(null);
  }, [requests, selected?.id]);

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-foreground">Change requests</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isApprover
            ? "Review and approve or reject profile change requests from employees."
            : "View your profile change requests and their status."}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileEdit className="h-5 w-5" />
              {isApprover ? "All change requests" : "My change requests"}
            </CardTitle>
            <CardDescription>
              {isApprover
                ? `${pending.length} pending · ${requests.length} total · Click a row for details`
                : `${requests.length} request(s) · Click a row for details`}
            </CardDescription>
          </div>
          {user?.employeeId && (
            <Link href={`/employees/${user.employeeId}`}>
              <Button variant="outline" size="sm" className="gap-2">
                <User className="h-4 w-4" />
                My profile — request a change
              </Button>
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-4">Failed to load change requests.</p>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Inbox className="h-12 w-12 mb-3 opacity-50" />
              <p className="font-medium">No change requests</p>
              <p className="text-sm mt-1">
                {user?.employeeId
                  ? "Go to your profile and edit Personal details, Address, Dependents, or Emergency contacts to submit a change request for HR approval."
                  : "No requests to show."}
              </p>
              {user?.employeeId && (
                <Link href={`/employees/${user.employeeId}`}>
                  <Button variant="outline" size="sm" className="mt-4 gap-2">
                    <ArrowRight className="h-4 w-4" />
                    Open my profile
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="max-h-[min(70vh,600px)] overflow-y-auto overflow-x-hidden space-y-3 pr-1">
              {requests.map((r) => (
                <div
                  key={r.id}
                  id={`change-req-${r.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(r);
                    }
                  }}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4 scroll-mt-20",
                    "cursor-pointer transition-colors hover:bg-muted/40 hover:border-primary/20",
                    selected?.id === r.id && "ring-1 ring-primary/30 bg-muted/30"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.employeeName ?? "—"}</span>
                      {r.employeeCode && (
                        <span className="text-xs text-muted-foreground">{r.employeeCode}</span>
                      )}
                      <Badge variant="outline" className={statusBadgeClass(r.status)}>
                        {r.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {categoryLabel(r.category)} · <span className="font-mono text-xs">{fieldLabel(r.fieldName)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {formatChangeRequestValue(r.oldValue, tz, df)} → {formatChangeRequestValue(r.newValue, tz, df)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDateTimeDisplay(r.createdAt, tz, df)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 text-muted-foreground">
                    {isApprover && r.status === "pending" && (
                      <div
                        className="flex gap-2"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-200 hover:bg-green-50"
                          onClick={() => approveMutation.mutate({ id: r.id })}
                          disabled={actionsPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => {
                            const notes = window.prompt("Rejection reason (required):");
                            if (notes?.trim()) rejectMutation.mutate({ id: r.id, reviewNotes: notes.trim() });
                            else if (notes !== null) toast.error("Rejection reason is required");
                          }}
                          disabled={actionsPending}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                    <ChevronRight className="h-5 w-5" aria-hidden />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ChangeRequestDetailDialog
        request={selected}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        tz={tz}
        df={df}
        isApprover={isApprover}
        onApprove={(id) => approveMutation.mutate({ id })}
        onReject={(id, notes) => rejectMutation.mutate({ id, reviewNotes: notes })}
        onDelete={(id) => deleteMutation.mutate(id)}
        actionsPending={actionsPending}
      />
    </Layout>
  );
}
