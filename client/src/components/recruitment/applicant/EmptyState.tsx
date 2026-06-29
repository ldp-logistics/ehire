import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Minimal empty state: no dashed borders or heavy boxes. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-10 text-center", className)}>
      <Icon className="mb-3 h-8 w-8 text-gray-300" strokeWidth={1.5} />
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs leading-relaxed text-gray-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
