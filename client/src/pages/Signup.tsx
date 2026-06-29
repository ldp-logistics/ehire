import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyLogo } from "@/components/CompanyLogo";
import { ArrowLeft } from "lucide-react";

/**
 * Self-service signup is disabled. Accounts are created by an administrator (Settings → Users).
 * This page exists so old /signup links show a clear message instead of a broken form.
 */
export default function Signup() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-4">
          <CompanyLogo variant="dark" alt="LDP Logistics" className="h-28 w-auto max-w-[320px] object-contain" />
        </div>

        <Card className="border-border shadow-md">
          <CardHeader>
            <CardTitle className="font-display">Account access</CardTitle>
            <CardDescription>
              New accounts are not created on this page. Your HR or IT administrator can add your login from the admin
              area after you join the organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>If you already have credentials, sign in with your work email or Microsoft account.</p>
          </CardContent>
          <CardFooter>
            <Button variant="default" className="w-full gap-2" asChild>
              <Link href="/login">
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
