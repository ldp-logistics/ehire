import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ApplicantSectionCard({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "mb-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="space-y-4 text-sm text-gray-600">{children}</div>
    </section>
  );
}
