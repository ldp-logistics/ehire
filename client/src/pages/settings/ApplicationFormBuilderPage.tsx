import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import {
  ApplicationFormBuilderCore,
  DEFAULT_FORM_CONFIG,
  type FormConfig,
} from "@/components/ApplicationFormBuilderCore";

// Re-export types so existing imports from this file keep working
export type { FieldType, FormField, FormSection, FormConfig } from "@/components/ApplicationFormBuilderCore";

export default function ApplicationFormBuilderPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<FormConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncingJobs, setSyncingJobs] = useState(false);

  const { isLoading, data: fetchedConfig } = useQuery<FormConfig>({
    queryKey: ["/api/recruitment/application-form"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/recruitment/application-form");
      return res.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (fetchedConfig) {
      setConfig(fetchedConfig.sections?.length ? fetchedConfig : DEFAULT_FORM_CONFIG);
    }
  }, [fetchedConfig]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/recruitment/application-form", { config });
      queryClient.invalidateQueries({ queryKey: ["/api/recruitment/application-form"] });
      toast.success("Default application form saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirm("Reset to default form? This cannot be undone.")) return;
    setConfig(DEFAULT_FORM_CONFIG);
    toast.info("Reset to default — click Save to apply");
  };

  /** Pushes the **saved** server default into job_postings.form_config for every job (same DB as the app). */
  const handleSyncDefaultToAllJobs = async () => {
    if (
      !confirm(
        "Copy the saved default form to every job posting? Any per-job application form will be overwritten. Click \"Save form\" first if you still have unsaved changes here.",
      )
    ) {
      return;
    }
    setSyncingJobs(true);
    try {
      const res = await apiRequest("POST", "/api/recruitment/application-form/sync-to-all-jobs");
      const data = (await res.json()) as { updated?: number; message?: string };
      await queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey[0];
          return (
            k === "/api/recruitment/application-form" ||
            (typeof k === "string" && k.includes("/application-form"))
          );
        },
      });
      toast.success(data.message ?? "Done", { description: `${data.updated ?? 0} job(s) updated` });
    } catch (e: any) {
      toast.error(e?.message || "Failed to sync jobs");
    } finally {
      setSyncingJobs(false);
    }
  };

  if (isLoading || !config) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading form config…</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex h-full flex-col">

        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-border bg-background px-6 py-4">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => setLocation("/settings")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <p className="text-xs text-muted-foreground">Settings / Recruitment</p>
                <h1 className="text-lg font-semibold">Default Application Form</h1>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={syncingJobs}
              onClick={handleSyncDefaultToAllJobs}
            >
              {syncingJobs ? "Syncing…" : "Apply default to all jobs"}
            </Button>
          </div>
        </div>

        {/* Body */}
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-5xl px-6 py-8">
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
              This is the <strong>default</strong> form used when a job doesn't have its own custom application form.
              You can also customise the form per-job from the job's edit page.
            </div>
            <ApplicationFormBuilderCore
              config={config}
              onChange={setConfig}
              saving={saving}
              onSave={handleSave}
              onReset={handleReset}
            />
          </div>
        </ScrollArea>

      </div>
    </Layout>
  );
}
