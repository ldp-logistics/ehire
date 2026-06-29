import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle, XCircle, Clock, Pen, Type, Shield,
  AlertTriangle, PartyPopper, Download,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { canvasToTrimmedSignaturePng } from "@/lib/signaturePng";
import { useParams } from "wouter";
import { formatDateTimeDisplay } from "@/lib/dateUtils";

interface SigningData {
  id: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  department: string | null;
  salary: string;
  salaryCurrency: string | null;
  startDate: string | null;
  employmentType: string | null;
  status: string;
  esignStatus: string | null;
  esignSignedAt: string | null;
  offerHtml: string;
  hasTemplate: boolean;
  hasPdf: boolean;
  expiresAt: string | null;
}

function SignatureCanvas({ onSignatureChange }: { onSignatureChange: (data: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = "touches" in e ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDrawing(true);
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasContent(true);
  }, [drawing, getPos]);

  const endDraw = useCallback(() => {
    setDrawing(false);
    if (hasContent && canvasRef.current) {
      onSignatureChange(canvasToTrimmedSignaturePng(canvasRef.current));
    }
  }, [hasContent, onSignatureChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    /* Pure black + slightly thicker stroke so scaled-down PNG in Word/PDF still reads bold (not grey). */
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3.5;
    setHasContent(false);
    onSignatureChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        className="w-full h-[150px] border-2 border-dashed rounded-lg cursor-crosshair bg-white touch-none hover:border-slate-400 transition-colors"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-muted-foreground">Sign inside the box above</p>
        <Button variant="ghost" size="sm" onClick={clear} className="text-xs h-7">
          Clear
        </Button>
      </div>
    </div>
  );
}

function TypedSignature({ onSignatureChange }: { onSignatureChange: (data: string | null) => void }) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (name.trim().length > 1) {
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 150;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = "italic 48px Georgia, serif";
      ctx.fillStyle = "#000000";
      ctx.fillText(name, 20, 90);
      onSignatureChange(canvasToTrimmedSignaturePng(canvas));
    } else {
      onSignatureChange(null);
    }
  }, [name, onSignatureChange]);

  return (
    <div className="space-y-3">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Type your full name"
        className="text-xl font-serif italic"
        maxLength={60}
      />
      {name.trim().length > 1 && (
        <div className="border rounded-lg p-4 bg-white min-h-[60px] flex items-end">
          <span className="text-3xl font-serif italic text-slate-900">{name}</span>
        </div>
      )}
      <p className="text-xs text-muted-foreground text-center">Your typed name serves as your legal signature</p>
    </div>
  );
}

