import { FileText, Download, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

/**
 * Resume row for main content only: file meta + outline Preview / Download.
 */
export function ResumeFileCard({
  fileName,
  previewHref,
  updatedAt,
}: {
  fileName: string;
  previewHref: string;
  updatedAt?: string | null;
}) {
  const when = updatedAt ? formatDistanceToNow(new Date(updatedAt), { addSuffix: true }) : null;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="h-8 w-8 shrink-0 text-gray-400" strokeWidth={1.5} />
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{fileName}</p>
          <p className="text-sm text-gray-500">{when ? `Updated ${when}` : "On file"}</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <a
          href={previewHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 transition-all duration-150 hover:bg-gray-50"
        >
          <ExternalLink className="h-4 w-4" />
          Preview
        </a>
        <a
          href={previewHref}
          download={fileName}
          className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 transition-all duration-150 hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      </div>
    </div>
  );
}
