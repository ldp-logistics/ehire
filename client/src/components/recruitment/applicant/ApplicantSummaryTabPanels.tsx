import { Link } from "wouter";
import { Briefcase, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./EmptyState";
import { ResumeFileCard } from "./ResumeFileCard";
import { ApplicantSectionCard } from "./ApplicantSectionCard";
import { ApplicationAnswers } from "@/components/recruitment/ApplicationAnswers";
import type { FormConfig } from "@/components/ApplicationFormBuilderCore";
import type { ReactNode } from "react";

type ApplicationDetail = {
  id?: string;
  custom_answers?: Record<string, unknown> | null;
  cover_letter?: string | null;
  referral_source?: string | null;
  form_config?: FormConfig | null;
};

export function ApplicantSummaryTabPanels({
  loading,
  candidateProfile,
  candidateId,
  fallbackTitle,
  fallbackCompany,
  fallbackYears,
  resumeHref,
  resumeFileName,
  resumeUpdatedAt,
  hasResume,
  workflowSection,
  applicationDetail,
}: {
  loading: boolean;
  candidateProfile: Record<string, unknown> | null | undefined;
  candidateId: string;
  fallbackTitle?: string | null;
  fallbackCompany?: string | null;
  fallbackYears: number | null;
  resumeHref: string;
  resumeFileName: string;
  resumeUpdatedAt?: string | null;
  hasResume: boolean;
  /** Offer / interview workflow actions — shown only in main column. */
  workflowSection?: ReactNode;
  /** Current job application — shows all form fields the candidate submitted. */
  applicationDetail?: ApplicationDetail | null;
}) {
  const title = (candidateProfile?.current_title as string) || fallbackTitle;
  const company = (candidateProfile?.current_company as string) || fallbackCompany;
  const years = candidateProfile?.experience_years != null ? Number(candidateProfile.experience_years) : fallbackYears;
  const loc =
    candidateProfile &&
    [candidateProfile.city, candidateProfile.state, candidateProfile.country].filter(Boolean).map(String).join(", ");
  const salary =
    candidateProfile?.expected_salary != null && String(candidateProfile.expected_salary).trim() !== ""
      ? `${candidateProfile.salary_currency ? `${String(candidateProfile.salary_currency)} ` : ""}${Number(
          candidateProfile.expected_salary,
        ).toLocaleString()}`
      : null;
  const tags = Array.isArray(candidateProfile?.tags) ? (candidateProfile!.tags as string[]) : [];
  const notes = candidateProfile?.notes != null ? String(candidateProfile.notes) : "";

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  const experienceEmpty = !title && !company && (years == null || Number.isNaN(years));

  return (
    <div className="space-y-0">
      {workflowSection ? (
        <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Next steps</h2>
          <div className="flex flex-wrap gap-2">{workflowSection}</div>
        </section>
      ) : null}

      {/* Experience */}
      <ApplicantSectionCard title="Experience">
        {experienceEmpty ? (
          <EmptyState
            icon={Briefcase}
            title="No experience added yet"
            description="Role and company will appear here when available from the candidate profile or application."
          />
        ) : (
          <>
            <p>
              <span className="font-medium text-gray-900">{title || "Role not specified"}</span>
              {company ? <span className="text-gray-600"> · {company}</span> : null}
            </p>
            {years != null && !Number.isNaN(years) ? <p>{years} years experience</p> : null}
            {loc ? <p>Location: {loc}</p> : null}
            {salary ? <p>Expected salary: {salary}</p> : null}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {tags.slice(0, 12).map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="rounded-md border-0 bg-gray-100 font-normal text-gray-700"
                  >
                    {tag}
                  </Badge>
                ))}
                {tags.length > 12 && (
                  <span className="text-xs text-gray-500">+{tags.length - 12} more</span>
                )}
              </div>
            )}
          </>
        )}
      </ApplicantSectionCard>

      {/* Resume — only in main column */}
      <ApplicantSectionCard title="Resume">
        {hasResume ? (
          <ResumeFileCard fileName={resumeFileName} previewHref={resumeHref} updatedAt={resumeUpdatedAt} />
        ) : (
          <EmptyState
            icon={Sparkles}
            title="No resume on file"
            description="Ask the candidate to upload a CV, or attach one from the full candidate profile."
          />
        )}
      </ApplicantSectionCard>

      {applicationDetail ? (
        <div className="mb-6">
          <p className="mb-3 text-xs text-gray-500">
            Job-specific answers for this role. Contact & background are on the full candidate profile → Overview.
          </p>
          <ApplicationAnswers
            customAnswers={applicationDetail.custom_answers}
            coverLetter={applicationDetail.cover_letter}
            referralSource={applicationDetail.referral_source}
            formConfig={applicationDetail.form_config ?? undefined}
            scope="application"
            expanded
          />
        </div>
      ) : null}

      {/* Feedback */}
      <ApplicantSectionCard
        title="Feedback snapshot"
        action={
          <Button variant="ghost" size="sm" className="h-9 cursor-pointer text-sm text-blue-600 hover:text-blue-700" asChild>
            <Link href={`/recruitment/candidates/${candidateId}`}>Edit on profile</Link>
          </Button>
        }
      >
        {!notes.trim() ? (
          <EmptyState
            icon={MessageSquare}
            title="No feedback available"
            description="Add interviewer notes on the candidate profile or use Comments for this application."
          />
        ) : (
          <p className="whitespace-pre-wrap leading-relaxed">{notes}</p>
        )}
      </ApplicantSectionCard>

      <p className="text-center text-xs text-gray-500">
        <Link
          href={`/recruitment/candidates/${candidateId}`}
          className="cursor-pointer font-medium text-blue-600 transition-colors duration-150 hover:text-blue-700 hover:underline"
        >
          Open full candidate profile
        </Link>
      </p>
    </div>
  );
}
