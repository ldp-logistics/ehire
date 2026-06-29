import type { ReactNode } from "react";
import Layout from "@/components/layout/Layout";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsSubpageLayout({
  title,
  description,
  children,
  maxWidthClass = "max-w-3xl",
}: {
  title: string;
  description?: ReactNode;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <Layout>
      <div className={cn("mx-auto space-y-6 pb-12", maxWidthClass)}>
        <div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline mb-4"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Settings
          </Link>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-slate-100">{title}</h1>
          {description ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 space-y-1">{description}</div>
          ) : null}
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card shadow-sm p-6 md:p-8">
          {children}
        </div>
      </div>
    </Layout>
  );
}
