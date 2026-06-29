import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Mail, Phone, Linkedin, Calendar, ArrowLeft, FileText, Briefcase,
  Clock, CalendarClock, MapPin, User, DollarSign, Star, BookOpen, GraduationCap,
  CheckCircle, PenLine, Send, Download,
} from "lucide-react";
import type { FormConfig, FormSection } from "@/components/ApplicationFormBuilderCore";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useState } from "react";
import { InterviewsTab } from "@/components/recruitment/InterviewsTab";
import { ApplicationAnswers } from "@/components/recruitment/ApplicationAnswers";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTimeDisplay, formatLeaveDisplayDate } from "@/lib/dateUtils";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";

const STAGE_COLORS: Record<string, string> = {
  applied: "bg-blue-100 text-blue-700",
  longlisted: "bg-indigo-100 text-indigo-700",
  screening: "bg-purple-100 text-purple-700",
  shortlisted: "bg-cyan-100 text-cyan-700",
  assessment: "bg-amber-100 text-amber-700",
  interview: "bg-orange-100 text-orange-700",
  offer: "bg-emerald-100 text-emerald-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function formatDate(d: string | null | undefined, tz?: string | null, df?: string | null) {
  if (!d) return null;
  return formatLeaveDisplayDate(d, tz ?? null, df ?? null);
}

function safeNum(v: unknown): number | null {
  if (v == null || v === "" || v === "null") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function safeStr(v: unknown): string | null {
  if (v == null || v === "" || v === "null") return null;
  return String(v);
}

type StageHistRow = {
  id: string;
  to_stage: string;
  scheduled_at?: string | null;
  interview_round?: number | null;
  schedule_format?: string | null;
  interview_type?: string | null;
  interviewer_names?: string | null;
  meeting_link?: string | null;
};

type Application = {
  id: string;
  job_title: string;
  job_department?: string;
  job_location?: string | null;
  stage: string;
  applied_at: string;
  stage_updated_at?: string | null;
  reject_reason?: string | null;
  cover_letter?: string | null;
  custom_answers?: Record<string, unknown> | null;
  form_config?: FormConfig | null;
  referral_source?: string | null;
  candidate_email?: string | null;
};

// ── Info row helper ────────────────────────────────────────────────────────────
function InfoRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
      {icon && <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>}
      <div className={`flex flex-1 justify-between gap-4 ${!icon ? "" : ""}`}>
        <span className="text-muted-foreground text-sm shrink-0">{label}</span>
        <span className="text-sm font-medium text-right">{value}</span>
      </div>
    </div>
  );
}

