import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link } from "wouter";
import { Plus, Pencil, Trash2, RotateCcw, Loader2, Layers, ChevronLeft, UserCircle, Check, ChevronsUpDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  buildTimezonePickerOptions,
  formatFreshteamStyleTimezoneLabel,
  type TimezonePickerOption,
} from "@/lib/timezonePicker";

const ENTITY_CONFIG: Record<string, { label: string; listKey: string; apiPath: string }> = {
  departments: { label: "Departments", listKey: "data", apiPath: "/api/departments" },
  "sub-departments": { label: "Sub-departments", listKey: "subDepartments", apiPath: "/api/departments/sub-departments" },
  "business-units": { label: "Business units", listKey: "businessUnits", apiPath: "/api/departments/business-units" },
  teams: { label: "Teams", listKey: "teams", apiPath: "/api/departments/teams" },
  levels: { label: "Levels", listKey: "levels", apiPath: "/api/departments/levels" },
  branches: { label: "Branches", listKey: "branches", apiPath: "/api/departments/branches" },
  shifts: { label: "Shifts", listKey: "shifts", apiPath: "/api/departments/shifts" },
  roles: { label: "Roles", listKey: "roles", apiPath: "/api/departments/roles" },
  "job-categories": { label: "Job categories", listKey: "jobCategories", apiPath: "/api/departments/job-categories" },
};

type EntityType = keyof typeof ENTITY_CONFIG;

interface OrgItem {
  id: string;
  name: string;
  isActive: boolean;
  employeeCount?: number;
  managerId?: string | null;
  managerName?: string | null;
  timeZone?: string | null;
  dateFormat?: string | null;
}

const DATE_FORMAT_OPTIONS = ["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"] as const;

