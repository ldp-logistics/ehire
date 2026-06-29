import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, Calendar, Eye, ThumbsUp, ThumbsDown, 
  Share2, Printer, CheckCircle2, AlertTriangle, Info 
} from "lucide-react";
import { Link, useRoute } from "wouter";

// Mock Data Store for Articles
const articleDatabase: Record<string, any> = {
  "reset-tai-tms-password": {
    title: "Resetting your TAI TMS Password",
    category: "IT & Systems",
    author: "IT Support Team",
    lastUpdated: "Oct 12, 2025",
    views: 450,
    content: (
      <div className="space-y-6 text-slate-700 leading-relaxed">
        <p>If you are unable to log in to TAI TMS, follow these steps to reset your password securely.</p>
        
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
          <h4 className="flex items-center gap-2 font-bold text-blue-800 mb-1">
            <Info className="h-4 w-4" /> Note
          </h4>
          <p className="text-sm text-blue-700">Your TAI TMS password expires every 90 days for security compliance.</p>
        </div>

        <h3 className="text-xl font-bold text-slate-900 mt-6">Step 1: Access the Reset Portal</h3>
        <p>Navigate to the TAI TMS login screen and click on the "Forgot Password?" link located just below the credential fields.</p>

        <h3 className="text-xl font-bold text-slate-900 mt-6">Step 2: Verify Identity</h3>
        <p>Enter your corporate email address (username@ldplogistics.com). You will receive a 6-digit verification code via email within 2 minutes.</p>

        <h3 className="text-xl font-bold text-slate-900 mt-6">Step 3: Create New Password</h3>
        <ul className="list-disc pl-6 space-y-2">
          <li>Must be at least 12 characters long.</li>
          <li>Must contain one uppercase letter, one number, and one special character (!@#$%).</li>
          <li>Cannot be one of your last 5 passwords.</li>
        </ul>

        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mt-6">
          <h4 className="flex items-center gap-2 font-bold text-yellow-800 mb-1">
            <AlertTriangle className="h-4 w-4" /> Account Locked?
          </h4>
          <p className="text-sm text-yellow-700">If you have attempted to login 5 times unsuccessfully, your account is locked. Please submit a Service Desk ticket to unlock it before resetting your password.</p>
        </div>
      </div>
    )
  },
  "vpn-access-remote": {
    title: "Connecting VPN Extensions (Windscribe & Proton)",
    category: "IT & Systems",
    author: "Network Security",
    lastUpdated: "Jan 05, 2026",
    views: 180,
    content: (
      <div className="space-y-6 text-slate-700 leading-relaxed">
        <p>For accessing certain carrier sites or load boards from international locations or unsecured networks, we recommend using our approved VPN browser extensions.</p>

        <h3 className="text-xl font-bold text-slate-900 mt-6">Option 1: Windscribe (Free Tier)</h3>
        <ol className="list-decimal pl-6 space-y-2">
          <li>Install the Windscribe extension from the Chrome Web Store.</li>
          <li>Create a free account using your personal email (do not use corporate email for 3rd party free tools).</li>
          <li>Select "US Central" or "US East" as your location to ensure optimal latency with our TMS.</li>
        </ol>

        <h3 className="text-xl font-bold text-slate-900 mt-6">Option 2: Proton VPN</h3>
        <p>Proton VPN offers a robust free tier with unlimited data, suitable for heavy load board usage.</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Download the Proton VPN client for Windows/Mac.</li>
          <li>Login and click "Quick Connect" to find the fastest secure server.</li>
        </ul>

        <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg mt-4">
          <h4 className="flex items-center gap-2 font-bold text-green-800 mb-1">
            <CheckCircle2 className="h-4 w-4" /> Recommended
          </h4>
          <p className="text-sm text-green-700">Always disconnect the VPN when accessing TAI TMS directly to prevent IP flagging.</p>
        </div>
      </div>
    )
  },
  "teams-phone-setup": {
    title: "Setting up Teams Phone for VOIP Calls",
    category: "IT & Systems",
    author: "IT Support",
    lastUpdated: "Dec 20, 2025",
    views: 210,
    content: (
      <div className="space-y-6 text-slate-700 leading-relaxed">
        <p>LDP Logistics has transitioned to Microsoft Teams Phone for all internal and external calling. This guide will help you configure your headset and voicemail.</p>
        
        <h3 className="text-xl font-bold text-slate-900">Configuring Audio Devices</h3>
        <p>1. Open Teams and click on the three dots (...) next to your profile picture.</p>
        <p>2. Go to <strong>Settings &gt; Devices</strong>.</p>
        <p>3. Under "Audio devices", select your headset (e.g., Jabra Evolve or Poly Blackwire).</p>
        <p>4. Make a "Test Call" to ensure your microphone and speakers are working clearly.</p>

        <h3 className="text-xl font-bold text-slate-900 mt-6">Setting up Voicemail</h3>
        <p>Navigate to <strong>Settings &gt; Calls &gt; Configure Voicemail</strong>. Click "Record a greeting" to personalize your message. Standard professional greeting script:</p>
        <div className="bg-slate-100 p-4 rounded italic text-slate-600 border border-slate-200">
          "Hi, you've reached [Your Name] at LDP Logistics. I'm currently assisting another carrier or shipper. Please leave your name, load reference number, and phone number, and I'll return your call shortly."
        </div>
      </div>
    )
  },
  "carrier-vetting-rmis": {
    title: "Carrier Vetting Protocol (RMIS Integration)",
    category: "Brokerage Ops",
    author: "Compliance Team",
    lastUpdated: "Jan 10, 2026",
    views: 720,
    content: (
      <div className="space-y-6 text-slate-700 leading-relaxed">
        <p>All new carriers must be vetted through our RMIS integration before a load can be booked. This ensures compliance with insurance and safety standards.</p>

        <h3 className="text-xl font-bold text-slate-900">The 4-Point Check</h3>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Authority Age:</strong> Carrier MC must be active for at least 6 months.</li>
          <li><strong>Safety Rating:</strong> Must not have a "Conditional" or "Unsatisfactory" rating on SAFER.</li>
          <li><strong>Insurance:</strong> Minimum $100k Cargo and $1M Liability coverage verified.</li>
          <li><strong>Fraud Check:</strong> Verify the dispatcher's phone number matches the FMCSA record or 411 directory.</li>
        </ul>

        <div className="bg-red-50 border border-red-200 p-4 rounded-lg mt-6">
          <h4 className="flex items-center gap-2 font-bold text-red-800 mb-1">
            <AlertTriangle className="h-4 w-4" /> Critical Warning
          </h4>
          <p className="text-sm text-red-700">Do not override a "Rejected" status in RMIS without written approval from the Carrier Sales Manager.</p>
        </div>
      </div>
    )
  },
  "commission-schedule-2026": {
    title: "Broker Commission Pay Schedule 2026",
    category: "HR & Benefits",
    author: "Payroll Dept",
    lastUpdated: "Jan 02, 2026",
    views: 890,
    content: (
      <div className="space-y-6 text-slate-700 leading-relaxed">
        <p>Commissions are paid out on the second pay period of each month, based on the margin of loads <strong>delivered and invoiced</strong> in the previous month.</p>

        <h3 className="text-xl font-bold text-slate-900">Commission Tiers</h3>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="p-3 font-medium">Monthly Margin</th>
                <th className="p-3 font-medium">Commission %</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr><td className="p-3">$0 - $10,000</td><td className="p-3">10%</td></tr>
              <tr><td className="p-3">$10,001 - $25,000</td><td className="p-3">12%</td></tr>
              <tr><td className="p-3">$25,001+</td><td className="p-3">15%</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-slate-500">* Draw balance must be cleared before commissions are paid out.</p>
      </div>
    )
  },
  // Default fallback for any other ID
  "default": {
    title: "Article Not Found",
    category: "Help Center",
    author: "System",
    lastUpdated: "Today",
    views: 0,
    content: (
      <div className="text-center py-10">
        <h3 className="text-lg font-medium text-slate-900">Content Under Review</h3>
        <p className="text-slate-500">This article is currently being updated by our documentation team. Please check back later.</p>
      </div>
    )
  }
};

export default function ArticleView() {
  const [match, params] = useRoute("/help-center/article/:slug");
  const slug = params?.slug || "default";
  const article = articleDatabase[slug] || articleDatabase["default"];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/help-center">
            <Button variant="ghost" className="pl-0 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Knowledge Base
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Article Content */}
          <div className="lg:col-span-8">
            <div className="mb-6">
              <Badge variant="outline" className="mb-3 bg-blue-50 text-blue-700 border-blue-200">{article.category}</Badge>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 leading-tight mb-4">
                {article.title}
              </h1>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                    {article.author.charAt(0)}
                  </div>
                  {article.author}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Updated {article.lastUpdated}
                </span>
              </div>
            </div>

            <Card className="border-none shadow-sm overflow-hidden">
               {/* Decorative top border */}
               <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-purple-500 to-orange-500"></div>
              <CardContent className="p-8 bg-white min-h-[400px]">
                {article.content}
              </CardContent>
            </Card>

            <div className="mt-8 flex items-center justify-between p-6 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-sm font-medium text-slate-700">Was this article helpful?</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2 hover:text-green-600 hover:border-green-200 hover:bg-green-50">
                  <ThumbsUp className="h-4 w-4" /> Yes
                </Button>
                <Button variant="outline" size="sm" className="gap-2 hover:text-red-600 hover:border-red-200 hover:bg-red-50">
                  <ThumbsDown className="h-4 w-4" /> No
                </Button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            <Card>
              <CardContent className="p-5">
                <h3 className="font-bold text-slate-900 mb-4">Quick Actions</h3>
                <div className="space-y-3">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <Printer className="h-4 w-4" /> Print Article
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <Share2 className="h-4 w-4" /> Share Link
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-blue-600 text-white border-none">
              <CardContent className="p-6">
                 <h3 className="font-bold text-lg mb-2">Still need help?</h3>
                 <p className="text-blue-100 text-sm mb-4">If this didn't solve your issue, our IT team is standing by.</p>
                 <Link href="/it-support">
                   <Button variant="secondary" className="w-full">Open Support Ticket</Button>
                 </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}