import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  XCircle, Clock, Briefcase, MapPin, Calendar,
  DollarSign, FileText, Building2, AlertTriangle, PartyPopper,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Redirect } from "wouter";
import { formatDateTimeDisplay, formatLeaveDisplayDate } from "@/lib/dateUtils";

interface OfferData {
  id: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  department: string | null;
  jobPostingTitle: string;
  location: string | null;
  salary: string;
  salaryCurrency: string | null;
  startDate: string | null;
  employmentType: string | null;
  terms: string | null;
  status: string;
  sentAt: string | null;
  respondedAt: string | null;
  displayTimeZone?: string | null;
  displayDateFormat?: string | null;
  /** When true, same token opens the e-sign flow at `/offer-sign/:token`. */
  hasSigningDocument: boolean;
}

function formatSalary(amount: string, currency: string | null) {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  const formatted = num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `${currency || "USD"} ${formatted}`;
}

function formatEmploymentType(type: string | null) {
  if (!type) return "—";
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function OfferResponse() {
  const { token } = useParams<{ token: string }>();

  const { data: offer, isLoading, error } = useQuery<OfferData>({
    queryKey: [`/api/recruitment/offer-response/${token}`],
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-xl shadow-lg">
          <CardContent className="py-16 text-center">
            <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-4 animate-pulse" />
            <p className="text-muted-foreground">Loading offer details...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-xl shadow-lg">
          <CardContent className="py-16 text-center">
            <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Offer Not Found</h2>
            <p className="text-muted-foreground">
              This offer link is invalid, has expired, or has already been used.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (offer.hasSigningDocument && token) {
    return <Redirect to={`/offer-sign/${token}`} />;
  }

  const isResponded = offer.status !== "sent";
  const isAccepted = offer.status === "accepted";
  const isRejected = offer.status === "rejected";
  const isWithdrawn = offer.status === "withdrawn";
  const displayTz = offer.displayTimeZone ?? undefined;
  const displayDf = offer.displayDateFormat ?? undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Offer Letter</h1>
          <p className="text-muted-foreground">
            Hello <span className="font-medium text-foreground">{offer.candidateName}</span>,
            {isResponded ? " here are the details of your offer." : " please review the offer below."}
          </p>
        </div>

        {!isResponded && (
          <Card className="border-amber-200 bg-amber-50/80 dark:bg-amber-950/20">
            <CardContent className="py-4 text-sm text-amber-950 dark:text-amber-100">
              <p className="font-medium mb-1">Online accept / decline is not available for this offer format.</p>
              <p className="text-muted-foreground dark:text-amber-100/80">
                Please reply to the HR email thread or contact your recruiter for next steps.
              </p>
            </CardContent>
          </Card>
        )}

        {isResponded && (
          <Card className={`border-2 ${isAccepted ? "border-green-300 bg-green-50 dark:bg-green-950/30" : isRejected ? "border-red-300 bg-red-50 dark:bg-red-950/30" : "border-amber-300 bg-amber-50 dark:bg-amber-950/30"}`}>
            <CardContent className="py-4 flex items-center gap-3">
              {isAccepted && <PartyPopper className="h-6 w-6 text-green-600" />}
              {isRejected && <XCircle className="h-6 w-6 text-red-600" />}
              {isWithdrawn && <AlertTriangle className="h-6 w-6 text-amber-600" />}
              <div>
                <p className="font-semibold">
                  {isAccepted && "Offer Accepted"}
                  {isRejected && "Offer Declined"}
                  {isWithdrawn && "Offer Withdrawn"}
                  {!isAccepted && !isRejected && !isWithdrawn && `Status: ${offer.status}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isAccepted && "Congratulations! The HR team will reach out with next steps."}
                  {isRejected && "You have declined this offer. Thank you for your consideration."}
                  {isWithdrawn && "This offer has been withdrawn by the company."}
                </p>
                {offer.respondedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Responded on {formatDateTimeDisplay(offer.respondedAt, displayTz, displayDf)}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-primary" />
                  {offer.jobTitle}
                </CardTitle>
                <CardDescription>Position: {offer.jobPostingTitle}</CardDescription>
              </div>
              <Badge variant="outline" className="shrink-0 capitalize">
                {offer.status.replace(/_/g, " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Department</p>
                  <p className="font-medium">{offer.department || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p className="font-medium">{offer.location || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Salary</p>
                  <p className="font-medium text-lg">{formatSalary(offer.salary, offer.salaryCurrency)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Employment Type</p>
                  <p className="font-medium">{formatEmploymentType(offer.employmentType)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Proposed Start Date</p>
                  <p className="font-medium">{formatLeaveDisplayDate(offer.startDate, displayTz, displayDf)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Offer Sent</p>
                  <p className="font-medium">{formatDateTimeDisplay(offer.sentAt, displayTz, displayDf)}</p>
                </div>
              </div>
            </div>

            {offer.terms && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold text-sm">Terms & Conditions</h3>
                  </div>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded-md p-4">
                    {offer.terms}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pb-4">
          This is a confidential communication. If you received this link by mistake, please disregard it.
        </p>
      </div>
    </div>
  );
}
