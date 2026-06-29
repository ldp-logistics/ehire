import { useState } from "react";
import { SettingsSubpageLayout } from "@/pages/settings/SettingsSubpageLayout";
import { useAuth, parseApiError } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Shield, RefreshCw, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function BreakGlassAuthenticatorPage() {
  const { user } = useAuth();
  const isBg = user?.isBreakGlassAccount === true;

  const [phase, setPhase] = useState<"idle" | "scan" | "confirm">("idle");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryDialog, setRecoveryDialog] = useState<string[] | null>(null);

  async function startRotate() {
    setLoading(true);
    setQrDataUrl("");
    setTotpCode("");
    try {
      const res = await fetch("/api/auth/break-glass/totp-rotate/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(parseApiError(data));
      setQrDataUrl(data.qrDataUrl || "");
      setPhase("scan");
      toast.message("Scan the new QR", {
        description: "Your old authenticator keeps working until you confirm below.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start rotation");
      setPhase("idle");
    } finally {
      setLoading(false);
    }
  }

  async function confirmRotate(e: React.FormEvent) {
    e.preventDefault();
    if (totpCode.length !== 6) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/break-glass/totp-rotate/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode.replace(/\s/g, "") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(parseApiError(data));
      if (Array.isArray(data.recoveryCodes) && data.recoveryCodes.length > 0) {
        setRecoveryDialog(data.recoveryCodes as string[]);
      }
      setPhase("idle");
      setQrDataUrl("");
      setTotpCode("");
      toast.success("Authenticator rotated. Save your new recovery codes.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  if (!isBg) {
    return (
      <SettingsSubpageLayout title="Break-glass security" description="Restricted">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertTitle>Not available</AlertTitle>
          <AlertDescription className="mt-2">
            This page is only for the baseline break-glass admin account.{" "}
            <Link href="/settings" className="underline font-medium">
              Back to Settings
            </Link>
          </AlertDescription>
        </Alert>
      </SettingsSubpageLayout>
    );
  }

  return (
    <SettingsSubpageLayout
      title="Break-glass security"
      description="Local password for email sign-in and authenticator rotation for the emergency admin account."
    >
      <div className="space-y-6 max-w-lg">
        <BreakGlassLocalPasswordForm />

        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-2">Authenticator</h2>

        <Alert>
          <AlertTitle>How rotation works</AlertTitle>
          <AlertDescription className="mt-2 text-sm space-y-2">
            <p>
              <strong>1.</strong> Start rotation — a <em>new</em> QR appears. Scan it on the phone(s) that should work next.
            </p>
            <p>
              <strong>2.</strong> Enter a 6-digit code from the <em>new</em> entry to confirm. Until then, your <em>old</em> authenticator still works.
            </p>
            <p>
              <strong>3.</strong> After confirm, the old secret stops working and you get <strong>new recovery codes</strong> (save them — old codes are void).
            </p>
          </AlertDescription>
        </Alert>

        {phase === "idle" && (
          <Button type="button" onClick={startRotate} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Rotate authenticator (new QR)
          </Button>
        )}

        {phase === "scan" && (
          <div className="space-y-4 rounded-lg border p-4">
            <p className="text-sm font-medium">Scan with your authenticator app</p>
            <div className="flex justify-center rounded-md bg-muted/40 p-4 min-h-[180px] items-center">
              {loading && !qrDataUrl ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt="New TOTP QR" className="max-w-[200px] h-auto" />
              ) : null}
            </div>
            <form onSubmit={confirmRotate} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="rotate-code">Code from the new entry</Label>
                <Input
                  id="rotate-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  disabled={loading}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={loading || totpCode.length !== 6}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm rotation"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPhase("idle");
                    setQrDataUrl("");
                    setTotpCode("");
                  }}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        <Dialog open={!!recoveryDialog?.length} onOpenChange={(o) => !o && setRecoveryDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New recovery codes</DialogTitle>
              <DialogDescription>
                Previous recovery codes no longer work. Store these safely — they will not be shown again.
              </DialogDescription>
            </DialogHeader>
            <ul className="font-mono text-sm space-y-1 max-h-48 overflow-y-auto rounded-md border bg-muted/40 p-3">
              {recoveryDialog?.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (recoveryDialog) void navigator.clipboard.writeText(recoveryDialog.join("\n"));
                  toast.success("Copied");
                }}
              >
                Copy all
              </Button>
              <Button type="button" onClick={() => setRecoveryDialog(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SettingsSubpageLayout>
  );
}

/** After Microsoft SSO, set or change the password used on the email + password login form. */
function BreakGlassLocalPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(currentPassword.trim() ? { currentPassword: currentPassword } : {}),
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(parseApiError(data));
      toast.success(typeof data.message === "string" ? data.message : "Password saved");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-start gap-2">
        <KeyRound className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="space-y-1 min-w-0">
          <h3 className="font-medium">Local sign-in password</h3>
          <p className="text-sm text-muted-foreground">
            Sign in with Microsoft first, then use this form so you can also use <strong>email + password</strong> on the
            login page. If your account has <em>no</em> local password yet (e.g. you cleared <code className="text-xs">password_hash</code>),
            leave current password empty once.
          </p>
          <p className="text-xs text-muted-foreground">
            Required strength: at least 16 characters with uppercase, lowercase, number, and symbol.
          </p>
        </div>
      </div>
      <form onSubmit={onSubmit} className="space-y-3 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="bg-current-pw">Current password</Label>
          <Input
            id="bg-current-pw"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={busy}
            placeholder="Leave blank if setting for the first time"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bg-new-pw">New password</Label>
          <Input
            id="bg-new-pw"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bg-confirm-pw">Confirm new password</Label>
          <Input
            id="bg-confirm-pw"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={busy}
          />
        </div>
        <Button type="submit" disabled={busy || !newPassword || !confirmPassword}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save local password"}
        </Button>
      </form>
    </div>
  );
}