// ── Repeatable section renderer (Employment / Education) ──────────────────────
/** Renders each entry using `section.fields` ids (same as career form / ApplicationAnswers). Never hardcode tpl_* ids — jobs may use generated field ids. */
function RepeatableSectionBlock({
  section,
  entries,
  tz,
  df,
}: {
  section: FormSection;
  entries: Record<string, unknown>[];
  tz?: string | null;
  df?: string | null;
}) {
  if (!entries || entries.length === 0) return null;
  const isEdu = section.templateKey === "education";
  return (
    <div>
      <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
        {isEdu ? <GraduationCap className="h-4 w-4 text-muted-foreground" /> : <Briefcase className="h-4 w-4 text-muted-foreground" />}
        {section.title}
      </h4>
      <div className="space-y-3">
        {entries.map((entry, idx) => (
          <div key={idx} className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1.5">
            {section.fields.map((field) => {
              const raw = entry[field.id];
              if (raw === undefined || raw === null || raw === "" || raw === false) return null;
              const display =
                field.type === "checkbox"
                  ? (raw ? "Yes" : null)
                  : field.type === "date" && typeof raw === "string"
                  ? formatLeaveDisplayDate(raw, tz ?? null, df ?? null)
                  : String(raw);
              if (!display) return null;
              return (
                <div key={field.id} className="flex gap-2 text-sm">
                  <span className="text-muted-foreground min-w-[120px] sm:min-w-[160px] shrink-0">{field.label}:</span>
                  <span className="font-medium break-words">{display}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Overview tab: candidate profile (identity, contact, background) ──
function OverviewTab({ candidate, applications, candidateId, tz, df }: {
  candidate: Record<string, unknown>;
  applications: Application[];
  candidateId: string;
  tz?: string | null;
  df?: string | null;
}) {
  const allEmploymentEntries: Record<string, unknown>[] = [];
  const allEducationEntries: Record<string, unknown>[] = [];

  let empSection: FormSection | null = null;
  let eduSection: FormSection | null = null;

  for (const app of applications) {
    const fc = app.form_config;
    const ca = app.custom_answers;
    if (!fc || !ca) continue;
    for (const section of fc.sections) {
      if (!section.repeatable) continue;
      const entries = (ca[section.id] as Record<string, unknown>[] | undefined) ?? [];
      if (section.templateKey === "employment_history") {
        if (entries.length > 0) {
          allEmploymentEntries.push(...entries);
          empSection ??= section;
        }
      } else if (section.templateKey === "education") {
        if (entries.length > 0) {
          allEducationEntries.push(...entries);
          eduSection ??= section;
        }
      }
    }
  }
  if (!empSection && allEmploymentEntries.length > 0) {
    empSection = {
      id: "emp", title: "Employment History", system: false, repeatable: true, templateKey: "employment_history",
      fields: [
        { id: "tpl_emp_designation", type: "text", label: "Designation", required: false, system: false },
        { id: "tpl_emp_company", type: "text", label: "Company / Business Name", required: false, system: false },
        { id: "tpl_emp_from", type: "date", label: "From", required: false, system: false },
        { id: "tpl_emp_to", type: "date", label: "To", required: false, system: false },
        { id: "tpl_emp_current", type: "checkbox", label: "Currently works here", required: false, system: false },
        { id: "tpl_emp_summary", type: "textarea", label: "Summary", required: false, system: false },
      ],
    };
  }
  if (!eduSection && allEducationEntries.length > 0) {
    eduSection = {
      id: "edu", title: "Education", system: false, repeatable: true, templateKey: "education",
      fields: [
        { id: "tpl_edu_degree", type: "text", label: "Degree", required: false, system: false },
        { id: "tpl_edu_institution", type: "text", label: "Institution / School Name", required: false, system: false },
        { id: "tpl_edu_field", type: "text", label: "Field of Study / Major", required: false, system: false },
        { id: "tpl_edu_grade", type: "text", label: "Grade", required: false, system: false },
        { id: "tpl_edu_from", type: "date", label: "From", required: false, system: false },
        { id: "tpl_edu_end", type: "date", label: "End", required: false, system: false },
        { id: "tpl_edu_current", type: "checkbox", label: "Currently pursuing", required: false, system: false },
      ],
    };
  }

  const expYears = safeNum(candidate.experience_years);
  const expectedSalary = safeNum(candidate.expected_salary);
  const currentSalary = safeNum(candidate.current_salary);
  const currency = safeStr(candidate.salary_currency) ?? "";

  const hasPersonalSection =
    safeStr(candidate.current_title) || safeStr(candidate.current_company) || expYears !== null ||
    safeStr(candidate.linkedin_url) || safeStr(candidate.gender) || safeStr(candidate.marital_status) ||
    safeStr(candidate.blood_group) || safeStr(candidate.date_of_birth);

  const hasContactSection =
    safeStr(candidate.email) || safeStr(candidate.phone) || safeStr(candidate.personal_email) ||
    safeStr(candidate.street) || safeStr(candidate.city) || safeStr(candidate.state) ||
    safeStr(candidate.country) || safeStr(candidate.zip_code);

  const hasSalarySection = expectedSalary !== null || currentSalary !== null;
  const hasResume = !!(candidate.resume_url || candidate.has_resume);
  const resumeHref =
    (candidate.resume_url as string | undefined) || `/api/recruitment/candidates/${candidateId}/resume`;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
        Candidate profile — contact details, background, employment & education. Job-specific answers (e.g. night shift, notice period) are on the <strong>Applications</strong> tab per role.
      </p>

      {hasResume && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" /> Resume
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <a
              href={resumeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <FileText className="h-4 w-4" />
              {(candidate.resume_filename as string) || "View CV"}
            </a>
          </CardContent>
        </Card>
      )}

      {/* Personal / Professional */}
      {hasPersonalSection && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" /> Professional Info
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {safeStr(candidate.current_title) && (
              <InfoRow label="Current title" value={
                safeStr(candidate.current_company)
                  ? `${candidate.current_title} at ${candidate.current_company}`
                  : safeStr(candidate.current_title)!
              } />
            )}
            {!safeStr(candidate.current_title) && safeStr(candidate.current_company) && (
              <InfoRow label="Company" value={safeStr(candidate.current_company)!} />
            )}
            {expYears !== null && (
              <InfoRow label="Experience" value={`${expYears} ${expYears === 1 ? "year" : "years"}`} />
            )}
            {safeStr(candidate.linkedin_url) && (
              <InfoRow label="LinkedIn" value={
                <a href={String(candidate.linkedin_url)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View profile</a>
              } />
            )}
            {safeStr(candidate.date_of_birth) && (
              <InfoRow label="Date of birth" value={formatDate(String(candidate.date_of_birth), tz, df)} />
            )}
            {safeStr(candidate.gender) && (
              <InfoRow label="Gender" value={<span className="capitalize">{safeStr(candidate.gender)}</span>} />
            )}
            {safeStr(candidate.marital_status) && (
              <InfoRow label="Marital status" value={<span className="capitalize">{safeStr(candidate.marital_status)}</span>} />
            )}
            {safeStr(candidate.blood_group) && (
              <InfoRow label="Blood group" value={safeStr(candidate.blood_group)} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Contact & Address */}
      {hasContactSection && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" /> Contact & Address
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <InfoRow label="Email" value={
              <a href={`mailto:${candidate.email}`} className="text-primary hover:underline">{String(candidate.email)}</a>
            } />
            {safeStr(candidate.personal_email) && (
              <InfoRow label="Personal email" value={
                <a href={`mailto:${candidate.personal_email}`} className="text-primary hover:underline">{safeStr(candidate.personal_email)}</a>
              } />
            )}
            {safeStr(candidate.phone) && (
              <InfoRow label="Phone" value={safeStr(candidate.phone)} />
            )}
            {safeStr(candidate.street) && (
              <InfoRow label="Street" value={safeStr(candidate.street)} />
            )}
            {(safeStr(candidate.city) || safeStr(candidate.state) || safeStr(candidate.country)) && (
              <InfoRow label="City / State / Country" value={
                [candidate.city, candidate.state, candidate.country].filter(Boolean).map(String).join(", ")
              } />
            )}
            {safeStr(candidate.zip_code) && (
              <InfoRow label="Zip code" value={safeStr(candidate.zip_code)} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Salary */}
      {hasSalarySection && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" /> Salary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {currentSalary !== null && (
              <InfoRow label="Current salary" value={`${currency} ${currentSalary.toLocaleString()}`} />
            )}
            {expectedSalary !== null && (
              <InfoRow label="Expected salary" value={`${currency} ${expectedSalary.toLocaleString()}`} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Employment History */}
      {empSection && allEmploymentEntries.length > 0 && (
        <Card>
          <CardContent className="pt-5 pb-5">
            <RepeatableSectionBlock section={empSection} entries={allEmploymentEntries} tz={tz} df={df} />
          </CardContent>
        </Card>
      )}

      {/* Education */}
      {eduSection && allEducationEntries.length > 0 && (
        <Card>
          <CardContent className="pt-5 pb-5">
            <RepeatableSectionBlock section={eduSection} entries={allEducationEntries} tz={tz} df={df} />
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {safeStr(candidate.notes as unknown) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" /> Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{String(candidate.notes)}</p>
          </CardContent>
        </Card>
      )}

      {allEmploymentEntries.length === 0 && allEducationEntries.length === 0 && !hasPersonalSection && !hasContactSection && !hasSalarySection && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No additional profile information available.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Offer Status helpers ───────────────────────────────────────────────────────
const OFFER_STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-orange-100 text-orange-700",
};

const OFFER_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Offer Sent",
  accepted: "Offer Accepted",
  rejected: "Offer Declined",
  withdrawn: "Withdrawn",
};

const ESIGN_LABELS: Record<string, string> = {
  pending: "Pending e-sign",
  signed: "E-Signed",
  declined: "Declined",
};

type ApplicationWithOffer = Application & {
  offer_id?: string | null;
  offer_status?: string | null;
  offer_approval_status?: string | null;
  offer_salary?: number | null;
  offer_salary_currency?: string | null;
  offer_job_title?: string | null;
  offer_department?: string | null;
  offer_start_date?: string | null;
  offer_employment_type?: string | null;
  offer_terms?: string | null;
  offer_merged_document_url?: string | null;
  offer_letter_url?: string | null;
  offer_letter_filename?: string | null;
  esign_status?: string | null;
  esign_signed_at?: string | null;
  offer_is_signed?: boolean;
  offer_responded_at?: string | null;
  offer_sent_at?: string | null;
};

// ── Offer Tab Component ───────────────────────────────────────────────────────
function OfferTab({
  applications,
  tz,
  df,
}: {
  applications: ApplicationWithOffer[];
  tz?: string | null;
  df?: string | null;
}) {
  const offerApps = applications.filter((a) => a.offer_id);

  if (offerApps.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No offer yet</p>
          <p className="text-sm mt-1">An offer will appear here once it has been created for this candidate.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {offerApps.map((app) => (
        <div key={app.offer_id} className="space-y-4">
          {/* Job header */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5" />
            <span>{app.offer_job_title || app.job_title}</span>
            {app.job_department && <><span>·</span><span>{app.job_department}</span></>}
          </div>

          {/* Offer Details card */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Status</p>
                  <Badge
                    className={`text-sm font-medium px-3 py-1 ${OFFER_STATUS_STYLES[app.offer_status ?? ""] ?? "bg-slate-100 text-slate-700"}`}
                  >
                    {OFFER_STATUS_LABELS[app.offer_status ?? ""] ?? app.offer_status}
                  </Badge>
                </div>
                <FileText className="h-8 w-8 text-muted-foreground/30" />
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {app.offer_responded_at && (
                  <div>
                    <p className="text-muted-foreground text-xs">Accepted On</p>
                    <p className="font-semibold mt-0.5">
                      {formatDateTimeDisplay(app.offer_responded_at, tz, df)}
                    </p>
                  </div>
                )}
                {app.offer_sent_at && !app.offer_responded_at && (
                  <div>
                    <p className="text-muted-foreground text-xs">Sent On</p>
                    <p className="font-semibold mt-0.5">
                      {formatDateTimeDisplay(app.offer_sent_at, tz, df)}
                    </p>
                  </div>
                )}
                {app.offer_start_date && (
                  <div>
                    <p className="text-muted-foreground text-xs">Joining Date</p>
                    <p className="font-semibold mt-0.5">
                      {formatDate(app.offer_start_date, tz, df)}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Signers card — only if e-sign is involved */}
          {(app.esign_status || app.offer_merged_document_url) && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <PenLine className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold text-sm">Signers</span>
                    {app.esign_status && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${app.esign_status === "signed" ? "border-emerald-300 text-emerald-700" : "border-amber-300 text-amber-700"}`}
                      >
                        {app.esign_status === "signed" ? (
                          <><CheckCircle className="h-3 w-3 mr-1 inline" />Signed (E-Signed)</>
                        ) : (
                          <><Clock className="h-3 w-3 mr-1 inline" />{ESIGN_LABELS[app.esign_status] ?? app.esign_status}</>
                        )}
                      </Badge>
                    )}
                  </div>
                  <PenLine className="h-6 w-6 text-muted-foreground/25" />
                </div>

                {app.esign_status === "signed" && app.esign_signed_at && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{app.offer_job_title || "Candidate"}</p>
                      <p className="text-xs text-muted-foreground">{app.candidate_email || app.job_location}</p>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">
                      Signed on{" "}
                      {formatDateTimeDisplay(app.esign_signed_at, tz, df)}
                    </p>
                  </div>
                )}

                {/* Download signed PDF */}
                {app.offer_is_signed && app.offer_id && (
                  <div className="mt-3">
                    <a
                      href={`/api/recruitment/offers/${app.offer_id}/signed-pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download signed offer letter
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Compensation */}
          {(app.offer_salary != null) && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Compensation Information</h3>
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Salary</p>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Annual salary</p>
                      <p className="font-semibold mt-0.5">{Number(app.offer_salary).toLocaleString()}</p>
                    </div>
                    {app.offer_start_date && (
                      <div>
                        <p className="text-muted-foreground text-xs">Start Date</p>
                        <p className="font-semibold mt-0.5">
                          {formatDate(app.offer_start_date, tz, df)}
                        </p>
                      </div>
                    )}
                    {app.offer_salary_currency && (
                      <div>
                        <p className="text-muted-foreground text-xs">Pay Rate</p>
                        <p className="font-semibold mt-0.5">
                          {app.offer_salary_currency} {Math.round(Number(app.offer_salary) / 12).toLocaleString()} Monthly
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Employment Details */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Employment Details</h3>
            <Card>
              <CardContent className="p-5">
                <div className="grid grid-cols-3 gap-x-6 gap-y-4 text-sm">
                  {(app.offer_job_title || app.job_title) && (
                    <div>
                      <p className="text-muted-foreground text-xs">Job title</p>
                      <p className="font-semibold mt-0.5">{app.offer_job_title || app.job_title}</p>
                    </div>
                  )}
                  {(app.offer_department || app.job_department) && (
                    <div>
                      <p className="text-muted-foreground text-xs">Department</p>
                      <p className="font-semibold mt-0.5">{app.offer_department || app.job_department}</p>
                    </div>
                  )}
                  {app.job_location && (
                    <div>
                      <p className="text-muted-foreground text-xs">Job location</p>
                      <p className="font-semibold mt-0.5">{app.job_location}</p>
                    </div>
                  )}
                  {app.offer_employment_type && (
                    <div>
                      <p className="text-muted-foreground text-xs">Employment Type</p>
                      <p className="font-semibold mt-0.5 capitalize">{app.offer_employment_type.replace(/_/g, " ")}</p>
                    </div>
                  )}
                  {app.offer_start_date && (
                    <div>
                      <p className="text-muted-foreground text-xs">Joining date</p>
                      <p className="font-semibold mt-0.5">
                        {formatDate(app.offer_start_date, tz, df)}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Offer Information */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Offer Information</h3>
            <Card>
              <CardContent className="p-5">
                <div className="grid grid-cols-2 gap-6">
                  {/* Offer letter file */}
                  {(app.offer_merged_document_url || app.offer_letter_url) && (
                    <div>
                      {app.offer_is_signed && app.offer_id ? (
                        <a
                          href={`/api/recruitment/offers/${app.offer_id}/signed-pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 p-2.5 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors group"
                        >
                          <div className="h-9 w-9 rounded bg-red-100 flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5 text-red-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                              {app.offer_letter_filename ?? "Signed_Offer_Letter.pdf"}
                            </p>
                            {app.esign_signed_at && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDateTimeDisplay(app.esign_signed_at, tz, df)}
                              </p>
                            )}
                          </div>
                        </a>
                      ) : (
                        <div className="flex items-center gap-2.5 p-2.5 rounded-md border bg-muted/20">
                          <div className="h-9 w-9 rounded bg-blue-100 flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{app.offer_letter_filename ?? "Offer Letter"}</p>
                            <p className="text-xs text-muted-foreground">
                              {app.esign_status === "pending" ? "Awaiting signature" : "Offer document"}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Offer valid till */}
                  {app.offer_terms && (
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">Terms</p>
                      <p className="text-sm text-foreground/80 line-clamp-3">{app.offer_terms}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CandidateProfile() {
  const { user } = useAuth();
  const { setBreadcrumbLabel } = useBreadcrumb();
  const [, params] = useRoute("/recruitment/candidates/:id");
  const [, setLocation] = useLocation();
  const candidateId = params?.id;

  const { data: candidate, isLoading } = useQuery({
    queryKey: ["/api/recruitment/candidates", candidateId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/recruitment/candidates/${candidateId}`);
      return res.json();
    },
    enabled: !!candidateId,
  });

  const applications: Application[] = ((candidate as { applications?: unknown[] } | undefined)?.applications ?? []) as Application[];

  useEffect(() => {
    const first = safeStr((candidate as Record<string, unknown> | undefined)?.first_name);
    const last = safeStr((candidate as Record<string, unknown> | undefined)?.last_name);
    const fullName = [first, last].filter(Boolean).join(" ").trim();
    if (fullName) {
      setBreadcrumbLabel(`Talent Pool / ${fullName}`);
    } else if (candidateId) {
      setBreadcrumbLabel(`Talent Pool / ${candidateId}`);
    } else {
      setBreadcrumbLabel("Talent Pool");
    }
    return () => setBreadcrumbLabel(null);
  }, [candidate, candidateId, setBreadcrumbLabel]);

  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/employees");
      const json = await res.json();
      if (Array.isArray(json)) return json;
      return Array.isArray(json?.data) ? json.data : [];
    },
    enabled: !!candidateId,
  });

  if (isLoading || !candidate) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">Loading…</div>
      </Layout>
    );
  }

  const expYears = safeNum(candidate.experience_years);
  const expectedSalary = safeNum(candidate.expected_salary);
  const currency = safeStr(candidate.salary_currency) ?? "";
  const tz = user?.timeZone ?? null;
  const df = user?.dateFormat ?? null;

  return (
    <Layout>
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2 mb-4" onClick={() => setLocation("/recruitment/talent-pool")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Recruitment
        </Button>

        {/* ── Header card ─────────────────────────────────────────────── */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Avatar + name */}
            <Avatar className="h-20 w-20 border-4 border-muted shadow-sm shrink-0">
              <AvatarFallback className="text-2xl bg-primary/10 text-primary font-bold">
                {safeStr(candidate.first_name)?.[0]}{safeStr(candidate.last_name)?.[0]}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    {candidate.first_name} {safeStr(candidate.middle_name) ? `${candidate.middle_name} ` : ""}{candidate.last_name}
                  </h1>
                  {safeStr(candidate.current_title) && (
                    <p className="text-base text-muted-foreground mt-0.5">
                      {candidate.current_title}
                      {safeStr(candidate.current_company) && ` · ${candidate.current_company}`}
                    </p>
                  )}
                </div>
                {safeStr(candidate.source) && (
                  <Badge variant="secondary" className="capitalize shrink-0">
                    {String(candidate.source).replace(/_/g, " ")}
                  </Badge>
                )}
              </div>

              {/* Contact links */}
              <div className="flex flex-wrap gap-3 mt-3 text-sm text-muted-foreground">
                <a href={`mailto:${candidate.email}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                  <Mail className="h-3.5 w-3.5" /> {String(candidate.email)}
                </a>
                {safeStr(candidate.phone) && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> {String(candidate.phone)}
                  </span>
                )}
                {safeStr(candidate.linkedin_url) && (
                  <a href={String(candidate.linkedin_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
                    <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                  </a>
                )}
                {(safeStr(candidate.city) || safeStr(candidate.country)) && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {[candidate.city, candidate.country].filter(Boolean).map(String).join(", ")}
                  </span>
                )}
              </div>

              {/* Tags */}
              {Array.isArray(candidate.tags) && (candidate.tags as string[]).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(candidate.tags as string[]).slice(0, 12).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs font-normal">{tag}</Badge>
                  ))}
                  {(candidate.tags as string[]).length > 12 && (
                    <Badge variant="outline" className="text-xs">+{(candidate.tags as string[]).length - 12}</Badge>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Quick stats bar */}
          {(expYears !== null || expectedSalary !== null || applications.length > 0) && (
            <>
              <Separator className="my-5" />
              <div className="flex flex-wrap gap-6 text-sm">
                {expYears !== null && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Experience</p>
                    <p className="font-semibold">{expYears} {expYears === 1 ? "yr" : "yrs"}</p>
                  </div>
                )}
                {expectedSalary !== null && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Expected Salary</p>
                    <p className="font-semibold">{currency} {expectedSalary.toLocaleString()}</p>
                  </div>
                )}
                {applications.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Applications</p>
                    <p className="font-semibold">{applications.length}</p>
                  </div>
                )}
                {applications.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Latest stage</p>
                    <Badge variant="outline" className={`text-xs ${STAGE_COLORS[applications[0]?.stage] ?? ""}`}>
                      {applications[0]?.stage?.replace(/_/g, " ")}
                    </Badge>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="applications">Applications ({applications.length})</TabsTrigger>
          <TabsTrigger value="interviews">Interviews</TabsTrigger>
          <TabsTrigger value="resume">Resume</TabsTrigger>
        </TabsList>

        {/* ── Overview tab ────────────────────────────────────────────── */}
        <TabsContent value="overview">
          <OverviewTab
            candidate={candidate as Record<string, unknown>}
            applications={applications}
            candidateId={candidateId!}
            tz={tz}
            df={df}
          />
        </TabsContent>

        {/* ── Applications tab ────────────────────────────────────────── */}
        <TabsContent value="applications" className="space-y-4">
          <p className="text-sm text-muted-foreground rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
            Each card shows answers specific to that job application. Contact info, resume, employment & education are on <strong>Overview</strong>.
          </p>
          {applications.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No applications yet.</p>
              </CardContent>
            </Card>
          ) : (
            applications.map((app) => (
              <Card key={app.id}>
                <CardContent className="p-5">
                  {/* Job header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-semibold text-base leading-snug">{app.job_title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {[app.job_department, app.job_location].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Badge variant="outline" className={`text-xs shrink-0 ${STAGE_COLORS[app.stage] ?? ""}`}>
                      {app.stage?.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  {/* Dates */}
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Applied {formatDateTimeDisplay(app.applied_at, tz, df)}
                    </span>
                    {app.stage_updated_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Updated {formatDateTimeDisplay(app.stage_updated_at, tz, df)}
                      </span>
                    )}
                  </div>

                  {/* Rejection reason */}
                  {app.reject_reason && (
                    <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 p-2 rounded">
                      Rejection reason: {app.reject_reason}
                    </p>
                  )}

                  <ApplicationAnswers
                    customAnswers={app.custom_answers}
                    coverLetter={app.cover_letter}
                    referralSource={app.referral_source}
                    formConfig={app.form_config}
                    scope="application"
                    expanded
                    embedded
                  />
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Interviews tab ──────────────────────────────────────────── */}
        <TabsContent value="interviews">
          <InterviewsTab
            applications={applications}
            candidate={{
              id: String(candidate.id ?? ""),
              first_name: String(candidate.first_name ?? ""),
              last_name: String(candidate.last_name ?? ""),
              resume_url: candidate.resume_url ? String(candidate.resume_url) : null,
              resume_filename: candidate.resume_filename ? String(candidate.resume_filename) : null,
            }}
            employees={employees as never}
          />
        </TabsContent>

        {/* ── Resume tab ──────────────────────────────────────────────── */}
        <TabsContent value="resume">
          <Card>
            <CardContent className="p-8">
              {candidate.resume_url ? (
                <div className="text-center">
                  <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-4">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                  <p className="font-medium text-base mb-1">{safeStr(candidate.resume_filename) ?? "Resume"}</p>
                  <p className="text-sm text-muted-foreground mb-4">Click below to open the resume in a new tab.</p>
                  <Button variant="outline" asChild>
                    <a
                      href={String(candidate.resume_url) || `/api/recruitment/candidates/${candidate.id}/resume`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText className="h-4 w-4 mr-2" /> View Resume
                    </a>
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium mb-1">No resume uploaded</p>
                  <p className="text-sm">The candidate hasn't uploaded a resume yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </Layout>
  );
}
