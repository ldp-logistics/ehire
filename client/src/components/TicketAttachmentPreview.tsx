import { useEffect, useState } from "react";
import { FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

function inferAttachmentKind(fileName: string, contentType: string): "image" | "pdf" | "other" {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "pdf";
  const lower = fileName.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/.test(lower)) return "image";
  if (lower.endsWith(".pdf")) return "pdf";
  return "other";
}

interface TicketAttachmentPreviewProps {
  ticketId: string;
  fileName?: string | null;
}

export function TicketAttachmentPreview({ ticketId, fileName }: TicketAttachmentPreviewProps) {
  const name = (fileName && fileName.trim()) || "attachment";
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/assets/tickets/${encodeURIComponent(ticketId)}/attachment`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Could not load attachment");
        const type = res.headers.get("Content-Type") || "";
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setContentType(type);
          setBlobUrl(objectUrl);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load attachment");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [ticketId]);

  const kind = inferAttachmentKind(name, contentType);

  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" />
        Loading attachment…
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        {error || "Attachment unavailable"}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {kind === "image" ? (
          <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : kind === "pdf" ? (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate" title={name}>
          {name}
        </span>
      </div>

      {kind === "image" && (
        <a href={blobUrl} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={blobUrl}
            alt={name}
            className="max-h-80 max-w-full rounded-md border bg-background object-contain"
          />
        </a>
      )}

      {kind === "pdf" && (
        <iframe src={blobUrl} title={name} className="w-full h-80 rounded-md border bg-background" />
      )}

      <a
        href={blobUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={name}
        className="inline-flex text-sm text-primary hover:underline font-medium"
      >
        {kind === "other" ? "Download attachment" : "Open / Download"}
      </a>
    </div>
  );
}