export default function OfferSign() {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [agreedRead, setAgreedRead] = useState(false);
  const [agreedLegal, setAgreedLegal] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  /** Blob URL for PDF preview — avoids X-Frame-Options:DENY on the API response (common behind nginx). */
  const [offerPdfObjectUrl, setOfferPdfObjectUrl] = useState<string | null>(null);
  const [offerPdfLoading, setOfferPdfLoading] = useState(false);
  const [offerPdfError, setOfferPdfError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<SigningData>({
    queryKey: [`/api/recruitment/offer-sign/${token}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/recruitment/offer-sign/${token}`);
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (!data?.hasPdf || !token) {
      setOfferPdfObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setOfferPdfLoading(false);
      setOfferPdfError(null);
      return;
    }

    let cancelled = false;
    setOfferPdfLoading(true);
    setOfferPdfError(null);

    (async () => {
      try {
        const res = await fetch(`/api/recruitment/offer-sign/${encodeURIComponent(token)}/pdf`, {
          credentials: "include",
        });
        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          throw new Error(text || `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setOfferPdfObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e) {
        if (!cancelled) {
          setOfferPdfError((e as Error)?.message || "Could not load PDF");
          setOfferPdfObjectUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }
      } finally {
        if (!cancelled) setOfferPdfLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      setOfferPdfObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [data?.hasPdf, token]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/recruitment/offer-sign/${token}/submit`, { signatureData });
      return res.json();
    },
    onSuccess: () => {
      toast.success("Offer signed successfully!");
      queryClient.invalidateQueries({ queryKey: [`/api/recruitment/offer-sign/${token}`] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to sign"),
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/recruitment/offer-sign/${token}/decline`);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Offer declined");
      queryClient.invalidateQueries({ queryKey: [`/api/recruitment/offer-sign/${token}`] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to decline"),
  });

  const canSign = !!signatureData && agreedRead && agreedLegal;
  const isSigned = data?.esignStatus === "signed" || data?.status === "accepted";
  const isDeclined = data?.status === "rejected";
  const isExpired = data?.expiresAt && new Date(data.expiresAt) < new Date();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-xl shadow-lg">
          <CardContent className="py-16 text-center">
            <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-4 animate-pulse" />
            <p className="text-muted-foreground">Loading offer details...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-xl shadow-lg">
          <CardContent className="py-16 text-center">
            <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Offer Not Found</h2>
            <p className="text-muted-foreground">
              This signing link is invalid, has expired, or has already been used.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSigned) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg shadow-lg">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <PartyPopper className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Offer Accepted!</h2>
            <p className="text-muted-foreground mb-6">
              Congratulations, {data.candidateName}! Your signed offer letter has been recorded
              and the HR team has been notified. A signed copy of your offer letter (PDF) has been
              sent to your email address for your records.
            </p>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm text-left max-w-sm mx-auto mb-6">
              <div className="flex justify-between"><span className="text-muted-foreground">Position</span><span className="font-medium">{data.jobTitle}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Signed at</span><span className="font-medium">{data.esignSignedAt ? formatDateTimeDisplay(data.esignSignedAt) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-medium text-green-600">Signed</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isDeclined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg shadow-lg">
          <CardContent className="py-12 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Offer Declined</h2>
            <p className="text-muted-foreground">
              You have declined this offer. The HR team has been notified.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Offer Letter</h1>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Shield className="h-3.5 w-3.5 text-green-400" />
          <span>Secure document signing</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 p-6 items-start">
        {/* Document panel */}
        <Card className="shadow-lg">
          <CardHeader className="bg-slate-50 border-b">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Document for signing</p>
                <CardTitle className="text-lg">Employment Offer Letter</CardTitle>
              </div>
              <Badge variant="outline">
                {isExpired ? "Expired" : data.status === "sent" ? "Awaiting signature" : data.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {data.hasPdf ? (
              offerPdfLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground text-sm">
                  <Clock className="h-8 w-8 animate-pulse" />
                  <p>Loading offer letter…</p>
                </div>
              ) : offerPdfError ? (
                <div className="p-8 text-center space-y-3">
                  <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
                  <p className="text-sm text-muted-foreground">{offerPdfError}</p>
                  <a
                    href={`/api/recruitment/offer-sign/${encodeURIComponent(token ?? "")}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline inline-flex items-center gap-1"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Open PDF in a new tab
                  </a>
                </div>
              ) : offerPdfObjectUrl ? (
                <iframe
                  src={offerPdfObjectUrl}
                  className="w-full border-0"
                  style={{ minHeight: "75vh" }}
                  title="Offer Letter"
                />
              ) : null
            ) : data.offerHtml ? (
              <div
                className="prose prose-sm max-w-none leading-relaxed p-8"
                dangerouslySetInnerHTML={{ __html: data.offerHtml }}
              />
            ) : (
              <div className="text-center py-12 text-muted-foreground p-8">
                <p>No template-based document available.</p>
                <p className="text-sm mt-1">Please check the offer details sent via email.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Signature panel */}
        <div className="space-y-4 lg:sticky lg:top-6">
          {/* Progress */}
          <Card>
            <CardContent className="p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">Signing progress</p>
              <div className="space-y-3">
                {[
                  { label: "Document reviewed", done: true },
                  { label: "Add your signature", done: !!signatureData, active: !signatureData },
                  { label: "Accept & submit", done: false, active: !!signatureData && agreedRead && agreedLegal },
                ].map((step, i) => (
                  <div key={i} className={`flex items-center gap-3 text-sm ${step.done ? "text-green-600" : step.active ? "text-slate-900 font-medium" : "text-slate-400"}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 border ${step.done ? "bg-green-600 border-green-600 text-white" : step.active ? "bg-slate-900 border-slate-900 text-white" : "border-slate-200"}`}>
                      {step.done ? "✓" : i + 1}
                    </div>
                    {step.label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Signature */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your signature</CardTitle>
              <p className="text-xs text-muted-foreground">Choose how you'd like to sign</p>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue="draw" onValueChange={() => setSignatureData(null)}>
                <TabsList className="w-full rounded-none border-b bg-transparent h-auto p-0">
                  <TabsTrigger value="draw" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-slate-900 data-[state=active]:shadow-none py-2.5 text-xs">
                    <Pen className="h-3.5 w-3.5 mr-1" /> Draw
                  </TabsTrigger>
                  <TabsTrigger value="type" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-slate-900 data-[state=active]:shadow-none py-2.5 text-xs">
                    <Type className="h-3.5 w-3.5 mr-1" /> Type
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="draw" className="p-4 mt-0">
                  <SignatureCanvas onSignatureChange={setSignatureData} />
                </TabsContent>
                <TabsContent value="type" className="p-4 mt-0">
                  <TypedSignature onSignatureChange={setSignatureData} />
                </TabsContent>
              </Tabs>

              <Separator />

              {/* Agreements */}
              <div className="p-4 space-y-3">
                <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                  <Checkbox checked={agreedRead} onCheckedChange={(c) => setAgreedRead(!!c)} className="mt-0.5" />
                  <span>I have read and understood all terms in this offer letter</span>
                </label>
                <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                  <Checkbox checked={agreedLegal} onCheckedChange={(c) => setAgreedLegal(!!c)} className="mt-0.5" />
                  <span>I agree this electronic signature is legally binding</span>
                </label>
              </div>

              {/* Actions */}
              <div className="p-4 pt-0 space-y-2">
                <Button
                  className="w-full"
                  size="lg"
                  disabled={!canSign || submitMutation.isPending || !!isExpired}
                  onClick={() => submitMutation.mutate()}
                >
                  {submitMutation.isPending ? (
                    <><Clock className="h-4 w-4 mr-2 animate-spin" /> Signing…</>
                  ) : (
                    <><CheckCircle className="h-4 w-4 mr-2" /> Sign & Accept Offer</>
                  )}
                </Button>

                {!confirmDecline ? (
                  <button
                    className="w-full text-center text-xs text-red-500 hover:underline py-2"
                    onClick={() => setConfirmDecline(true)}
                  >
                    Decline this offer
                  </button>
                ) : (
                  <div className="border border-red-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium text-red-600">Are you sure you want to decline?</p>
                    <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 text-xs"
                        disabled={declineMutation.isPending}
                        onClick={() => declineMutation.mutate()}
                      >
                        {declineMutation.isPending ? "Declining…" : "Yes, decline"}
                      </Button>
                      <Button size="sm" variant="ghost" className="flex-1 text-xs" onClick={() => setConfirmDecline(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-center text-muted-foreground pb-3 px-4">
                This document is electronically signed and legally binding.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
