/**
 * Public asset view — shown when scanning a QR code. No auth required.
 * Fetches asset by human-readable asset_id (e.g. STOCK-00001, AST-2026-00001) and shows details + assignment.
 */
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Package, User, HardDrive, Cpu, MemoryStick, AlertCircle } from "lucide-react";

type AssetResponse =
  | {
      type: "stock";
      assetId: string;
      name: string;
      category: string;
      assetType?: string;
      quantity: number;
      available: number;
      description: string | null;
      specs: Record<string, unknown> | null;
      assignedTo: null;
      status: string;
    }
  | {
      type: "assigned";
      assetId: string;
      name: string;
      category: string;
      assetType?: string;
      specs: Record<string, unknown>;
      assignedTo: { name: string; email: string | null; department: string | null; location: string | null };
      notes: string | null;
      status: string;
    };

export default function AssetViewPublic() {
  const [, params] = useRoute("/assets/view/:assetId");
  const assetId = params?.assetId ?? "";

  const { data, isLoading, error } = useQuery<AssetResponse>({
    queryKey: ["/api/assets/public/view", assetId],
    queryFn: async () => {
      const res = await fetch(`/api/assets/public/view/${encodeURIComponent(assetId)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to load asset`);
      }
      return res.json();
    },
    enabled: !!assetId,
  });

  if (!assetId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center text-slate-600">
          <AlertCircle className="h-12 w-12 mx-auto mb-3 text-slate-400" />
          <p>Invalid asset link.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="animate-pulse text-slate-500">Loading…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center text-slate-600 max-w-sm">
          <AlertCircle className="h-12 w-12 mx-auto mb-3 text-slate-400" />
          <p className="font-medium">Asset not found</p>
          <p className="text-sm mt-1">{(error as Error)?.message || "This asset may have been removed."}</p>
        </div>
      </div>
    );
  }

  const isStock = data.type === "stock";
  const assetTypeLabel = data.assetType ?? (data.category === "Systems" ? "Laptop" : data.category);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-md mx-auto p-6 pb-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-800 text-white px-6 py-4">
            <p className="text-slate-300 text-xs font-medium uppercase tracking-wider">Asset ID</p>
            <p className="text-lg font-mono font-semibold">{data.assetId}</p>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <p className="text-slate-500 text-sm">Name</p>
              <p className="text-lg font-semibold">{data.name}</p>
            </div>
            <div>
              <p className="text-slate-500 text-sm">Type</p>
              <p className="font-medium text-slate-800">{assetTypeLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {data.category}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  data.status === "Assigned"
                    ? "bg-emerald-100 text-emerald-800"
                    : data.status === "In stock"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-amber-100 text-amber-800"
                }`}
              >
                {data.status}
              </span>
            </div>

            {isStock && (
              <div className="flex gap-4 text-sm">
                <span className="text-slate-500">Total: <strong className="text-slate-700">{data.quantity}</strong></span>
                <span className="text-slate-500">Available: <strong className="text-slate-700">{data.available}</strong></span>
              </div>
            )}

            {data.type === "assigned" && data.assignedTo && (
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-2">Assigned to</p>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 rounded-full bg-slate-200 items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-slate-600" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-semibold">{data.assignedTo.name}</p>
                    {data.assignedTo.email && (
                      <p className="text-sm text-slate-500">{data.assignedTo.email}</p>
                    )}
                    <div className="text-sm text-slate-500 pt-1 space-y-0.5">
                      <p><span className="text-slate-400">Department:</span> {data.assignedTo.department ?? "—"}</p>
                      <p><span className="text-slate-400">Location:</span> {data.assignedTo.location ?? "—"}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {data.specs && Object.keys(data.specs).length > 0 && (
              <div className="space-y-2">
                <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Specs</p>
                <ul className="space-y-1.5 text-sm">
                  {Object.entries(data.specs).map(([k, v]) =>
                    v != null && v !== "" ? (
                      <li key={k} className="flex items-center gap-2 text-slate-700">
                        {(k === "ram" || k === "memory" ? (
                          <MemoryStick className="h-4 w-4 text-slate-400" />
                        ) : k === "storage" ? (
                          <HardDrive className="h-4 w-4 text-slate-400" />
                        ) : k === "processor" || k === "cpu" ? (
                          <Cpu className="h-4 w-4 text-slate-400" />
                        ) : (
                          <Package className="h-4 w-4 text-slate-400" />
                        ))}
                        <span className="capitalize">{k.replace(/_/g, " ")}:</span>
                        <span className="font-medium">{String(v)}</span>
                      </li>
                    ) : null
                  )}
                </ul>
              </div>
            )}

            {data.type === "assigned" && data.notes && (
              <div>
                <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-slate-700">{data.notes}</p>
              </div>
            )}

            {isStock && data.description && (
              <div>
                <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">Description</p>
                <p className="text-sm text-slate-700">{data.description}</p>
              </div>
            )}
          </div>
        </div>
        <p className="text-center text-slate-400 text-xs mt-6">Scanned from asset QR code</p>
      </div>
    </div>
  );
}
