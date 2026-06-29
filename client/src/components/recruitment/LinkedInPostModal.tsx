import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Copy, Check, RefreshCw, Linkedin } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type Tone = "professional" | "casual" | "exciting";

const TONES: { id: Tone; label: string; emoji: string }[] = [
  { id: "professional", label: "Professional", emoji: "💼" },
  { id: "casual",       label: "Casual",       emoji: "😊" },
  { id: "exciting",     label: "Exciting",     emoji: "🚀" },
];

interface Props {
  open: boolean;
  jobId: string | null;
  jobTitle?: string;
  onClose: () => void;
}

export function LinkedInPostModal({ open, jobId, jobTitle, onClose }: Props) {
  const [tone, setTone] = useState<Tone>("professional");
  const [post, setPost] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the last (jobId, tone) combo we generated for so we don't double-fire
  const lastGenRef = useRef<{ jobId: string; tone: Tone } | null>(null);

  const generate = async (jobIdArg: string, toneArg: Tone) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    lastGenRef.current = { jobId: jobIdArg, tone: toneArg };
    try {
      const res = await apiRequest("POST", `/api/recruitment/jobs/${jobIdArg}/generate-linkedin-post`, { tone: toneArg });
      const data = await res.json();
      if (res.status === 429) throw new Error(data?.error || "AI quota exceeded — please wait a minute and try again.");
      if (!res.ok) throw new Error(data?.error || "Failed to generate post");
      setPost(data.post ?? "");
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate when modal opens or job changes
  useEffect(() => {
    if (!open || !jobId) return;
    const alreadyDone = lastGenRef.current?.jobId === jobId && lastGenRef.current?.tone === tone;
    if (alreadyDone && post) return;
    setPost("");
    generate(jobId, tone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobId]);

  // Re-generate when tone changes (only if modal is open and we already have a post / done loading)
  const handleToneChange = (newTone: Tone) => {
    if (newTone === tone) return;
    setTone(newTone);
    if (open && jobId) {
      setPost("");
      generate(jobId, newTone);
    }
  };

  const handleCopy = async () => {
    if (!post) return;
    await navigator.clipboard.writeText(post);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setPost("");
    setError(null);
    setCopied(false);
    lastGenRef.current = null;
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md" style={{ backgroundColor: "#0A66C2" }}>
              <Linkedin className="h-4 w-4 text-white" />
            </span>
            Generate LinkedIn Post
            {jobTitle && <span className="ml-1 text-muted-foreground font-normal truncate">— {jobTitle}</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Tone selector */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-sm text-muted-foreground shrink-0">Tone:</span>
          <div className="flex gap-1.5">
            {TONES.map((t) => (
              <button
                key={t.id}
                disabled={loading}
                onClick={() => handleToneChange(t.id)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors border",
                  tone === t.id
                    ? "border-transparent text-white"
                    : "border-border bg-muted/40 text-foreground hover:bg-muted",
                  loading ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
                style={tone === t.id ? { backgroundColor: "#0A66C2", borderColor: "#0A66C2" } : {}}
              >
                <span>{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Generated post area */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 mt-2">
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#0A66C2" }} />
              <span className="text-sm">Generating your LinkedIn post…</span>
            </div>
          ) : error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => jobId && generate(jobId, tone)}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Try again
              </Button>
            </div>
          ) : (
            <Textarea
              readOnly
              value={post}
              className="flex-1 min-h-[320px] resize-none font-mono text-sm leading-relaxed bg-muted/30 border-border/60"
              placeholder="Your LinkedIn post will appear here…"
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/50">
          <div className="w-20">
            {copied && (
              <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
                <Check className="h-3.5 w-3.5" /> Copied!
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || !jobId}
              onClick={() => jobId && generate(jobId, tone)}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
            <Button
              size="sm"
              disabled={!post || loading}
              onClick={handleCopy}
              style={{ backgroundColor: "#0A66C2", color: "#fff" }}
              className="hover:opacity-90"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy post
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
