import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, BookOpen, FileText, ChevronRight, ThumbsUp, 
  Laptop, Users, Building, CreditCard, Truck, Phone, 
  Globe, Shield, HelpCircle, ArrowRight
} from "lucide-react";
import { Link } from "wouter";

const categories = [
  { id: "it", name: "IT & Systems", icon: Laptop, color: "text-blue-600", bg: "bg-blue-50", description: "TAI TMS, Truckstop, Teams Phone & VPN" },
  { id: "hr", name: "HR & Benefits", icon: Users, color: "text-purple-600", bg: "bg-purple-50", description: "Onboarding, Commissions, Policy" },
  { id: "ops", name: "Brokerage Ops", icon: Truck, color: "text-orange-600", bg: "bg-orange-50", description: "Carrier Vetting, Load Booking, claims" },
  { id: "finance", name: "Finance", icon: CreditCard, color: "text-green-600", bg: "bg-green-50", description: "Carrier Pay, Factoring, Expenses" },
];

const articles = {
  it: [
    { id: "reset-tai-tms-password", title: "Resetting your TAI TMS Password", views: 450, time: "2 min read" },
    { id: "truckstop-connectivity", title: "Truckstop & 123 Loadboard Connectivity Issues", views: 320, time: "4 min read" },
    { id: "teams-phone-setup", title: "Setting up Teams Phone for VOIP Calls", views: 210, time: "5 min read" },
    { id: "vpn-access-remote", title: "Connecting VPN Extensions (Windscribe & Proton)", views: 180, time: "3 min read" },
    { id: "m365-setup", title: "Microsoft 365 & Outlook Setup Guide", views: 560, time: "6 min read" },
    { id: "teams-internal", title: "Using Microsoft Teams for Internal Comms", views: 430, time: "4 min read" },
  ],
  hr: [
    { id: "commission-schedule-2026", title: "Broker Commission Pay Schedule 2026", views: 890, time: "2 min read" },
    { id: "health-enrollment", title: "Health Insurance: Open Enrollment Guide", views: 560, time: "10 min read" },
    { id: "referral-bonus", title: "Referral Bonus Program for Carrier Sales", views: 340, time: "1 min read" },
    { id: "pto-policy", title: "PTO Policy for Commissioned Staff", views: 410, time: "3 min read" },
  ],
  ops: [
    { id: "carrier-vetting-rmis", title: "Carrier Vetting Protocol (RMIS Integration)", views: 720, time: "6 min read" },
    { id: "freight-claims", title: "Handling Freight Claims & OS&D", views: 550, time: "8 min read" },
    { id: "cold-chain-sop", title: "Standard Operating Procedures: Cold Chain", views: 300, time: "5 min read" },
    { id: "after-hours", title: "After-Hours Dispatch Procedures", views: 480, time: "4 min read" },
  ],
  finance: [
    { id: "quickpay-invoices", title: "Submitting Carrier Invoices for QuickPay", views: 670, time: "3 min read" },
    { id: "entertainment-expense", title: "Client Entertainment Expense Guidelines", views: 290, time: "4 min read" },
    { id: "factoring-notices", title: "Understanding Factoring Notices", views: 330, time: "5 min read" },
    { id: "credit-checks", title: "Credit Check Process for New Shippers", views: 510, time: "2 min read" },
  ]
};

export default function KnowledgeBase() {
  return (
    <Layout>
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/it-support">
            <Button variant="ghost" className="pl-0 text-muted-foreground hover:text-foreground">
              ← Back to IT Support
            </Button>
          </Link>
        </div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Knowledge Base</h1>
        <p className="text-slate-500 mt-1">eHire / Help Center</p>
      </div>

      {/* Hero Search Section */}
      <div className="bg-slate-900 rounded-2xl p-10 text-white text-center relative overflow-hidden mb-10 shadow-xl">
        <div className="relative z-10 max-w-2xl mx-auto">
          <Badge className="bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 border-blue-500/50 mb-4">eHire Support</Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-6">How can we support your brokerage today?</h2>
          <div className="relative">
            <Search className="absolute left-4 top-4 h-5 w-5 text-slate-400" />
            <Input 
              placeholder="Search articles (e.g., 'Commission calculation', 'TAI TMS login', 'Carrier setup')..." 
              className="pl-12 h-14 bg-white text-slate-900 placeholder:text-slate-400 border-none shadow-lg text-lg rounded-xl"
            />
          </div>
          <div className="flex justify-center gap-4 mt-6 text-sm text-slate-400">
            <span>Popular:</span>
            <span className="text-white border-b border-white/30 cursor-pointer hover:text-blue-300 transition-colors">Broker Commissions</span>
            <span className="text-white border-b border-white/30 cursor-pointer hover:text-blue-300 transition-colors">Carrier Setup</span>
            <span className="text-white border-b border-white/30 cursor-pointer hover:text-blue-300 transition-colors">TMS Issues</span>
          </div>
        </div>
        
        {/* Abstract Background Shapes */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-3xl"></div>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {categories.map((cat) => (
          <Card key={cat.id} className="hover:shadow-lg transition-all cursor-pointer group border-slate-200">
            <CardContent className="p-6">
              <div className={`w-12 h-12 rounded-xl ${cat.bg} ${cat.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <cat.icon className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-lg text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{cat.name}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{cat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Articles Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Tabs defaultValue="it" className="w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-900">Featured Articles</h2>
              <TabsList>
                <TabsTrigger value="it">IT & Systems</TabsTrigger>
                <TabsTrigger value="ops">Operations</TabsTrigger>
                <TabsTrigger value="hr">HR & Pay</TabsTrigger>
                <TabsTrigger value="finance">Finance</TabsTrigger>
              </TabsList>
            </div>

            {Object.entries(articles).map(([key, items]) => (
              <TabsContent key={key} value={key} className="mt-0">
                <div className="grid gap-4">
                  {items.map((article, index) => (
                    <Link key={index} href={`/help-center/article/${article.id}`}>
                      <Card className="hover:border-blue-300 transition-colors cursor-pointer group">
                        <CardContent className="p-5 flex justify-between items-center">
                          <div className="flex gap-4">
                            <div className="mt-1 text-slate-300 group-hover:text-blue-500 transition-colors">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-800 text-base mb-1 group-hover:text-blue-700 transition-colors">{article.title}</h3>
                              <div className="flex items-center gap-3 text-xs text-slate-500">
                                <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {article.time}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {article.views} found helpful</span>
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
                <div className="mt-6 text-center">
                  <Button variant="outline" className="gap-2">
                    View All {categories.find(c => c.id === key)?.name} Articles <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          {/* Need more help banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-white rounded-full shadow-sm text-blue-600">
                <HelpCircle className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900">Still can't find what you need?</h3>
                <p className="text-slate-500">Our support team is ready to assist you directly.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Link href="/it-support">
                <Button variant="outline" className="bg-white">Open Ticket</Button>
              </Link>
              <Button>Contact Support</Button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="font-medium">TAI TMS</span>
                </div>
                <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">Operational</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="font-medium">Truckstop & 123 Loadboard</span>
                </div>
                <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">Operational</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  <span className="font-medium">Teams Phone (VOIP)</span>
                </div>
                <Badge variant="outline" className="text-yellow-600 bg-yellow-50 border-yellow-200">Degraded</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="font-medium">M365 & Outlook</span>
                </div>
                <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">Operational</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-400" />
                Security Tip
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                Be aware of double-brokering scams. Always verify carrier MC# and contact info in RMIS before booking a load.
              </p>
              <Button variant="secondary" size="sm" className="w-full">Read Security Guidelines</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}