import { NotificationRepository } from "./NotificationRepository.js";
import { LeaveRepository } from "../leave/LeaveRepository.js";
import { resolvePolicy, hrScopeFilter } from "../../lib/policy.js";
import type { UserPayload } from "../../middleware/auth.js";
import {
  todayInTz,
  formatNotificationDateRange,
  formatYmdForUserMessage,
  toYmdDateOnly,
} from "../../lib/timezone.js";
import { hasOrgDerivedManagerScope } from "../../lib/rbac.js";
import { effectiveRegionsFor } from "../../lib/regionAccess.js";
import type { ModuleRegionCtx } from "../../lib/moduleRegionCtx.js";
import { formatLeaveAppliedAt } from "../../../shared/dateTimeFormat.js";
import {
  changeRequestDeepLink,
  employeeProfileTabLink,
  feedPostDeepLink,
  leaveApprovalDeepLink,
  leaveEmployeeRequestDeepLink,
  offboardingEmployeeDeepLink,
  onboardingRecordDeepLink,
  recruitmentApplicantDeepLink,
  timezoneMeetingDeepLink,
  taskDetailDeepLink,
} from "../../../shared/notificationDeepLinks.js";

export interface NotificationItem {
  id: string; type: string; module: string; title: string;
  message: string; link: string; createdAt: string;
  roleTarget: "employee" | "manager" | "hr" | "admin" | "all";
}

