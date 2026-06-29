import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, UsersRound, Building2, AlertCircle, User, Pencil, Shield } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState } from "react";

type Teammate = {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  avatar: string | null;
  isYou: boolean;
};

type DeptRow = { name: string; headcount: number };

type ManagedOrgTeam = {
  id: string;
  name: string;
  isActive: boolean;
  managerId: string | null;
  managerName: string | null;
};

type MyTeamsPayload = {
  scope: "org" | "mine" | "none";
  message?: string;
  yourDepartmentName: string | null;
  reportingManagerId: string | null;
  reportingManagerName: string | null;
  teammates: Teammate[];
  departments: DeptRow[];
};

export default function MyTeams() {
  const { user, isAdmin, isHR } = useAuth();
  const queryClient = useQueryClient();
  const [editManaged, setEditManaged] = useState<ManagedOrgTeam | null>(null);
  const [editManagedName, setEditManagedName] = useState("");

  const isAdminOrHr = isAdmin || isHR;
  const [allOrg, setAllOrg] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/departments/my-teams", allOrg],
    queryFn: async () => {
      const q = isAdminOrHr && allOrg ? "?allOrg=true" : "";
      const res = await apiRequest("GET", `/api/departments/my-teams${q}`);
      const json = await res.json();
      return (json.data ?? json) as MyTeamsPayload;
    },
    enabled: !!user,
  });

  const { data: managedPayload } = useQuery({
    queryKey: ["/api/departments/teams/managed-by-me"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/departments/teams/managed-by-me");
      const json = await res.json();
      const d = json.data ?? json;
      return (d.teams ?? []) as ManagedOrgTeam[];
    },
    enabled: !!user?.employeeId,
  });
  const managedTeams = managedPayload ?? [];

  const updateManagedTeamMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PUT", `/api/departments/teams/${id}`, { name: name.trim() });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments/teams/managed-by-me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments/teams"] });
      setEditManaged(null);
      setEditManagedName("");
      toast.success("Team updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deptName = data?.yourDepartmentName?.trim();
  const noDepartment =
    data?.scope === "mine" && (!deptName || deptName.length === 0) && !isLoading && data;

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UsersRound className="h-7 w-7 text-primary" />
          My teams
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Your <strong>department</strong> groups you with colleagues on this page. Your <strong>reporting manager</strong>{" "}
          is shown as your department lead. If HR has assigned you as <strong>team manager</strong> on an organization
          team, you can edit that team&apos;s name below. <strong>Admin/HR</strong> can add, remove, and assign managers
          under Settings → Organization structure.
        </p>
      </div>

      {isAdminOrHr && (
        <div className="flex items-center gap-3 mb-6 p-3 rounded-lg border bg-muted/30">
          <Switch id="all-org" checked={allOrg} onCheckedChange={setAllOrg} />
          <Label htmlFor="all-org" className="cursor-pointer">
            Show all departments (admin/HR)
          </Label>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            Failed to load.
          </CardContent>
        </Card>
      )}

      {!isLoading && data && (
        <div className="space-y-8">
          {data.scope === "none" && data.message && (
            <Card>
              <CardContent className="pt-6 flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">No employee profile linked</p>
                  <p className="text-sm text-muted-foreground mt-1">{data.message}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {noDepartment && (
            <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900">
              <CardContent className="pt-6">
                <p className="font-medium text-amber-900 dark:text-amber-200">No department on your profile</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Ask HR to set your <strong>Department</strong> on your employee profile so you can see colleagues here.
                </p>
              </CardContent>
            </Card>
          )}

          {managedTeams.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Organization teams you manage</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                You are the assigned <strong>team manager</strong> for these org teams. You can update the display name.
                Changing who leads the team is done by HR/Admin in Organization structure.
              </p>
              <ul className="space-y-2 max-w-xl">
                {managedTeams.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 border rounded-lg px-4 py-3 bg-card"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{t.name}</span>
                      {!t.isActive && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={!t.isActive}
                      onClick={() => {
                        setEditManaged(t);
                        setEditManagedName(t.name);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit name
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.scope === "mine" && deptName && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Your department</h2>
                <Badge variant="secondary" className="font-normal text-base px-2 py-0.5">
                  {deptName}
                </Badge>
              </div>
              <Card className="max-w-xl border-primary/25">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Department lead</CardTitle>
                  <CardDescription>
                    Your reporting manager (same as team manager for your department view).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.reportingManagerName ? (
                    <p className="font-medium text-lg">{data.reportingManagerName}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No reporting manager on your profile yet. HR can set <strong>Manager</strong> on your employee
                      record.
                    </p>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {data.scope === "mine" && (data.teammates?.length ?? 0) > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <User className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">People in your department</h2>
                {deptName && (
                  <Badge variant="outline" className="font-normal">
                    {data.teammates!.length} people
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Active, onboarding, or on leave — same <strong>Department</strong> field as you.
              </p>
              {(data.teammates ?? []).length === 1 && (data.teammates ?? [])[0]?.isYou && (
                <p className="text-sm text-amber-800 dark:text-amber-200/90 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2 mb-4">
                  You&apos;re the only person in this department in the directory. If others should appear, HR should
                  assign the same <strong>Department</strong> on their profiles.
                </p>
              )}
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(data.teammates ?? []).map((p) => (
                  <li key={p.id}>
                    <Link href={`/employees/${p.id}`}>
                      <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                        <CardContent className="flex items-center gap-3 p-4">
                          <Avatar className="h-11 w-11 shrink-0">
                            <AvatarImage
                              src={p.avatar?.startsWith("http") ? p.avatar : `/api/employees/${p.id}/avatar`}
                              alt=""
                            />
                            <AvatarFallback className="text-sm">
                              {(p.firstName?.[0] ?? "") + (p.lastName?.[0] ?? "") || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate flex items-center gap-2">
                              {p.firstName} {p.lastName}
                              {p.isYou && (
                                <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                                  You
                                </Badge>
                              )}
                            </div>
                            {p.jobTitle && (
                              <div className="text-sm text-muted-foreground truncate">{p.jobTitle}</div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.scope === "org" && (
            <section>
              <h2 className="text-lg font-semibold mb-1">All departments</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Headcount of active, onboarding, and on-leave employees per department name.
              </p>
              {data.departments.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground text-sm">
                    No departments found on employee records.
                  </CardContent>
                </Card>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left font-medium px-4 py-3">Department</th>
                        <th className="text-right font-medium px-4 py-3 w-28">People</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.departments.map((d) => (
                        <tr key={d.name} className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-medium">{d.name}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{d.headcount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {isAdminOrHr && !allOrg && (
            <p className="text-sm text-muted-foreground">
              Departments are edited on each employee profile. Org-structure{" "}
              <Link href="/settings/org-structure">
                <Button variant="link" className="h-auto p-0">
                  Organization structure
                </Button>
              </Link>{" "}
              — Admin/HR can <strong>add, remove, restore</strong> teams and <strong>assign team managers</strong>.
            </p>
          )}
        </div>
      )}

      <Dialog open={!!editManaged} onOpenChange={(o) => !o && setEditManaged(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit team name</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={editManagedName}
              onChange={(e) => setEditManagedName(e.target.value)}
              placeholder="Team name"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Only HR/Admin can delete teams or change the team manager assignment.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditManaged(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editManagedName.trim() || updateManagedTeamMutation.isPending || !editManaged}
              onClick={() =>
                editManaged &&
                updateManagedTeamMutation.mutate({ id: editManaged.id, name: editManagedName })
              }
            >
              {updateManagedTeamMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
