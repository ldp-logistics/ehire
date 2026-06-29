import { cn } from "@/lib/utils";

export type ApplicantPipelineTabId =
  | "summary"
  | "profile"
  | "timeline"
  | "emails"
  | "comments"
  | "interviews"
  | "offer"
  | "tasks";

const TAB_LABELS: Record<ApplicantPipelineTabId, string> = {
  summary: "Summary",
  profile: "Profile",
  timeline: "Activity",
  emails: "Emails",
  comments: "Comments",
  interviews: "Interviews",
  offer: "Offer",
  tasks: "Tasks",
};

const ORDER: ApplicantPipelineTabId[] = [
  "summary",
  "profile",
  "timeline",
  "emails",
  "comments",
  "interviews",
  "offer",
  "tasks",
];

export function ApplicantPipelineTabBar({
  active,
  onChange,
  className,
}: {
  active: ApplicantPipelineTabId;
  onChange: (t: ApplicantPipelineTabId) => void;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap gap-0 border-b border-gray-200", className)}>
      {ORDER.map((id) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "-mb-px cursor-pointer border-b-2 px-4 py-2.5 text-sm font-medium transition-all duration-150",
              isActive
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-800",
            )}
          >
            {TAB_LABELS[id]}
          </button>
        );
      })}
    </div>
  );
}
