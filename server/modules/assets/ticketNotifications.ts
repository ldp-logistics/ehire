import {
  notifyEmail,
  getEmailsByRole,
  getEmployeeEmail,
  getEmployeeNotificationRecipient,
  type Recipient,
} from "../../lib/emailNotifications.js";

export type TicketEmailRow = {
  id: string;
  ticket_number?: string | null;
  title?: string | null;
  asset_name?: string | null;
  priority?: string | null;
  created_by_id?: string | null;
  created_by_name?: string | null;
  created_by_email?: string | null;
  created_by_department?: string | null;
  assigned_to_id?: string | null;
  assigned_to_name?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function buildTicketEmailContext(
  ticket: TicketEmailRow,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    ticket_id: ticket.id,
    ticket_number: ticket.ticket_number || ticket.id,
    ticket_subject: (ticket.title && String(ticket.title).trim()) || "Support Request",
    ticket_category: ticket.asset_name || "General",
    ticket_priority: ticket.priority || "medium",
    employee_name: ticket.created_by_name || "Employee",
    department: ticket.created_by_department || "—",
    ...extra,
  };
}

async function resolveTicketCreatorRecipient(ticket: TicketEmailRow): Promise<Recipient | null> {
  if (ticket.created_by_id) {
    const preferred = await getEmployeeNotificationRecipient(ticket.created_by_id);
    if (preferred) return preferred;
    const work = await getEmployeeEmail(ticket.created_by_id);
    if (work) return work;
  }
  const email = ticket.created_by_email?.trim();
  if (email) {
    return { email, name: ticket.created_by_name?.trim() || email };
  }
  return null;
}

async function resolveAssigneeRecipient(
  employeeId: string,
  lookupUserEmail: (id: string) => Promise<{ email: string; name: string } | null>,
): Promise<Recipient | null> {
  const preferred = await getEmployeeNotificationRecipient(employeeId);
  if (preferred) return preferred;
  const user = await lookupUserEmail(employeeId);
  if (user) return user;
  return null;
}

function fireAndForget(fn: () => Promise<void>): void {
  (async () => {
    try {
      await fn();
    } catch (e) {
      console.error("[ticket-email]", e);
    }
  })();
}

export function notifyTicketCreated(
  ticket: TicketEmailRow,
  createdByName: string,
  createdByDepartment: string | null,
): void {
  fireAndForget(async () => {
    const itUsers = await getEmailsByRole("it");
    if (!itUsers.length) return;
    await notifyEmail(
      "it.ticket.created",
      buildTicketEmailContext(ticket, {
        employee_name: createdByName,
        department: createdByDepartment || "—",
      }),
      itUsers,
    );
  });
}

export function notifyTicketAssigned(
  ticket: TicketEmailRow,
  assigneeId: string,
  lookupUserEmail: (id: string) => Promise<{ email: string; name: string } | null>,
): void {
  fireAndForget(async () => {
    const assignee = await resolveAssigneeRecipient(assigneeId, lookupUserEmail);
    if (!assignee) return;
    await notifyEmail("it.ticket.assigned", buildTicketEmailContext(ticket), [assignee]);
  });
}

function dedupeRecipients(recipients: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return recipients.filter((r) => {
    const key = r.email.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function notifyTicketStatusChange(
  ticket: TicketEmailRow,
  oldStatus: string,
  newStatus: string,
  doerName: string,
  lookupUserEmail?: (id: string) => Promise<{ email: string; name: string } | null>,
): void {
  fireAndForget(async () => {
    const creator = await resolveTicketCreatorRecipient(ticket);
    const baseCtx = buildTicketEmailContext(ticket, {
      old_status: statusLabel(oldStatus),
      new_status: statusLabel(newStatus),
      doer_name: doerName,
      employee_name: ticket.created_by_name || creator?.name || "Employee",
    });

    if (newStatus === "resolved") {
      const assignee =
        ticket.assigned_to_id && lookupUserEmail
          ? await resolveAssigneeRecipient(ticket.assigned_to_id, lookupUserEmail)
          : null;
      const recipients = dedupeRecipients([
        ...(creator ? [creator] : []),
        ...(assignee ? [assignee] : []),
      ]);
      if (!recipients.length) return;

      const creatorEmail = creator?.email.trim().toLowerCase() ?? "";
      const assigneeEmail = assignee?.email.trim().toLowerCase() ?? "";

      for (const recipient of recipients) {
        const recipientEmail = recipient.email.trim().toLowerCase();
        const isAssigneeOnly =
          !!assigneeEmail &&
          recipientEmail === assigneeEmail &&
          recipientEmail !== creatorEmail;
        await notifyEmail(
          "it.ticket.resolved",
          {
            ...baseCtx,
            employee_name: recipient.name,
            recipient_name: recipient.name,
            resolved_notice: isAssigneeOnly
              ? "A support ticket assigned to you has been resolved."
              : "Your support ticket has been resolved.",
            ticket_link_suffix: isAssigneeOnly
              ? `assets?tab=tickets&ticket=${ticket.id}`
              : `it-support?ticket=${ticket.id}`,
          },
          [recipient],
        );
      }
      return;
    }

    if (!creator) return;
    await notifyEmail("it.ticket.status_changed", baseCtx, [creator]);
  });
}