function BranchTimezoneCombobox({
  value,
  onChange,
  options,
  byIana,
}: {
  value: string;
  onChange: (iana: string) => void;
  options: TimezonePickerOption[];
  byIana: Map<string, TimezonePickerOption>;
}) {
  const [open, setOpen] = useState(false);
  const selected = byIana.get(value);
  const triggerLabel = selected?.label ?? formatFreshteamStyleTimezoneLabel(value);

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-10 px-3"
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(520px,calc(100vw-2rem))]" align="start" sideOffset={4}>
        <Command
          filter={(iana, search) => {
            if (!search.trim()) return 1;
            const o = byIana.get(iana);
            if (!o) return 0;
            const q = search.toLowerCase().replace(/\s+/g, " ");
            return o.searchHints.includes(q) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search timezone..." className="h-11" />
          <CommandList className="max-h-72 overflow-y-auto">
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.iana}
                  value={o.iana}
                  onSelect={() => {
                    onChange(o.iana);
                    setOpen(false);
                  }}
                  className="cursor-pointer justify-between gap-2"
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      value === o.iana ? "opacity-100 text-primary" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function useOrgList(entityType: EntityType, includeInactive: boolean) {
  const config = ENTITY_CONFIG[entityType];
  const isDepartments = entityType === "departments";
  const url = isDepartments
    ? `${config.apiPath}?limit=500&page=1&includeInactive=${includeInactive}`
    : `${config.apiPath}?includeInactive=${includeInactive}`;
  return useQuery({
    queryKey: [config.apiPath, String(includeInactive)],
    queryFn: async () => {
      const res = await apiRequest("GET", url);
      const json = await res.json();
      if (isDepartments) return (json.data ?? []) as OrgItem[];
      // API returns { success: true, data: { businessUnits: [...] } } etc.
      const list = json.data?.[config.listKey] ?? json[config.listKey];
      const arr = (Array.isArray(list) ? list : []) as OrgItem[];
      return arr.map((row) => {
        const r = row as unknown as Record<string, unknown>;
        return {
          ...row,
          isActive: r.isActive !== false && r.is_active !== false,
          managerId: (r.managerId ?? r.manager_id ?? null) as string | null,
          managerName: (r.managerName ?? r.manager_name ?? null) as string | null,
          timeZone: (r.timeZone ?? r.time_zone ?? null) as string | null | undefined,
          dateFormat: (r.dateFormat ?? r.date_format ?? null) as string | null | undefined,
        };
      });
    },
    enabled: !!entityType,
  });
}

export default function OrgStructure() {
  const queryClient = useQueryClient();
  const [activeEntity, setActiveEntity] = useState<EntityType>("departments");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<OrgItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<OrgItem | null>(null);
  const [newName, setNewName] = useState("");
  const [newTimeZone, setNewTimeZone] = useState<string>("UTC");
  const [newDateFormat, setNewDateFormat] = useState<string>("dd/MM/yyyy");
  const [editName, setEditName] = useState("");
  const [editManagerId, setEditManagerId] = useState<string>("");
  const [editTimeZone, setEditTimeZone] = useState<string>("UTC");
  const [editDateFormat, setEditDateFormat] = useState<string>("dd/MM/yyyy");

  const config = ENTITY_CONFIG[activeEntity];
  const isDepartments = activeEntity === "departments";
  const { data: items = [], isLoading } = useOrgList(activeEntity, true);

  const activeItems = items.filter((i) => i.isActive !== false);
  const deletedItems = items.filter((i) => i.isActive === false);
  const branchTzPickerOptions = useMemo(() => buildTimezonePickerOptions(), []);
  const branchTzByIana = useMemo(
    () => new Map(branchTzPickerOptions.map((o) => [o.iana, o] as const)),
    [branchTzPickerOptions],
  );

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; timeZone?: string | null; dateFormat?: string | null }) => {
      if (activeEntity === "branches") {
        const res = await apiRequest("POST", config.apiPath, {
          name: payload.name,
          timeZone: payload.timeZone ?? null,
          dateFormat: payload.dateFormat ?? null,
        });
        return res.json();
      }
      if (isDepartments) {
        const res = await apiRequest("POST", config.apiPath, { name: payload.name });
        return res.json();
      }
      const res = await apiRequest("POST", config.apiPath, { name: payload.name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.apiPath] });
      setAddOpen(false);
      setNewName("");
      setNewTimeZone("UTC");
      setNewDateFormat("dd/MM/yyyy");
      toast.success("Created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: managerPickList = [] } = useQuery({
    queryKey: ["/api/employees", "org-team-managers"],
    queryFn: async () => {
      const res = await fetch("/api/employees?limit=1000", { credentials: "include" });
      const j = await res.json();
      const list =
        j?.data && Array.isArray(j.data) ? j.data : Array.isArray(j) ? j : [];
      return list.map((e: Record<string, unknown>) => {
        const fn = String(e.first_name ?? e.firstName ?? "");
        const ln = String(e.last_name ?? e.lastName ?? "");
        const label = `${fn} ${ln}`.trim() || String(e.work_email ?? e.employee_id ?? e.id);
        return { id: String(e.id), label };
      });
    },
    enabled: activeEntity === "teams",
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; name: string; managerId?: string | null; timeZone?: string | null; dateFormat?: string | null }) => {
      const isTeams = activeEntity === "teams";
      const isBranches = activeEntity === "branches";
      const body =
        isTeams && Object.prototype.hasOwnProperty.call(payload, "managerId")
          ? { name: payload.name, managerId: payload.managerId }
          : isBranches
            ? { name: payload.name, timeZone: payload.timeZone ?? null, dateFormat: payload.dateFormat ?? null }
          : { name: payload.name };
      const res = await apiRequest("PUT", `${config.apiPath}/${payload.id}`, body);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [config.apiPath] });
      await queryClient.refetchQueries({ queryKey: [config.apiPath] });
      setEditItem(null);
      setEditName("");
      setEditTimeZone("UTC");
      setEditDateFormat("dd/MM/yyyy");
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `${config.apiPath}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.apiPath] });
      setDeleteItem(null);
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `${config.apiPath}/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [config.apiPath] });
      toast.success("Restored");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (item: OrgItem) => {
    setEditItem(item);
    setEditName(item.name);
    setEditManagerId(item.managerId ?? "");
    setEditTimeZone(item.timeZone ?? "UTC");
    setEditDateFormat(item.dateFormat ?? "dd/MM/yyyy");
  };

  return (
    <Layout>
      <div className="mb-6 flex flex-col gap-2">
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="text-muted-foreground -ml-1">
            <ChevronLeft className="h-4 w-4 mr-0.5" />
            Settings
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Organization structure</h1>
        <p className="text-sm text-muted-foreground">
          Manage departments, teams, business units, and other reference data. Deleted items can be restored.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              {config?.label ?? "Organization structure"}
            </CardTitle>
            <Button onClick={() => { setAddOpen(true); setNewName(""); setNewTimeZone("UTC"); setNewDateFormat("dd/MM/yyyy"); }}>
              <Plus className="h-4 w-4 mr-2" /> Add New
            </Button>
          </div>
          <CardDescription>
            Departments are the highest level of classification. Sub-departments, teams, and business units sit below. Use fewer entities for clearer dashboards.
            {activeEntity === "teams" && (
              <span className="block mt-2 text-amber-700 dark:text-amber-500/90">
                For <strong>Teams</strong>: optional <strong>team manager</strong> for org reference (My teams uses <strong>Department</strong> on employee profiles).
              </span>
            )}
            {activeEntity === "branches" && (
              <span className="block mt-2 text-amber-700 dark:text-amber-500/90">
                Each branch controls employee date/time display defaults via <strong>time zone</strong> and <strong>date format</strong>.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeEntity} onValueChange={(v) => setActiveEntity(v as EntityType)}>
            <TabsList className="flex flex-wrap h-auto gap-1">
              {(Object.keys(ENTITY_CONFIG) as EntityType[]).map((key) => (
                <TabsTrigger key={key} value={key} className="text-xs">
                  {ENTITY_CONFIG[key].label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value={activeEntity} className="mt-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Active</h3>
                    <ul className="space-y-1 border rounded-lg p-2 min-h-[120px]">
                      {activeItems.length === 0 ? (
                        <li className="text-sm text-muted-foreground py-4 text-center">No active items</li>
                      ) : (
                        activeItems.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between gap-2 py-2 px-2 rounded hover:bg-muted/50"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="truncate block font-medium">{item.name}</span>
                              {activeEntity === "teams" && item.managerName && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <UserCircle className="h-3 w-3 shrink-0" />
                                  {item.managerName}
                                </span>
                              )}
                              {activeEntity === "branches" && (
                                <span className="text-xs text-muted-foreground mt-0.5 block">
                                  {formatFreshteamStyleTimezoneLabel(item.timeZone ?? "UTC")} · {(item.dateFormat ?? "dd/MM/yyyy")}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)} title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteItem(item)} title="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium mb-2">Deleted</h3>
                    <ul className="space-y-1 border rounded-lg p-2 min-h-[120px] border-dashed">
                      {deletedItems.length === 0 ? (
                        <li className="text-sm text-muted-foreground py-4 text-center">No deleted items</li>
                      ) : (
                        deletedItems.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between gap-2 py-2 px-2 rounded hover:bg-muted/50"
                          >
                            <span className="truncate text-muted-foreground">{item.name}</span>
                            <Button variant="outline" size="sm" className="shrink-0" onClick={() => restoreMutation.mutate(item.id)}>
                              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                            </Button>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {config?.label?.slice(0, -1) ?? "item"}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label>Name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" />
            {activeEntity === "branches" && (
              <div className="space-y-3 mt-3">
                <div>
                  <Label>
                    Time zone <span className="text-destructive">*</span>
                  </Label>
                  <div className="mt-1.5">
                    <BranchTimezoneCombobox
                      value={newTimeZone}
                      onChange={setNewTimeZone}
                      options={branchTzPickerOptions}
                      byIana={branchTzByIana}
                    />
                  </div>
                </div>
                <div>
                  <Label>Date format</Label>
                  <Select value={newDateFormat} onValueChange={setNewDateFormat}>
                    <SelectTrigger><SelectValue placeholder="Select date format" /></SelectTrigger>
                    <SelectContent>
                      {DATE_FORMAT_OPTIONS.map((fmt) => (
                        <SelectItem key={fmt} value={fmt}>{fmt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() =>
                createMutation.mutate(
                  activeEntity === "branches"
                    ? { name: newName.trim(), timeZone: newTimeZone, dateFormat: newDateFormat }
                    : { name: newName.trim() },
                )
              }
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {config?.label?.slice(0, -1) ?? "item"}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" />
            </div>
            {activeEntity === "teams" && (
              <div>
                <Label>Team manager</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Optional lead for this org team. Colleague directory on My teams is by <strong>Department</strong>.
                </p>
                <Select
                  value={editManagerId || "__none__"}
                  onValueChange={(v) => setEditManagerId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No manager" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none__">No manager</SelectItem>
                    {managerPickList.map((emp: { id: string; label: string }) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {activeEntity === "branches" && (
              <>
                <div>
                  <Label>
                    Time zone <span className="text-destructive">*</span>
                  </Label>
                  <div className="mt-1.5">
                    <BranchTimezoneCombobox
                      value={editTimeZone}
                      onChange={setEditTimeZone}
                      options={branchTzPickerOptions}
                      byIana={branchTzByIana}
                    />
                  </div>
                </div>
                <div>
                  <Label>Date format</Label>
                  <Select value={editDateFormat} onValueChange={setEditDateFormat}>
                    <SelectTrigger><SelectValue placeholder="Select date format" /></SelectTrigger>
                    <SelectContent>
                      {DATE_FORMAT_OPTIONS.map((fmt) => (
                        <SelectItem key={fmt} value={fmt}>{fmt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button
              disabled={!editName.trim() || updateMutation.isPending || !editItem}
              onClick={() =>
                editItem &&
                updateMutation.mutate(
                  activeEntity === "teams"
                    ? { id: editItem.id, name: editName.trim(), managerId: editManagerId || null }
                    : activeEntity === "branches"
                      ? { id: editItem.id, name: editName.trim(), timeZone: editTimeZone, dateFormat: editDateFormat }
                    : { id: editItem.id, name: editName.trim() },
                )
              }
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteItem?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the item from dropdowns. You can restore it later from the Deleted list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
