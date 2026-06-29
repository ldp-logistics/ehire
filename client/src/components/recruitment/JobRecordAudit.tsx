import { formatDateTimeDisplay } from "@/lib/dateUtils";

type JobRecordAuditProps = {
  created_at?: string | null;
  updated_at?: string | null;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  displayTz: string;
  dateFormat?: string | null;
  className?: string;
  compact?: boolean;
};

function fmt(when: string | null | undefined, tz: string, df: string | null | undefined) {
  if (!when) return null;
  return formatDateTimeDisplay(when, tz, df ?? null);
}

export function JobRecordAudit({
  created_at,
  updated_at,
  created_by_name,
  updated_by_name,
  displayTz,
  dateFormat,
  className = "",
  compact = false,
}: JobRecordAuditProps) {
  const createdLabel = fmt(created_at, displayTz, dateFormat);
  const updatedLabel = fmt(updated_at, displayTz, dateFormat);
  const showUpdated =
    updatedLabel &&
    updated_at &&
    created_at &&
    new Date(updated_at).getTime() - new Date(created_at).getTime() > 60_000;

  if (!createdLabel && !updatedLabel) return null;

  if (compact) {
    return (
      <div className={`space-y-0.5 text-[10px] leading-snug text-muted-foreground/90 ${className}`}>
        {createdLabel && (
          <p>
            Created {createdLabel}
            {created_by_name ? ` · ${created_by_name}` : ""}
          </p>
        )}
        {showUpdated && (
          <p>
            Updated {updatedLabel}
            {updated_by_name ? ` · ${updated_by_name}` : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-2 text-sm ${className}`}>
      {createdLabel && (
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Created</p>
          <p className="font-medium text-foreground">
            {createdLabel}
            {created_by_name ? ` · ${created_by_name}` : ""}
          </p>
        </div>
      )}
      {showUpdated && (
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Last updated</p>
          <p className="font-medium text-foreground">
            {updatedLabel}
            {updated_by_name ? ` · ${updated_by_name}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
