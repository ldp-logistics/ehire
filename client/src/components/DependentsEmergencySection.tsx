import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Mail, Phone, Edit2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { formatDateOnly } from "@/pages/employeeProfile/types";

interface DependentRow {
  id: string;
  full_name: string;
  relationship: string | null;
  date_of_birth: string | null;
  gender: string | null;
}

interface EmergencyContactRow {
  id: string;
  full_name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

async function parseList<T>(res: Response): Promise<T[]> {
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
}

type Props = {
  employeeId: string | undefined;
  canEdit: boolean;
};

export function DependentsEmergencySection({ employeeId, canEdit }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const df = user?.dateFormat ?? null;

  const { data: dependentsList = [] } = useQuery<DependentRow[]>({
    queryKey: ["/api/employees", employeeId, "dependents"],
    queryFn: async () => {
      const res = await fetch(`/api/employees/${employeeId}/dependents`, { credentials: "include" });
      return parseList<DependentRow>(res);
    },
    enabled: !!employeeId,
  });

  const { data: emergencyContactsList = [] } = useQuery<EmergencyContactRow[]>({
    queryKey: ["/api/employees", employeeId, "emergency-contacts"],
    queryFn: async () => {
      const res = await fetch(`/api/employees/${employeeId}/emergency-contacts`, { credentials: "include" });
      return parseList<EmergencyContactRow>(res);
    },
    enabled: !!employeeId,
  });

  const [depDialogOpen, setDepDialogOpen] = useState(false);
  const [depEditing, setDepEditing] = useState<DependentRow | null>(null);
  const [depForm, setDepForm] = useState({ fullName: "", relationship: "", dateOfBirth: "", gender: "" });
  const [depSaving, setDepSaving] = useState(false);

  const [ecDialogOpen, setEcDialogOpen] = useState(false);
  const [ecEditing, setEcEditing] = useState<EmergencyContactRow | null>(null);
  const [ecForm, setEcForm] = useState({ fullName: "", relationship: "", phone: "", email: "", address: "" });
  const [ecSaving, setEcSaving] = useState(false);

  useEffect(() => {
    if (!depDialogOpen) return;
    if (depEditing) {
      const dob = depEditing.date_of_birth ? new Date(depEditing.date_of_birth).toISOString().slice(0, 10) : "";
      setDepForm({
        fullName: depEditing.full_name || "",
        relationship: depEditing.relationship || "",
        dateOfBirth: dob,
        gender: depEditing.gender || "",
      });
    } else {
      setDepForm({ fullName: "", relationship: "", dateOfBirth: "", gender: "" });
    }
  }, [depDialogOpen, depEditing]);

  useEffect(() => {
    if (!ecDialogOpen) return;
    if (ecEditing) {
      setEcForm({
        fullName: ecEditing.full_name || "",
        relationship: ecEditing.relationship || "",
        phone: ecEditing.phone || "",
        email: ecEditing.email || "",
        address: ecEditing.address || "",
      });
    } else {
      setEcForm({ fullName: "", relationship: "", phone: "", email: "", address: "" });
    }
  }, [ecDialogOpen, ecEditing]);

  const invalidateDeps = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId, "dependents"] });
  };
  const invalidateEc = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId, "emergency-contacts"] });
  };

  const saveDependent = async () => {
    if (!employeeId || !depForm.fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    setDepSaving(true);
    try {
      const body = {
        fullName: depForm.fullName.trim(),
        relationship: depForm.relationship.trim() || null,
        dateOfBirth: depForm.dateOfBirth.trim() || null,
        gender: depForm.gender.trim() || null,
      };
      if (depEditing) {
        const res = await fetch(`/api/employees/dependents/${depEditing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        toast.success("Dependent updated");
      } else {
        const res = await fetch(`/api/employees/${employeeId}/dependents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        toast.success("Dependent added");
      }
      invalidateDeps();
      setDepDialogOpen(false);
      setDepEditing(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setDepSaving(false);
    }
  };

  const deleteDependent = async (row: DependentRow) => {
    if (!confirm(`Remove dependent “${row.full_name}”?`)) return;
    try {
      const res = await fetch(`/api/employees/dependents/${row.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Dependent removed");
      invalidateDeps();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const saveEmergency = async () => {
    if (!employeeId || !ecForm.fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    setEcSaving(true);
    try {
      const body = {
        fullName: ecForm.fullName.trim(),
        relationship: ecForm.relationship.trim() || null,
        phone: ecForm.phone.trim() || null,
        email: ecForm.email.trim() || null,
        address: ecForm.address.trim() || null,
      };
      if (ecEditing) {
        const res = await fetch(`/api/employees/emergency-contacts/${ecEditing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        toast.success("Emergency contact updated");
      } else {
        const res = await fetch(`/api/employees/${employeeId}/emergency-contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        toast.success("Emergency contact added");
      }
      invalidateEc();
      setEcDialogOpen(false);
      setEcEditing(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setEcSaving(false);
    }
  };

  const deleteEmergency = async (row: EmergencyContactRow) => {
    if (!confirm(`Remove emergency contact “${row.full_name}”?`)) return;
    try {
      const res = await fetch(`/api/employees/emergency-contacts/${row.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Emergency contact removed");
      invalidateEc();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (!employeeId) return null;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border border-border shadow-sm bg-card">
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle>Dependents</CardTitle>
              <CardDescription className="text-muted-foreground">
                {canEdit
                  ? "Add or edit dependents for this employee."
                  : "View only. To change dependents, ask your HR partner."}
              </CardDescription>
            </div>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDepEditing(null);
                  setDepDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dependentsList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No dependents on record.</p>
              ) : (
                dependentsList.map((d, i) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 p-3 bg-muted/50 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{d.full_name}</p>
                      <p className="text-xs text-muted-foreground">{d.relationship ?? "—"}</p>
                      {(d.date_of_birth || d.gender) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {d.date_of_birth ? formatDateOnly(d.date_of_birth, df) || d.date_of_birth : ""}
                          {d.date_of_birth && d.gender ? " · " : ""}
                          {d.gender ?? ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {i === 0 && <Badge variant="outline">Primary</Badge>}
                      {canEdit && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setDepEditing(d);
                              setDepDialogOpen(true);
                            }}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteDependent(d)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border shadow-sm bg-card">
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle>Emergency Contacts</CardTitle>
              <CardDescription className="text-muted-foreground">
                {canEdit
                  ? "Add or edit emergency contacts for this employee."
                  : "View only. To change contacts, ask your HR partner."}
              </CardDescription>
            </div>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEcEditing(null);
                  setEcDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {emergencyContactsList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No emergency contacts on record.</p>
              ) : (
                emergencyContactsList.map((ec) => (
                  <div key={ec.id} className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex justify-between gap-2 mb-1">
                      <p className="font-medium text-sm">{ec.full_name}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        {ec.relationship && (
                          <Badge variant="secondary" className="text-[10px]">
                            {ec.relationship}
                          </Badge>
                        )}
                        {canEdit && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEcEditing(ec);
                                setEcDialogOpen(true);
                              }}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteEmergency(ec)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {ec.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {ec.phone}
                      </p>
                    )}
                    {ec.email && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />{" "}
                        <a href={`mailto:${ec.email}`} className="text-primary hover:underline">
                          {ec.email}
                        </a>
                      </p>
                    )}
                    {ec.address && <p className="text-xs text-muted-foreground mt-1 truncate max-w-full">{ec.address}</p>}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={depDialogOpen}
        onOpenChange={(open) => {
          setDepDialogOpen(open);
          if (!open) setDepEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{depEditing ? "Edit dependent" : "Add dependent"}</DialogTitle>
            <DialogDescription>Name is required; other fields are optional.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Full name *</Label>
              <Input value={depForm.fullName} onChange={(e) => setDepForm({ ...depForm, fullName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Relationship</Label>
              <Input
                value={depForm.relationship}
                onChange={(e) => setDepForm({ ...depForm, relationship: e.target.value })}
                placeholder="e.g. Spouse, Child"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date of birth</Label>
              <Input
                type="date"
                value={depForm.dateOfBirth}
                onChange={(e) => setDepForm({ ...depForm, dateOfBirth: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Input
                value={depForm.gender}
                onChange={(e) => setDepForm({ ...depForm, gender: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveDependent} disabled={depSaving}>
              {depSaving ? "Saving…" : depEditing ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={ecDialogOpen}
        onOpenChange={(open) => {
          setEcDialogOpen(open);
          if (!open) setEcEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{ecEditing ? "Edit emergency contact" : "Add emergency contact"}</DialogTitle>
            <DialogDescription>Name is required; phone, email, and address are optional.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Full name *</Label>
              <Input value={ecForm.fullName} onChange={(e) => setEcForm({ ...ecForm, fullName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Relationship</Label>
              <Input
                value={ecForm.relationship}
                onChange={(e) => setEcForm({ ...ecForm, relationship: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={ecForm.phone} onChange={(e) => setEcForm({ ...ecForm, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={ecForm.email} onChange={(e) => setEcForm({ ...ecForm, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Textarea
                rows={2}
                value={ecForm.address}
                onChange={(e) => setEcForm({ ...ecForm, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEcDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEmergency} disabled={ecSaving}>
              {ecSaving ? "Saving…" : ecEditing ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