/** First non-null timestamp that parses to a valid date; else fallback (prevents every item showing "now" when DB has nulls). */
function pickFirstValidIso(values: unknown[], fallback: string): string {
  for (const v of values) {
    if (v == null || v === "") continue;
    const d = v instanceof Date ? v : new Date(typeof v === "string" || typeof v === "number" ? v : String(v));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return fallback;
}

function formatMeetingStartLabel(iso: unknown, timeZone: string): string {
  try {
    const d = iso ? new Date(String(iso)) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    return formatLeaveAppliedAt(d, timeZone?.trim() || "UTC");
  } catch {
    return "";
  }
}

export class NotificationService {
  private readonly repo = new NotificationRepository();

  async getNotifications(
    user: { id: string; role: string; employeeId: string | null; email?: string; roles?: string[] },
    userTz: string,
    userDateFormat: string,
    ctx?: ModuleRegionCtx,
  ): Promise<{ notifications: NotificationItem[]; role: string }> {
    const role = user.role.toLowerCase();
    const regions = ctx ? effectiveRegionsFor(ctx, ctx.requestedRegion) : null;
    const { employeeId } = user;
    let effectiveEmployeeId = employeeId;
    if (!effectiveEmployeeId && user.email?.trim()) {
      const lr = new LeaveRepository();
      const rows = await lr.getEmployeeIdByEmailForFtSync(user.email.trim().toLowerCase());
      if (rows.length) effectiveEmployeeId = (rows[0] as { id: string }).id;
    }
    const notifications: NotificationItem[] = [];
    const now = new Date().toISOString();
    const todayStr = todayInTz(userTz);

    // ── Company feed notifications (all authenticated users) ─────────────────
    const feedPosts = await this.repo.getRecentFeedPosts();
    for (const p of feedPosts) {
      const author = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "HR";
      const content = String(p.content || "").replace(/\s+/g, " ").trim();
      const snippet = content.length > 90 ? `${content.slice(0, 90)}...` : content;
      notifications.push({
        id: `feed-post-${p.id}`,
        type: "feed_post",
        module: "Company Feed",
        title: "New company post",
        message: `${author}: ${snippet || "Shared a company update."}`,
        link: feedPostDeepLink(p.id),
        createdAt: p.created_at ? new Date(p.created_at).toISOString() : now,
        roleTarget: "all",
      });
    }

    // ── Employee personal notifications ──────────────────────────────────────
    if (effectiveEmployeeId) {
      const [myLeave, myCR, myOb, myAssignments, offAssignments, leaveNotified, taskComments, taskAssigned, taskCompleted] = await Promise.all([
        this.repo.getMyLeave(effectiveEmployeeId),
        this.repo.getMyChangeRequests(user.id),
        this.repo.getMyOnboarding(effectiveEmployeeId),
        this.repo.getOnboardingAssignments(effectiveEmployeeId),
        this.repo.getOffboardingAssignments(effectiveEmployeeId),
        this.repo.getLeaveWhereUserNotified(effectiveEmployeeId),
        this.repo.getTaskCommentNotifications(user.id, effectiveEmployeeId),
        this.repo.getTaskAssignedNotifications(user.id, effectiveEmployeeId),
        this.repo.getTaskCompletedNotifications(user.id),
      ]);
      for (const r of myLeave) {
        const range = formatNotificationDateRange(r.start_date, r.end_date, userDateFormat);
        const createdAt = r.applied_at ? new Date(r.applied_at).toISOString() : now;
        if (r.status === "pending") notifications.push({ id: `leave-pending-${r.id}`, type: "leave", module: "Leave", title: "Leave pending approval", message: `Your ${r.type_name} (${range}) is awaiting approval.`, link: leaveEmployeeRequestDeepLink(r.id), createdAt, roleTarget: "employee" });
        else if (r.status === "approved") notifications.push({ id: `leave-approved-${r.id}`, type: "leave", module: "Leave", title: "Leave approved", message: `Your ${r.type_name} (${range}) has been approved.`, link: leaveEmployeeRequestDeepLink(r.id), createdAt, roleTarget: "employee" });
        else if (r.status === "rejected") notifications.push({ id: `leave-rejected-${r.id}`, type: "leave", module: "Leave", title: "Leave rejected", message: `Your ${r.type_name} (${range}) was not approved.`, link: leaveEmployeeRequestDeepLink(r.id), createdAt, roleTarget: "employee" });
      }
      for (const cr of myCR) {
        const createdAt = cr.created_at ? new Date(cr.created_at).toISOString() : now;
        if (cr.status === "pending") notifications.push({ id: `change-request-${cr.id}`, type: "change_request", module: "Profile", title: "Profile change pending", message: `Your ${cr.category || "profile"} update is with HR for approval.`, link: changeRequestDeepLink(cr.id), createdAt, roleTarget: "employee" });
        else if (cr.status === "approved") notifications.push({ id: `change-approved-${cr.id}`, type: "change_request", module: "Profile", title: "Profile change approved", message: `Your ${cr.category || "profile"} update has been approved.`, link: changeRequestDeepLink(cr.id), createdAt, roleTarget: "employee" });
      }
      const ob = myOb[0];
      if (ob?.pending_tasks > 0) notifications.push({ id: `onboarding-tasks-${ob.id}`, type: "onboarding", module: "Onboarding", title: "Onboarding tasks pending", message: `${ob.pending_tasks} onboarding task(s) remaining.`, link: onboardingRecordDeepLink(ob.id), createdAt: ob.created_at ? new Date(ob.created_at).toISOString() : now, roleTarget: "employee" });
      for (const a of myAssignments) {
        notifications.push({
          id: `onboarding-assigned-${a.record_id}`,
          type: "onboarding", module: "Onboarding",
          title: "Onboarding tasks assigned to you",
          message: `You have ${a.pending_tasks} pending onboarding task(s) for ${a.hire_first} ${a.hire_last}.`,
          link: onboardingRecordDeepLink(a.record_id),
          createdAt: a.created_at ? new Date(a.created_at).toISOString() : now,
          roleTarget: "employee",
        });
      }
      for (const a of offAssignments) {
        const pending = a.my_pending_tasks ?? 0;
        const name = [a.first_name, a.last_name].filter(Boolean).join(" ") || "Employee";
        notifications.push({
          id: `offboarding-assigned-${a.record_id}`,
          type: "offboarding", module: "Offboarding",
          title: "Offboarding task(s) assigned to you",
          message: pending > 0 ? `You have ${pending} offboarding task(s) for ${name}.` : `You are assigned to offboarding for ${name}.`,
          link: offboardingEmployeeDeepLink(a.employee_id),
          createdAt: a.created_at ? new Date(a.created_at).toISOString() : now,
          roleTarget: "employee",
        });
      }
      for (const r of leaveNotified) {
        const range = formatNotificationDateRange(r.start_date, r.end_date, userDateFormat);
        const createdAt = r.applied_at ? new Date(r.applied_at).toISOString() : now;
        notifications.push({ id: `leave-notified-${r.id}`, type: "leave", module: "Leave", title: "Leave applied — you were notified", message: `${r.first_name} ${r.last_name} applied for ${r.type_name} (${range}) and notified you.`, link: employeeProfileTabLink(r.employee_id, "timeoff"), createdAt, roleTarget: "employee" });
      }

      for (const c of taskComments) {
        const snippet = String(c.content || "").replace(/\s+/g, " ").trim();
        const preview = snippet.length > 80 ? `${snippet.slice(0, 80)}…` : snippet;
        const author = c.author_name || "Someone";
        notifications.push({
          id: `task-comment-${c.id}`,
          type: "task_comment",
          module: "Tasks",
          title: "New task comment",
          message: `${author} on “${c.task_title}”: ${preview || "New comment"}`,
          link: taskDetailDeepLink(c.task_id),
          createdAt: pickFirstValidIso([c.created_at], now),
          roleTarget: "employee",
        });
      }
      for (const t of taskAssigned) {
        notifications.push({
          id: `task-assigned-${t.id}`,
          type: "task_assigned",
          module: "Tasks",
          title: "Task assigned to you",
          message: `${t.creator_name || "Someone"} assigned you: “${t.title}”.`,
          link: taskDetailDeepLink(t.id),
          createdAt: pickFirstValidIso([t.created_at], now),
          roleTarget: "employee",
        });
      }
      for (const t of taskCompleted) {
        notifications.push({
          id: `task-completed-${t.id}`,
          type: "task_completed",
          module: "Tasks",
          title: "Task completed",
          message: `“${t.title}” was marked complete${t.completed_by_name ? ` by ${t.completed_by_name}` : ""}.`,
          link: taskDetailDeepLink(t.id),
          createdAt: pickFirstValidIso([t.completed_at], now),
          roleTarget: "employee",
        });
      }

      // ── Interview feedback pending ─────────────────────────────────────────
      const feedbackPending = await this.repo.getFeedbackPendingForEmployee(effectiveEmployeeId);
      for (const fb of feedbackPending) {
        const candidateName = `${fb.first_name ?? ""} ${fb.last_name ?? ""}`.trim() || "the candidate";
        const round = fb.interview_round ? ` Round ${fb.interview_round}` : "";
        const type = fb.interview_type ? ` (${fb.interview_type})` : "";
        notifications.push({
          id: `interview-feedback-${fb.feedback_id}`,
          type: "interview_feedback",
          module: "Recruitment",
          title: "Interview feedback pending",
          message: `Submit your${round}${type} feedback for ${candidateName}.`,
          link: recruitmentApplicantDeepLink(fb.job_id, fb.application_id),
          createdAt: fb.scheduled_at ? new Date(fb.scheduled_at).toISOString() : now,
          roleTarget: "employee",
        });
      }

      const workEmailLower = await this.repo.getEmployeeWorkEmailLower(effectiveEmployeeId);
      if (workEmailLower) {
        const invitedMeetings = await this.repo.getUpcomingMeetingsWhereInvited(workEmailLower);
        for (const m of invitedMeetings) {
          if (m.created_by_user_id && user.id && String(m.created_by_user_id) === String(user.id)) continue;
          const org = [m.organizer_first_name, m.organizer_last_name].filter(Boolean).join(" ").trim() || "A colleague";
          const when = formatMeetingStartLabel(m.start_at, userTz);
          const createdAt = m.created_at ? new Date(m.created_at).toISOString() : now;
          notifications.push({
            id: `timezone-meeting-${m.id}`,
            type: "scheduled_meeting",
            module: "Timezone",
            title: "Teams meeting scheduled",
            message: when
              ? `${org} invited you to “${m.title}” (${when}).`
              : `${org} invited you to “${m.title}”.`,
            link: timezoneMeetingDeepLink(m.id),
            createdAt,
            roleTarget: "employee",
          });
        }
      }
    }

    // ── Leave approvals: managers see only rows assigned to them; HR/admin see org-wide queue too
    //    (matches Leave Approvals — previously only approver_id = self, so HR never saw manager-step items).
    const leaveApprovalSeen = new Set<string>();
    const pushLeaveApprovalNotif = (a: {
      id: string;
      leave_request_id: string;
      approver_role?: string | null;
      start_date: string;
      end_date: string;
      total_days: string | number;
      type_name: string;
      first_name: string;
      last_name: string;
      applied_at: string | null;
    }) => {
      if (leaveApprovalSeen.has(a.id)) return;
      leaveApprovalSeen.add(a.id);
      const apprRange = formatNotificationDateRange(a.start_date, a.end_date, userDateFormat);
      const stepLabel =
        a.approver_role === "manager"
          ? "Manager step"
          : a.approver_role === "hr" || a.approver_role === "admin"
            ? "HR step"
            : "Pending approval";
      notifications.push({
        id: `leave-approval-${a.id}`,
        type: "leave",
        module: "Leave",
        title: "Leave approval needed",
        message: `${a.first_name} ${a.last_name} requested ${a.type_name} (${apprRange}, ${a.total_days} day(s)) — ${stepLabel}.`,
        link: leaveApprovalDeepLink(a.leave_request_id),
        createdAt: a.applied_at ? new Date(a.applied_at).toISOString() : now,
        roleTarget: hasOrgDerivedManagerScope(role, user.roles) ? "manager" : "hr",
      });
    };

    const isReportingManager = hasOrgDerivedManagerScope(role, user.roles);
    if (isReportingManager && effectiveEmployeeId) {
      const approvals = await this.repo.getPendingApprovals(effectiveEmployeeId, regions);
      for (const a of approvals) pushLeaveApprovalNotif(a);
    } else if (role === "admin" || role === "hr" || role === "limited_hr") {
      if (effectiveEmployeeId) {
        const mine = await this.repo.getPendingApprovals(effectiveEmployeeId, regions);
        for (const a of mine) pushLeaveApprovalNotif(a);
      }
      if (role === "admin" || role === "hr") {
        const orgWide = await this.repo.getPendingLeaveApprovalsForHrOrgWide(15, regions);
        for (const a of orgWide) pushLeaveApprovalNotif(a);
      } else if (role === "limited_hr" && effectiveEmployeeId) {
        const policyUser: UserPayload = {
          id: user.id,
          email: user.email ?? "",
          role: user.role as UserPayload["role"],
          employeeId: user.employeeId,
          roles: user.roles,
          branchId: null,
          regionCode: ctx?.regionCode ?? null,
          isRegionalSuperAdmin: ctx?.isRegionalSuperAdmin ?? false,
        };
        const policy = await resolvePolicy(policyUser);
        const sf = hrScopeFilter(policy);
        if (sf) {
          const scoped = await this.repo.getPendingLeaveApprovalsForHrScoped(
            effectiveEmployeeId,
            sf.departments,
            sf.offices,
            15,
            regions,
          );
          for (const a of scoped) pushLeaveApprovalNotif(a);
        }
      }
    }

    // ── HR/Admin: aggregated module alerts ───────────────────────────────────
    if (role === "hr" || role === "admin") {
      const labels = [
        "getPendingChangeCount",
        "getOnboardingInProgress",
        "getOffboardingPending",
        "getNewApplications",
        "getOffersSent",
        "getProbationAlerts",
      ] as const;
      const settled = await Promise.allSettled([
        this.repo.getPendingChangeCount(regions),
        this.repo.getOnboardingInProgress(regions),
        this.repo.getOffboardingPending(regions),
        this.repo.getNewApplications(regions),
        this.repo.getOffersSent(regions),
        this.repo.getProbationAlerts(todayStr, regions),
      ]);
      const pendingCR = (settled[0].status === "fulfilled" ? settled[0].value : []) as { c?: number }[];
      const obInProgress = (settled[1].status === "fulfilled" ? settled[1].value : []) as any[];
      const offPending = (settled[2].status === "fulfilled" ? settled[2].value : []) as any[];
      const newApps = (settled[3].status === "fulfilled" ? settled[3].value : []) as any[];
      const offersSent = (settled[4].status === "fulfilled" ? settled[4].value : []) as any[];
      const probationAlerts = (settled[5].status === "fulfilled" ? settled[5].value : []) as any[];
      for (let i = 0; i < settled.length; i++) {
        if (settled[i].status === "rejected") {
          console.warn(`[notifications] HR aggregate ${labels[i]} failed:`, (settled[i] as PromiseRejectedResult).reason);
        }
      }
      const changeCount = Number(pendingCR[0]?.c ?? 0);
      if (changeCount > 0) notifications.push({ id: "change-requests-pending-hr", type: "change_request", module: "Profile", title: "Profile change requests pending", message: `${changeCount} employee profile change request(s) need HR review.`, link: "/change-requests", createdAt: now, roleTarget: "hr" });
      for (const r of obInProgress) notifications.push({ id: `onboarding-hr-${r.id}`, type: "onboarding", module: "Onboarding", title: "Onboarding in progress", message: `${r.first_name} ${r.last_name} (${r.department}) — complete onboarding tasks.`, link: onboardingRecordDeepLink(r.id), createdAt: r.created_at ? new Date(r.created_at).toISOString() : now, roleTarget: "hr" });
      for (const o of offPending) {
        const exitFmt = o.exit_date
          ? formatYmdForUserMessage(toYmdDateOnly(o.exit_date), userDateFormat)
          : "";
        notifications.push({
          id: `offboarding-${o.id}`,
          type: "offboarding",
          module: "Offboarding",
          title: "Offboarding in progress",
          message: exitFmt
            ? `${o.first_name} ${o.last_name} — exit ${exitFmt}. Complete checklist.`
            : `${o.first_name} ${o.last_name}. Complete checklist.`,
          link: offboardingEmployeeDeepLink(o.employee_id),
          createdAt: pickFirstValidIso([o.created_at], now),
          roleTarget: "hr",
        });
      }
      for (const a of newApps) {
        const appCreatedAt = pickFirstValidIso([a.stage_updated_at, a.applied_at, a.updated_at], now);
        notifications.push({
          id: `application-new-${a.id}`,
          type: "recruitment",
          module: "Recruitment",
          title: "New application",
          message: `${a.first_name} ${a.last_name} applied for ${a.job_title || "open role"}.`,
          link: recruitmentApplicantDeepLink(a.job_id, a.id),
          createdAt: appCreatedAt,
          roleTarget: "hr",
        });
      }
      for (const a of offersSent) notifications.push({ id: `offer-sent-${a.id}`, type: "recruitment", module: "Recruitment", title: "Offer sent", message: `Offer sent to ${a.first_name} ${a.last_name} for ${a.job_title || "role"}.`, link: recruitmentApplicantDeepLink(a.job_id, a.id), createdAt: a.updated_at ? new Date(a.updated_at).toISOString() : now, roleTarget: "hr" });
      for (const p of probationAlerts) {
        const endYmd = p.probation_end_date ? toYmdDateOnly(p.probation_end_date) : "";
        const endDisplay = endYmd ? formatYmdForUserMessage(endYmd, userDateFormat) : "";
        const daysLeft = endYmd
          ? Math.max(0, Math.ceil((new Date(`${endYmd}T12:00:00Z`).getTime() - new Date(`${todayStr}T12:00:00Z`).getTime()) / 86400000))
          : 0;
        notifications.push({
          id: `probation-alert-${p.id}`,
          type: "probation_reminder",
          module: "People",
          title: "Probation ending soon",
          message: endDisplay
            ? `${p.first_name} ${p.last_name}'s probation ends in ${daysLeft} day(s) (${endDisplay}).`
            : `${p.first_name} ${p.last_name}'s probation review is due soon.`,
          link: employeeProfileTabLink(p.id, "job"),
          createdAt: now,
          roleTarget: "hr",
        });
      }
    }

    // ── Recruitment: draft offers pending approval (limited-recruiter flow) ──
    if (["hr", "admin", "recruiter", "manager", "hiring_manager"].includes(role)) {
      const pendingOffers = await this.repo.getOffersPendingApproval(regions);
      for (const o of pendingOffers) {
        const who = `${o.first_name ?? ""} ${o.last_name ?? ""}`.trim() || "Candidate";
        notifications.push({
          id: `offer-approval-pending-${o.offer_id}`,
          type: "offer_approval_pending",
          module: "Recruitment",
          title: "Offer needs approval",
          message: `${who}: draft offer for ${o.job_title || "a role"} is awaiting your approval.`,
          link: recruitmentApplicantDeepLink(o.job_id, o.application_id),
          createdAt: o.updated_at ? new Date(o.updated_at).toISOString() : now,
          roleTarget: "all",
        });
      }
    }

    if (role === "limited_recruiter") {
      const readyOffers = await this.repo.getApprovedDraftOffersForCreator(user.id);
      for (const o of readyOffers) {
        const who = `${o.first_name ?? ""} ${o.last_name ?? ""}`.trim() || "Candidate";
        notifications.push({
          id: `offer-approved-ready-${o.offer_id}`,
          type: "offer_approved_ready",
          module: "Recruitment",
          title: "Offer approved",
          message: `Your draft offer for ${who} (${o.job_title || "role"}) has been approved. You can attach the letter and send it.`,
          link: recruitmentApplicantDeepLink(o.job_id, o.application_id),
          createdAt: o.approved_at ? new Date(o.approved_at).toISOString() : now,
          roleTarget: "all",
        });
      }
    }

    notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { notifications: notifications.slice(0, 50), role };
  }
}

