export interface CreateChangeRequestDTO {
  fieldName: string;
  newValue: string;
  category?: string;
}
export interface BulkCreateChangeRequestDTO {
  category: string;
  changes: Record<string, string>;
}
export interface ReviewChangeRequestDTO { reviewNotes?: string; }
export interface BulkApproveDTO { requestIds: string[]; reviewNotes?: string; }

export interface ChangeRequestResponseDTO {
  id: string; requesterId: string; employeeId: string; category: string;
  fieldName: string; oldValue: string | null; newValue: string;
  status: string; reviewedBy: string | null; reviewedAt: string | null;
  reviewNotes: string | null; createdAt: string; updatedAt: string;
  employeeName?: string; employeeCode?: string; requesterEmail?: string;
}
export interface BulkApproveResultDTO { approved: string[]; failed: { id: string; reason: string }[]; }
