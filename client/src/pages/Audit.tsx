import { Fragment, useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { canAccessAuditLogs } from "@shared/navModuleCatalog";
import { formatDateTimeDisplay } from "@/lib/dateUtils";

const PAGE_SIZE = 50;

type AuditLogDto = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string;
  performerEmail: string | null;
  details: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type AuditListResponse = {
  total: number;
  limit: number;
  offset: number;
  logs: AuditLogDto[];
};

const emptyFilters = {
  q: "",
  entityType: "",
  action: "",
  performedBy: "",
  from: "",
  to: "",
};

export default function Audit() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const offset = (page - 1) * PAGE_SIZE;

  useEffect(() => {
    if (user && !canAccessAuditLogs(user)) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(offset));
    if (applied.q.trim()) p.set("q", applied.q.trim());
    if (applied.entityType.trim()) p.set("entityType", applied.entityType.trim());
    if (applied.action.trim()) p.set("action", applied.action.trim());
    if (applied.performedBy.trim()) p.set("performedBy", applied.performedBy.trim());
    if (applied.from.trim()) p.set("from", applied.from.trim());
    if (applied.to.trim()) p.set("to", applied.to.trim());
    return p.toString();
  }, [applied, offset]);

  const canViewAudit = canAccessAuditLogs(user);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["/api/audit/logs", query],
    enabled: canViewAudit,
    queryFn: async (): Promise<AuditListResponse> => {
      const r = await fetch(`/api/audit/logs?${query}`, { credentials: "include" });
      if (r.status === 401 || r.status === 403) throw new Error("You do not have access to audit logs.");
      if (!r.ok) throw new Error((await r.text()) || "Failed to load audit logs");
      return r.json();
    },
  });

  if (user && !canViewAudit) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const applyFilters = () => {
    setApplied({ ...draft });
    setPage(1);
  };

  const clearFilters = () => {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
    setPage(1);
  };

  const exportCsv = async () => {
    const p = new URLSearchParams();
    p.set("limit", "10000");
    if (applied.q.trim()) p.set("q", applied.q.trim());
    if (applied.entityType.trim()) p.set("entityType", applied.entityType.trim());
    if (applied.action.trim()) p.set("action", applied.action.trim());
    if (applied.performedBy.trim()) p.set("performedBy", applied.performedBy.trim());
    if (applied.from.trim()) p.set("from", applied.from.trim());
    if (applied.to.trim()) p.set("to", applied.to.trim());
    const r = await fetch(`/api/audit/logs/export?${p}`, { credentials: "include" });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-logs.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTs = (iso: string) => formatDateTimeDisplay(iso, user?.timeZone ?? null, user?.dateFormat ?? null);

  const performerLabel = (log: AuditLogDto) =>
    log.performerEmail ? `${log.performerEmail}` : log.performedBy;

  return (
    <Layout>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Audit Logs</h1>
          <p className="text-slate-500 text-sm">
            Central record of sign-ins, user and employee changes, org settings, and notification configuration (admin only).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="bg-white border-slate-200 text-slate-700" onClick={() => refetch()}>
            Refresh
          </Button>
          <Button variant="outline" className="bg-white border-slate-200 text-slate-700" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      <Card className="border border-slate-200 shadow-sm mb-6">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search text (action, entity, performer, IP, details JSON)…"
                className="pl-9"
                value={draft.q}
                onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              />
            </div>
            <Input
              placeholder="Entity type (e.g. user, employee)"
              value={draft.entityType}
              onChange={(e) => setDraft((d) => ({ ...d, entityType: e.target.value }))}
            />
            <Input
              placeholder="Action (e.g. LOGIN_SUCCESS, USER_UPDATE)"
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value }))}
            />
            <Input
              placeholder="Performed by (user id)"
              value={draft.performedBy}
              onChange={(e) => setDraft((d) => ({ ...d, performedBy: e.target.value }))}
            />
            <Input
              type="datetime-local"
              placeholder="From"
              value={draft.from}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            />
            <Input
              type="datetime-local"
              placeholder="To"
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={applyFilters}>Apply filters</Button>
            <Button variant="outline" onClick={clearFilters}>
              Clear
            </Button>
            {data != null && (
              <span className="text-sm text-slate-500 self-center ml-2">
                {data.total.toLocaleString()} event{data.total === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center py-24 text-slate-500 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          )}
          {isError && (
            <div className="p-8 text-center text-red-600 text-sm">
              {(error as Error)?.message || "Could not load audit logs."}
            </div>
          )}
          {!isLoading && !isError && data && (
            <>
              <div className="w-full overflow-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium">
                    <tr>
                      <th className="px-4 py-3 w-10" />
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Entity</th>
                      <th className="px-4 py-3">Performed by</th>
                      <th className="px-4 py-3">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.logs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                          No events match these filters.
                        </td>
                      </tr>
                    ) : (
                      data.logs.map((log) => {
                        const open = expandedId === log.id;
                        return (
                          <Fragment key={log.id}>
                            <tr className="hover:bg-slate-50 align-top">
                              <td className="px-2 py-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  onClick={() => setExpandedId(open ? null : log.id)}
                                  aria-expanded={open}
                                >
                                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </Button>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                                {formatTs(log.createdAt)}
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="secondary" className="font-normal">
                                  {log.action}
                                </Badge>
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-800">{log.entityType}</div>
                                <div className="font-mono text-xs text-slate-500 truncate max-w-[200px]" title={log.entityId}>
                                  {log.entityId}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-700 text-xs max-w-[220px] break-all">
                                {performerLabel(log)}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                                {log.ipAddress ?? "—"}
                              </td>
                            </tr>
                            {open ? (
                              <tr className="bg-slate-50/80 border-b border-slate-100">
                                <td colSpan={6} className="px-6 pb-4 pl-14 pt-0">
                                  <div className="text-xs text-slate-500 mb-1">Details</div>
                                  <pre className="text-xs font-mono bg-white border border-slate-200 rounded-md p-3 overflow-x-auto max-h-64 overflow-y-auto">
                                    {log.details == null
                                      ? "—"
                                      : typeof log.details === "string"
                                        ? log.details
                                        : JSON.stringify(log.details, null, 2)}
                                  </pre>
                                  {log.userAgent ? (
                                    <p className="mt-2 text-xs text-slate-500 break-all">
                                      <span className="font-medium text-slate-600">User-Agent:</span> {log.userAgent}
                                    </p>
                                  ) : null}
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {data.total > PAGE_SIZE && (
                <div className="flex justify-center py-4 border-t border-slate-100">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            setPage((p) => Math.max(1, p - 1));
                          }}
                          className={page <= 1 ? "pointer-events-none opacity-40" : ""}
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <span className="px-3 text-sm text-slate-600">
                          Page {page} of {totalPages}
                        </span>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            setPage((p) => Math.min(totalPages, p + 1));
                          }}
                          className={page >= totalPages ? "pointer-events-none opacity-40" : ""}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}
