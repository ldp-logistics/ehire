import Layout from "@/components/layout/Layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, MapPin, Mail, Building2, Phone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { EmployeeListRow } from "@shared/employeeTypes";
import { formatEmployeeDisplayName } from "@shared/employeeDisplayName";

/** Role hierarchy for ordering: 0 = top (CEO), 3 = bottom (Employee). */
function getRoleOrder(jobTitle: string | null | undefined): number {
  const t = (jobTitle || "").toLowerCase().trim();
  if (t.includes("ceo") || t === "chief executive officer") return 0;
  if (t.includes("coo") || t === "chief operating officer") return 1;
  if (
    t.includes("manager") ||
    t.includes("director") ||
    t.includes("vp ") ||
    t.includes("vice president") ||
    t.includes("lead ") ||
    t.includes("head of")
  )
    return 2;
  return 3;
}

interface OrgNodeData {
  id: string;
  name: string;
  role: string;
  dept: string;
  img: string | null;
  employeeId: string;
  children: OrgNodeData[];
  location?: string | null;
  workEmail?: string | null;
  personalPhone?: string | null;
  workPhone?: string | null;
  reportCount?: number;
}

function formatLocation(emp: EmployeeListRow): string | null {
  const loc = emp.location?.trim();
  if (loc) return loc;
  const parts = [emp.city, emp.state, emp.country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function buildTree(employees: EmployeeListRow[]): OrgNodeData[] {
  const byId = new Map<string, EmployeeListRow>();
  employees.forEach((e) => byId.set(e.id, e));

  function toNode(emp: EmployeeListRow): OrgNodeData {
    const name =
      formatEmployeeDisplayName(emp.first_name, emp.last_name, emp.nickname) ||
      emp.work_email ||
      "Unknown";
    return {
      id: emp.id,
      name,
      role: emp.job_title || "Employee",
      dept: emp.department || "—",
      img: `/api/employees/${emp.id}/avatar`,
      employeeId: emp.employee_id || "",
      children: [],
      location: formatLocation(emp),
      workEmail: emp.work_email ?? null,
      personalPhone: emp.personal_phone ?? null,
      workPhone: emp.work_phone ?? null,
    };
  }

  const nodeMap = new Map<string, OrgNodeData>();
  employees.forEach((e) => nodeMap.set(e.id, toNode(e)));

  const roots: OrgNodeData[] = [];
  employees.forEach((e) => {
    const node = nodeMap.get(e.id)!;
    const managerId = e.manager_id?.trim() || null;
    if (!managerId || !nodeMap.has(managerId)) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(managerId)!;
      parent.children.push(node);
    }
  });

  function sortByRoleOrder(nodes: OrgNodeData[]) {
    nodes.sort((a, b) => {
      const orderA = getRoleOrder(a.role);
      const orderB = getRoleOrder(b.role);
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => sortByRoleOrder(n.children));
  }
  sortByRoleOrder(roots);

  function assignReportCounts(nodes: OrgNodeData[]) {
    for (const n of nodes) {
      n.reportCount = n.children.length;
      assignReportCounts(n.children);
    }
  }
  assignReportCounts(roots);

  return roots;
}

/** Find path from root(s) down to the node with id = employeeId. Returns first path found. */
function findPathToEmployee(roots: OrgNodeData[], employeeId: string): OrgNodeData[] | null {
  function search(path: OrgNodeData[], node: OrgNodeData): OrgNodeData[] | null {
    const nextPath = [...path, node];
    if (node.id === employeeId) return nextPath;
    for (const child of node.children) {
      const found = search(nextPath, child);
      if (found) return found;
    }
    return null;
  }
  for (const root of roots) {
    const path = search([], root);
    if (path) return path;
  }
  return null;
}

function findNodeInTree(roots: OrgNodeData[], id: string): OrgNodeData | null {
  for (const root of roots) {
    const found = search(root);
    if (found) return found;
  }
  return null;
  function search(node: OrgNodeData): OrgNodeData | null {
    if (node.id === id) return node;
    for (const c of node.children) {
      const x = search(c);
      if (x) return x;
    }
    return null;
  }
}

function ConnectorWithBadge({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center shrink-0 py-0.5">
      <div className="h-3 w-px bg-slate-300" />
      {count > 0 ? (
        <span className="inline-flex h-7 min-w-[1.75rem] px-1 items-center justify-center rounded-full border-2 border-blue-600 bg-white text-blue-700 text-xs font-semibold shadow-sm">
          {count}
        </span>
      ) : null}
      <div className="h-3 w-px bg-slate-300" />
    </div>
  );
}

function OrgAvatar({ data, className }: { data: OrgNodeData; className?: string }) {
  const isCeo = (data.role || "").toLowerCase().includes("ceo");
  return (
    <Avatar className={className ?? "h-14 w-14 border-2 border-slate-100 shadow-sm"}>
      <AvatarImage src={data.img || undefined} alt={data.name} />
      <AvatarFallback className="bg-slate-200 text-slate-600 text-sm">
        {isCeo ? <Building2 className="h-7 w-7 text-slate-500" /> : data.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function CompactOrgCard({
  data,
  onClick,
  isTopLevel,
}: {
  data: OrgNodeData;
  onClick: () => void;
  isTopLevel?: boolean;
}) {
  const hasChildren = (data.reportCount ?? 0) > 0;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Card
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className={`w-64 sm:w-72 p-4 flex flex-col items-center text-center rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-blue-300/80 cursor-pointer transition-all bg-white/95 ${
          isTopLevel ? "border-t-4 border-t-blue-600" : ""
        }`}
      >
        <OrgAvatar data={data} className="h-16 w-16 mb-3 border-2 border-slate-100 shadow-sm" />
        <h3 className="font-bold text-slate-900 leading-tight">{data.name}</h3>
        <p className="text-blue-600 text-sm font-medium mb-2">{data.role}</p>
        {hasChildren && (
          <div className="flex justify-center mb-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
              {data.reportCount}
            </span>
          </div>
        )}
        <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal text-[10px] mt-1">
          {data.dept}
        </Badge>
      </Card>
    </motion.div>
  );
}

function ExpandedOrgCard({ data }: { data: OrgNodeData }) {
  const hasChildren = (data.reportCount ?? 0) > 0;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card
        className={`w-full max-w-md min-w-[280px] sm:min-w-[360px] p-5 flex flex-col rounded-xl border border-slate-200/80 shadow-md bg-white border-t-4 border-t-blue-600`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 text-left">
          <OrgAvatar data={data} className="h-20 w-20 shrink-0 border-2 border-slate-100 shadow-sm mx-auto sm:mx-0" />
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <h3 className="font-bold text-blue-700 text-lg leading-tight">{data.name}</h3>
            <p className="text-slate-500 text-sm font-medium mt-0.5">{data.role}</p>
            {data.location && (
              <p className="text-sm text-blue-600 flex items-center justify-center sm:justify-start gap-1.5 mt-2">
                <MapPin className="h-4 w-4 shrink-0" />
                {data.location}
              </p>
            )}
          </div>
        </div>
        {(data.workEmail || data.workPhone || data.personalPhone) && (
          <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-2 text-sm">
            {data.workEmail && (
              <a
                href={`mailto:${data.workEmail}`}
                className="flex items-center gap-2 text-blue-600 hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate">{data.workEmail}</span>
              </a>
            )}
            {data.personalPhone && (
              <p className="flex items-center gap-2 text-slate-800">
                <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-slate-500 shrink-0 text-xs uppercase tracking-wide">Personal</span>
                {data.personalPhone}
              </p>
            )}
            {data.workPhone && (
              <p className="flex items-center gap-2 text-slate-800">
                <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-slate-500 shrink-0 text-xs uppercase tracking-wide">Work</span>
                {data.workPhone}
              </p>
            )}
          </div>
        )}
        {hasChildren && (
          <div className="flex justify-center mt-4 pt-2 border-t border-slate-100">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-blue-600 bg-white text-blue-700 text-sm font-semibold">
              {data.reportCount}
            </span>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

function DirectReportCard({ data, onClick }: { data: OrgNodeData; onClick: () => void }) {
  const hasChildren = (data.reportCount ?? 0) > 0;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}>
      <Card
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className="w-full p-3 flex flex-row items-center gap-3 rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-blue-300/80 cursor-pointer transition-all bg-white/95 text-left"
      >
        <OrgAvatar data={data} className="h-12 w-12 shrink-0 border border-slate-100" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-blue-700 text-sm leading-tight truncate">{data.name}</h3>
          <p className="text-slate-500 text-xs truncate">{data.role}</p>
        </div>
        {hasChildren && (
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold">
            {data.reportCount}
          </span>
        )}
      </Card>
    </motion.div>
  );
}

export default function OrgChart() {
  const { user } = useAuth();
  const currentEmployeeId = user?.employeeId ?? null;

  const {
    data: employees = [],
    isLoading,
    refetch,
    isFetching,
  } = useQuery<EmployeeListRow[]>({
    queryKey: ["/api/employees", "org-chart"],
    queryFn: async () => {
      const res = await fetch("/api/employees?limit=2000&offset=0&orgChart=1", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load employees");
      const raw = await res.json();
      const list = raw && typeof raw === "object" && Array.isArray(raw.data) ? raw.data : Array.isArray(raw) ? raw : [];
      return list;
    },
  });

  const fullRoots = useMemo(() => buildTree(employees), [employees]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!fullRoots.length) return;
    setSelectedId((prev) => {
      if (prev && findNodeInTree(fullRoots, prev)) return prev;
      const path = currentEmployeeId ? findPathToEmployee(fullRoots, currentEmployeeId) : null;
      return path?.[path.length - 1]?.id ?? fullRoots[0]?.id ?? null;
    });
  }, [fullRoots, currentEmployeeId]);

  const path = selectedId ? findPathToEmployee(fullRoots, selectedId) : null;
  const selected = selectedId ? findNodeInTree(fullRoots, selectedId) : null;

  return (
    <Layout>
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-display font-bold text-slate-900">Organizational Structure</h1>
          <p className="text-slate-500 text-sm">
            Click anyone to see their details and direct reports below. Use the path above to jump to a manager.
          </p>
        </div>
        <div className="flex justify-center sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="bg-card border-border"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[400px] text-slate-500">
          <RefreshCw className="h-8 w-8 animate-spin mr-2" />
          Loading organization…
        </div>
      ) : fullRoots.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500 text-center px-4">
          <p className="font-medium">No employees to display.</p>
          <p className="text-sm mt-1">Add employees or link them with managers to see the org chart.</p>
        </div>
      ) : !path || !selected ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500 text-center px-4">
          <p className="font-medium">Could not resolve org chart.</p>
        </div>
      ) : (
        <div className="overflow-auto pb-20 pt-8 min-h-[600px] flex justify-center bg-gradient-to-b from-slate-50/80 to-slate-100/50 rounded-xl border border-slate-200/60">
          <div className="flex flex-col items-center px-4 sm:px-10 w-full max-w-5xl">
            {path.map((node, idx) => (
              <div key={node.id} className="flex flex-col items-center w-full">
                {idx > 0 && <ConnectorWithBadge count={path[idx - 1].children.length} />}
                {idx === path.length - 1 ? (
                  <ExpandedOrgCard data={node} />
                ) : (
                  <CompactOrgCard data={node} onClick={() => setSelectedId(node.id)} isTopLevel={idx === 0} />
                )}
              </div>
            ))}

            {selected.children.length > 0 && (
              <div className="flex flex-col items-center w-full mt-0">
                <ConnectorWithBadge count={selected.children.length} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-5xl pt-2">
                  {selected.children.map((child) => (
                    <DirectReportCard key={child.id} data={child} onClick={() => setSelectedId(child.id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
