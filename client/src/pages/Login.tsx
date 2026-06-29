import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth, parseApiError } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Building2, Mail, Loader2, Shield, KeyRound } from "lucide-react";

type FlowStep = "standard" | "break_password" | "break_totp_setup" | "break_totp_verify";

// Microsoft logo for SSO button
function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, refreshUser, user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  const [flowStep, setFlowStep] = useState<FlowStep>("standard");
  const [bgTemp, setBgTemp] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCodesDialog, setRecoveryCodesDialog] = useState<string[] | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [noAccountDialogOpen, setNoAccountDialogOpen] = useState(false);

  // Check if Microsoft SSO is enabled
  const { data: ssoConfig } = useQuery<{ enabled: boolean; tenantId: string }>({
    queryKey: ["/api/auth/microsoft/config"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/auth/microsoft/config");
        return res.json();
      } catch {
        return { enabled: false, tenantId: "" };
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  const ssoEnabled = ssoConfig?.enabled ?? false;

  // Handle SSO error from redirect query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ssoError = params.get("sso_error");
    if (ssoError === "no_account") {
      setNoAccountDialogOpen(true);
      setSsoLoading(false);
      window.history.replaceState({}, "", "/login");
      return;
    }
    const error = params.get("error");
    if (error) {
      toast.error(decodeURIComponent(error));
      setSsoLoading(false);
      // Clean URL
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (!authLoading && user) {
      setLocation("/dashboard");
    }
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (flowStep !== "break_totp_setup" || !bgTemp) return;
    let cancelled = false;
    setSetupLoading(true);
    setQrDataUrl("");
    (async () => {
      try {
        const res = await fetch("/api/auth/break-glass/totp-setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tempToken: bgTemp }),
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(parseApiError(data));
        if (!cancelled) setQrDataUrl(data.qrDataUrl || "");
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load QR code");
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flowStep, bgTemp]);

  function resetBreakGlassFlow() {
    setFlowStep("standard");
    setBgTemp("");
    setQrDataUrl("");
    setNewPassword("");
    setConfirmPassword("");
    setTotpCode("");
    setRecoveryCode("");
    setUseRecovery(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setLoading(true);
    try {
      const result = await login(email.trim(), password);
      if (result.status === "break_glass") {
        setBgTemp(result.tempToken);
        if (result.pending === "password_change") setFlowStep("break_password");
        else if (result.pending === "totp_enroll") setFlowStep("break_totp_setup");
        else setFlowStep("break_totp_verify");
        toast.message("Additional security required", {
          description: "Complete the steps below for the break-glass admin account.",
        });
        return;
      }
      toast.success("Welcome back!");
      setLocation("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleBreakGlassSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/break-glass/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken: bgTemp, newPassword }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(parseApiError(data));
      setNewPassword("");
      setConfirmPassword("");
      await refreshUser();
      toast.success("Password updated. You are now signed in.");
      resetBreakGlassFlow();
      setLocation("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setLoading(false);
    }
  }

  async function handleBreakGlassConfirmTotp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/break-glass/totp-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken: bgTemp, code: totpCode.replace(/\s/g, "") }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(parseApiError(data));
      await refreshUser();
      toast.success("Authenticator enabled.");
      if (Array.isArray(data.recoveryCodes) && data.recoveryCodes.length > 0) {
        setRecoveryCodesDialog(data.recoveryCodes as string[]);
      } else {
        resetBreakGlassFlow();
        setLocation("/dashboard");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  async function handleBreakGlassVerifyTotp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/break-glass/totp-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tempToken: bgTemp,
          code: useRecovery ? "" : totpCode.replace(/\s/g, ""),
          recoveryCode: useRecovery ? recoveryCode.trim().toUpperCase() : undefined,
        }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(parseApiError(data));
      await refreshUser();
      toast.success("Welcome back!");
      resetBreakGlassFlow();
      setLocation("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  function handleMicrosoftLogin() {
    setSsoLoading(true);
    // Redirect to backend SSO endpoint (full page redirect)
    window.location.href = "/api/auth/microsoft/login";
  }

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Don't render login form if already logged in (will redirect)
  if (user) {
    return null;
  }

  const ssoConfigLoading = ssoConfig === undefined;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-6 pb-8 bg-gradient-to-b from-muted/50 to-muted/20 px-4">
      {/* justify-start + pt-6: top-aligned to avoid large empty space from vertical centering */}
      <div className="w-full max-w-[400px] space-y-0">
        {/* Logo only */}
        <div className="flex justify-center">
          <CompanyLogo variant="dark" alt="LDP Logistics" className="h-40 w-auto max-w-[420px] object-contain" />
        </div>

        <Card className="border-border shadow-lg overflow-hidden -mt-1">
          <CardHeader className="pb-4">
            <CardTitle className="font-display text-lg">
              {flowStep === "standard" ? "Log in" : "Break-glass admin security"}
            </CardTitle>
            <CardDescription>
              {flowStep === "standard"
                ? "Use your work account or email and password."
                : "Baseline admin account: set a strong password to continue."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {flowStep !== "standard" && (
              <Button type="button" variant="ghost" size="sm" className="px-0 h-auto text-muted-foreground" onClick={resetBreakGlassFlow}>
                ← Back to sign in
              </Button>
            )}

            {flowStep === "standard" && (
            <>
            {/* Microsoft SSO — always visible, enabled when config says so */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <Building2 className="h-3.5 w-3.5" />
                Organizational account
              </div>
              {ssoConfigLoading ? (
                <div className="flex items-center justify-center gap-2 h-11 rounded-md border border-dashed border-border bg-muted/30 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking sign-in options…
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 gap-3 font-medium bg-background hover:bg-muted/50 border-2 border-muted-foreground/20"
                  onClick={handleMicrosoftLogin}
                  disabled={ssoLoading || loading || !ssoEnabled}
                >
                  {ssoLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                  ) : (
                    <MicrosoftIcon className="h-5 w-5 shrink-0" />
                  )}
                  Sign in with Microsoft
                </Button>
              )}
              {!ssoConfigLoading && !ssoEnabled && (
                <p className="text-xs text-muted-foreground text-center">
                  Microsoft sign-in is not configured. Use email below.
                </p>
              )}
            </div>

            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground whitespace-nowrap">
                or
              </span>
            </div>

            {/* Email / password form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <Mail className="h-3.5 w-3.5" />
                Email and password
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="bg-background"
                  disabled={loading || ssoLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="bg-background"
                  disabled={loading || ssoLoading}
                />
              </div>
              <Button type="submit" className="w-full h-11" disabled={loading || ssoLoading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Signing in…
                  </>
                ) : (
                  "Sign in with email"
                )}
              </Button>
            </form>
            </>
            )}

            {flowStep === "break_password" && (
              <form onSubmit={handleBreakGlassSetPassword} className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <KeyRound className="h-3.5 w-3.5" />
                  Set a new password
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum 16 characters, with uppercase, lowercase, number, and symbol.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="bg-new-pw">New password</Label>
                  <Input
                    id="bg-new-pw"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bg-confirm-pw">Confirm password</Label>
                  <Input
                    id="bg-confirm-pw"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
                </Button>
              </form>
            )}

            {flowStep === "break_totp_setup" && (
              <form onSubmit={handleBreakGlassConfirmTotp} className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Shield className="h-3.5 w-3.5" />
                  Authenticator app
                </div>
                <p className="text-xs text-muted-foreground">
                  Scan the QR in Google Authenticator, Authy, or Microsoft Authenticator, then enter the 6-digit code.
                </p>
                <div className="flex justify-center rounded-lg border bg-muted/30 p-4 min-h-[160px] items-center">
                  {setupLoading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : qrDataUrl ? (
                    <img src={qrDataUrl} alt="QR code for TOTP" className="max-w-[200px] h-auto" />
                  ) : (
                    <span className="text-sm text-muted-foreground">Could not load QR</span>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bg-totp">6-digit code</Label>
                  <Input
                    id="bg-totp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    disabled={loading}
                    maxLength={6}
                  />
                </div>
                <Button type="submit" className="w-full h-11" disabled={loading || totpCode.length !== 6}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & finish"}
                </Button>
              </form>
            )}

            {flowStep === "break_totp_verify" && (
              <form onSubmit={handleBreakGlassVerifyTotp} className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Shield className="h-3.5 w-3.5" />
                  Two-step verification
                </div>
                {!useRecovery ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="bg-verify-totp">Authenticator code</Label>
                      <Input
                        id="bg-verify-totp"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        disabled={loading}
                        maxLength={6}
                      />
                    </div>
                    <Button type="button" variant="link" className="px-0 h-auto text-xs" onClick={() => setUseRecovery(true)}>
                      Use a recovery code instead
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="bg-recovery">Recovery code</Label>
                      <Input
                        id="bg-recovery"
                        autoComplete="off"
                        placeholder="One-time backup code"
                        value={recoveryCode}
                        onChange={(e) => setRecoveryCode(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                    <Button type="button" variant="link" className="px-0 h-auto text-xs" onClick={() => setUseRecovery(false)}>
                      Use authenticator code
                    </Button>
                  </>
                )}
                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={
                    loading ||
                    (!useRecovery && totpCode.length !== 6) ||
                    (useRecovery && !recoveryCode.trim())
                  }
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-0">
            <p className="text-sm text-muted-foreground text-center">
              Need access? Ask your administrator to create your account.
            </p>
          </CardFooter>
        </Card>
      </div>

      <Dialog open={noAccountDialogOpen} onOpenChange={setNoAccountDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>No account found</DialogTitle>
            <DialogDescription>
              This Microsoft email is not linked to an employee work email in eHire. No user account was created.
              Please contact HR if you believe this is a mistake.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setNoAccountDialogOpen(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!recoveryCodesDialog?.length} onOpenChange={(open) => !open && recoveryCodesDialog && setRecoveryCodesDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save your recovery codes</DialogTitle>
            <DialogDescription>
              Each code works once if you lose your phone. Store them in a password manager or safe — they will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <ul className="font-mono text-sm space-y-1 max-h-48 overflow-y-auto rounded-md border bg-muted/40 p-3">
            {recoveryCodesDialog?.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (recoveryCodesDialog) void navigator.clipboard.writeText(recoveryCodesDialog.join("\n"));
                toast.success("Copied to clipboard");
              }}
            >
              Copy all
            </Button>
            <Button
              type="button"
              onClick={() => {
                setRecoveryCodesDialog(null);
                resetBreakGlassFlow();
                setLocation("/dashboard");
              }}
            >
              I have saved these
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
