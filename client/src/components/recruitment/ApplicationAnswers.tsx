import { useState } from "react";
import { ChevronDown, ChevronUp, GraduationCap, AlignLeft, Briefcase } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormConfig } from "@/components/ApplicationFormBuilderCore";
import { buildDisplaySections, type ApplicationDisplayScope, type DisplayRow } from "@/lib/applicationFormDisplay";

interface Props {
  /** Candidate record — required for scope="full". */
  candidate?: Record<string, unknown> | null;
  customAnswers?: Record<string, unknown> | null;
  coverLetter?: string | null;
  referralSource?: string | null;
  formConfig?: FormConfig | null;
  /** full = everything; application = job-specific answers only (no profile duplicate). */
  scope?: ApplicationDisplayScope;
  /** When true, starts expanded (default: collapsed). */
  defaultOpen?: boolean;
  /** When true, render as open cards (Profile / Summary tabs). */
  expanded?: boolean;
  /** When true with expanded, skip outer Card wrapper (e.g. nested in another card). */
  embedded?: boolean;
  resumeHref?: string;
}

function DisplayRows({ rows }: { rows: DisplayRow[] }) {
  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={`${row.label}-${row.value.slice(0, 24)}`} className="flex gap-2 text-sm">
          <span className="text-muted-foreground min-w-[140px] shrink-0 capitalize">{row.label}:</span>
          {row.href ? (
            <a
              href={row.href}
              target={row.href.startsWith("mailto:") ? undefined : "_blank"}
              rel={row.href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
              className="font-medium text-primary hover:underline break-all"
            >
              {row.value}
            </a>
          ) : row.multiline ? (
            <p className="font-medium whitespace-pre-wrap leading-relaxed flex-1">{row.value}</p>
          ) : (
            <span className="font-medium break-words">{row.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function SectionBlock({
  title,
  templateKey,
  repeatable,
  rows,
  entries,
}: {
  title: string;
  templateKey?: string;
  repeatable?: boolean;
  rows: DisplayRow[];
  entries?: DisplayRow[][];
}) {
  const icon =
    templateKey === "education" ? (
      <GraduationCap className="h-3 w-3" />
    ) : templateKey === "employment_history" ? (
      <Briefcase className="h-3 w-3" />
    ) : title.toLowerCase().includes("cover") ? (
      <AlignLeft className="h-3 w-3" />
    ) : null;

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
        {icon}
        {title}
      </p>
      {repeatable && entries ? (
        <div className="space-y-3">
          {entries.map((entry, idx) => (
            <div key={idx} className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <DisplayRows rows={entry} />
            </div>
          ))}
        </div>
      ) : (
        <DisplayRows rows={rows} />
      )}
    </div>
  );
}

/** Renders all application form responses using form_config labels and candidate + custom_answers data. */
export function ApplicationAnswers({
  candidate,
  customAnswers,
  coverLetter,
  referralSource,
  formConfig,
  scope = "full",
  defaultOpen = false,
  expanded = false,
  embedded = false,
  resumeHref,
}: Props) {
  const [open, setOpen] = useState(defaultOpen || expanded);

  const sections = buildDisplaySections(
    formConfig,
    candidate,
    { customAnswers, coverLetter, referralSource },
    resumeHref,
    scope,
  );

  if (sections.length === 0) {
    if (scope === "application") {
      return (
        <p className="mt-3 pt-3 border-t border-border/40 text-sm text-muted-foreground">
          No job-specific questions were answered for this application.
        </p>
      );
    }
    return null;
  }

  const panelTitle =
    scope === "application" ? "Job-specific responses" : "Application form responses";
  const collapsibleLabel =
    scope === "application" ? "Job-specific responses" : "Application details";

  const body = (
    <div className="space-y-4">
      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          title={section.title}
          templateKey={section.templateKey}
          repeatable={section.repeatable}
          rows={section.rows}
          entries={section.entries}
        />
      ))}
    </div>
  );

  if (expanded) {
    if (embedded) {
      return <div className="mt-3 pt-3 border-t border-border/40">{body}</div>;
    }
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">{panelTitle}</CardTitle>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-3 border-t border-border/40 pt-3">
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left">
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          <span className="font-medium">{collapsibleLabel}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">{body}</CollapsibleContent>
    </Collapsible>
  );
}
