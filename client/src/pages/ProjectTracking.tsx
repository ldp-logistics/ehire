import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Circle, Clock, AlertTriangle, Calendar, ArrowRight, BarChart3, LayoutDashboard, DollarSign, Zap, TrendingUp } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip, Cell } from "recharts";

const costData = [
  // Phase 1: Core Foundation (Nov 20 - Dec 05)
  { id: 1, name: "Project Init & Setup", duration: "3m", cost: 0.85, date: "Nov 20" },
  { id: 2, name: "Tailwind v4 Config", duration: "4m", cost: 1.20, date: "Nov 20" },
  { id: 3, name: "Layout & Sidebar", duration: "8m", cost: 2.15, date: "Nov 21" },
  { id: 4, name: "Dashboard Widgets", duration: "12m", cost: 3.40, date: "Nov 22" },
  { id: 5, name: "Employee List UI", duration: "10m", cost: 2.80, date: "Nov 25" },
  { id: 6, name: "Profile Page Design", duration: "15m", cost: 3.90, date: "Nov 28" },
  { id: 7, name: "Leave Calendar View", duration: "14m", cost: 3.65, date: "Dec 01" },
  { id: 8, name: "Leave Request Modal", duration: "6m", cost: 1.50, date: "Dec 02" },
  { id: 9, name: "Payroll Table UI", duration: "9m", cost: 2.25, date: "Dec 04" },
  { id: 10, name: "Payslip Generator", duration: "11m", cost: 2.95, date: "Dec 05" },
  
  // Phase 2: Talent & Growth (Dec 06 - Dec 20)
  { id: 11, name: "Recruitment Kanban", duration: "18m", cost: 4.50, date: "Dec 06" },
  { id: 12, name: "Drag & Drop Logic", duration: "12m", cost: 3.10, date: "Dec 08" },
  { id: 13, name: "Candidate Modal", duration: "8m", cost: 2.05, date: "Dec 10" },
  { id: 14, name: "Onboarding Checklist", duration: "10m", cost: 2.60, date: "Dec 12" },
  { id: 15, name: "Performance 360", duration: "16m", cost: 4.10, date: "Dec 15" },
  { id: 16, name: "9-Box Grid", duration: "14m", cost: 3.75, date: "Dec 18" },
  { id: 17, name: "Org Chart Visuals", duration: "20m", cost: 5.20, date: "Dec 20" },

  // Phase 3: Financials & AI (Dec 21 - Jan 05)
  { id: 18, name: "Loan Management", duration: "8m", cost: 2.10, date: "Dec 22" },
  { id: 19, name: "Expense Claims", duration: "10m", cost: 2.55, date: "Dec 24" },
  { id: 20, name: "Receipt Upload UI", duration: "5m", cost: 1.30, date: "Dec 26" },
  { id: 21, name: "AI Job Generator", duration: "22m", cost: 5.90, date: "Dec 28" },
  { id: 22, name: "AI Prompt Tuning", duration: "6m", cost: 1.60, date: "Dec 30" },
  { id: 23, name: "Benefits Grid", duration: "12m", cost: 3.05, date: "Jan 02" },
  { id: 24, name: "Insurance Plans", duration: "9m", cost: 2.40, date: "Jan 04" },

  // Phase 4: Culture & Compliance (Jan 06 - Jan 14)
  { id: 25, name: "Whistleblower Form", duration: "7m", cost: 1.90, date: "Jan 06" },
  { id: 26, name: "Anonymous Logic", duration: "5m", cost: 1.25, date: "Jan 06" },
  { id: 27, name: "Kudos Feed", duration: "11m", cost: 2.85, date: "Jan 07" },
  { id: 28, name: "Confetti Effects", duration: "4m", cost: 1.10, date: "Jan 07" },
  { id: 29, name: "LMS Course List", duration: "13m", cost: 3.45, date: "Jan 08" },
  { id: 30, name: "Diversity Charts", duration: "15m", cost: 3.95, date: "Jan 09" },
  { id: 31, name: "Audit Logs Table", duration: "10m", cost: 2.70, date: "Jan 10" },

  // Recent Updates (Jan 11-14)
  { id: 32, name: "Settings Redesign", duration: "16m", cost: 4.25, date: "Jan 11" },
  { id: 33, name: "Career Site Hero", duration: "12m", cost: 3.20, date: "Jan 12" },
  { id: 34, name: "Job Listings UI", duration: "9m", cost: 2.45, date: "Jan 12" },
  { id: 35, name: "MS Teams Integration", duration: "14m", cost: 3.80, date: "Jan 13" },
  { id: 36, name: "Outlook Calendar", duration: "11m", cost: 2.90, date: "Jan 13" },
  { id: 37, name: "Candidate Profile", duration: "25m", cost: 6.50, date: "Jan 14" },
  { id: 38, name: "AI Summary Sheet", duration: "8m", cost: 2.10, date: "Jan 14" },
  { id: 39, name: "Cost Analysis Page", duration: "4m", cost: 1.46, date: "Today" },
];

const phases = [
  {
    name: "Phase 1: Core Foundation",
    status: "Completed",
    progress: 100,
    date: "Nov 20 - Dec 05",
    description: "Essential HRIS modules and system architecture.",
    tasks: [
      { name: "Project Setup & Tailwind v4 Config", status: "Done" },
      { name: "Employee Directory & Profile", status: "Done" },
      { name: "Leave Management System", status: "Done" },
      { name: "Time & Attendance (Biometrics)", status: "Done" },
      { name: "Payroll Processing Engine", status: "Done" },
      { name: "Dark Mode & Theming", status: "Done" }
    ]
  },
  {
    name: "Phase 2: Talent & Growth",
    status: "Completed",
    progress: 100,
    date: "Dec 06 - Dec 20",
    description: "Advanced modules for recruitment and performance.",
    tasks: [
      { name: "Recruitment Pipeline (Kanban)", status: "Done" },
      { name: "Onboarding Checklists", status: "Done" },
      { name: "Performance Reviews (360°)", status: "Done" },
      { name: "9-Box Talent Calibration", status: "Done" },
      { name: "Org Chart Visualization", status: "Done" }
    ]
  },
  {
    name: "Phase 3: Financials & AI",
    status: "Completed",
    progress: 100,
    date: "Dec 21 - Jan 05",
    description: "Financial tools and AI-powered intelligence.",
    tasks: [
      { name: "Loan & Advance Management", status: "Done" },
      { name: "AI Job Description Generator", status: "Done" },
      { name: "AI Performance Insights", status: "Done" },
      { name: "Expense Management", status: "Done" },
      { name: "Benefits Administration", status: "Done" }
    ]
  },
  {
    name: "Phase 4: Culture & Compliance",
    status: "Completed",
    progress: 100,
    date: "Jan 06 - Jan 14",
    description: "Employee engagement and legal compliance modules.",
    tasks: [
      { name: "Whistleblower Portal", status: "Done" },
      { name: "Kudos & Recognition", status: "Done" },
      { name: "Training (LMS)", status: "Done" },
      { name: "Succession Planning", status: "Done" },
      { name: "Diversity Dashboard", status: "Done" },
      { name: "Audit Logs", status: "Done" }
    ]
  }
];

const milestones = [
  { title: "MVP Launch", date: "Dec 20", status: "Completed" },
  { title: "Beta Release (Internal)", date: "Jan 05", status: "Completed" },
  { title: "Full Launch", date: "Jan 14", status: "Ready" },
];

export default function ProjectTracking() {
  const totalTasks = phases.reduce((acc, phase) => acc + phase.tasks.length, 0);
  const completedTasks = phases.reduce((acc, phase) => acc + phase.tasks.filter(t => t.status === "Done").length, 0);
  const overallProgress = Math.round((completedTasks / totalTasks) * 100);

  return (
    <Layout>
      <div className="mb-8">
        <div className="flex items-center gap-2 text-blue-600 mb-2">
          <LayoutDashboard className="h-5 w-5" />
          <span className="font-bold tracking-wide text-xs uppercase">Project Management</span>
        </div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Voyager Implementation Plan</h1>
        <p className="text-slate-500 mt-1">Tracking progress, timelines, and deliverables for the HRIS rollout.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="bg-slate-900 text-white border-none shadow-lg">
          <CardContent className="p-6">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Overall Progress</p>
            <div className="flex items-end gap-2 mb-4">
              <h2 className="text-4xl font-bold">{overallProgress}%</h2>
              <span className="text-sm text-green-400 font-medium mb-1">On Schedule</span>
            </div>
            <Progress value={overallProgress} className="h-2 bg-slate-700" />
            <p className="text-xs text-slate-400 mt-3">{completedTasks} of {totalTasks} tasks completed</p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <Clock className="h-5 w-5" />
              </div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Time Elapsed</p>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">56 Days</h2>
            <p className="text-xs text-slate-500 mt-1">Since project kick-off</p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                <BarChart3 className="h-5 w-5" />
              </div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Modules Built</p>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">30 / 30</h2>
            <p className="text-xs text-slate-500 mt-1">Core & Advanced systems</p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-50 rounded-lg text-green-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Status</p>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Ready</h2>
            <p className="text-xs text-slate-500 mt-1">For Backend Integration</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-blue-200 bg-blue-50/20 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                V1 Refinement Plan
              </CardTitle>
              <CardDescription>Outstanding enhancements to complete the V1 Polish.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 bg-green-100 text-green-700 rounded-full p-1">
                    <CheckCircle2 className="h-3 w-3" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Employee Management (Completed)</h4>
                    <p className="text-xs text-slate-500">Profile editing, Approval workflows, Timeline, Compensation tab.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 bg-green-100 text-green-700 rounded-full p-1">
                    <CheckCircle2 className="h-3 w-3" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Service Desk (Completed)</h4>
                    <p className="text-xs text-slate-500">Ticket management, Knowledge Base, Article viewer.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 bg-green-100 text-green-700 rounded-full p-1">
                    <CheckCircle2 className="h-3 w-3" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Recruitment & ATS (Completed)</h4>
                    <p className="text-xs text-slate-500">Candidate detailed view, Drag-and-drop pipeline polish, Interview scheduling.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 bg-green-100 text-green-700 rounded-full p-1">
                    <CheckCircle2 className="h-3 w-3" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Payroll & Finance (Completed)</h4>
                    <p className="text-xs text-slate-500">Run payroll wizard, Payslip preview, Commission calculation view.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 bg-green-100 text-green-700 rounded-full p-1">
                    <CheckCircle2 className="h-3 w-3" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Time & Attendance (Completed)</h4>
                    <p className="text-xs text-slate-500">Timesheet approval interface, Shift scheduling calendar.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="roadmap" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="roadmap">Roadmap & Phases</TabsTrigger>
              <TabsTrigger value="timeline">Timeline View</TabsTrigger>
              <TabsTrigger value="costs">Cost Analysis</TabsTrigger>
            </TabsList>
            
            <TabsContent value="costs" className="mt-0 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border border-slate-200 shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-green-50 rounded-lg text-green-600">
                        <DollarSign className="h-5 w-5" />
                      </div>
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Project Cost</p>
                    </div>
                    <h2 className="text-3xl font-bold text-slate-900">${costData.reduce((acc, curr) => acc + curr.cost, 0).toFixed(2)}</h2>
                    <p className="text-xs text-slate-500 mt-1">Replit Core & Agent Usage</p>
                  </CardContent>
                </Card>
                
                <Card className="border border-slate-200 shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                        <Zap className="h-5 w-5" />
                      </div>
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Prompts</p>
                    </div>
                    <h2 className="text-3xl font-bold text-slate-900">{costData.length}</h2>
                    <p className="text-xs text-slate-500 mt-1">Agent Interactions</p>
                  </CardContent>
                </Card>

                <Card className="border border-slate-200 shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Avg. Cost / Prompt</p>
                    </div>
                    <h2 className="text-3xl font-bold text-slate-900">${(costData.reduce((acc, curr) => acc + curr.cost, 0) / costData.length).toFixed(2)}</h2>
                    <p className="text-xs text-slate-500 mt-1">Based on current usage</p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Cost Distribution</CardTitle>
                  <CardDescription>Cost incurred per development task/prompt.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={costData}>
                        <XAxis 
                          dataKey="name" 
                          stroke="#888888" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false} 
                          tickFormatter={(value) => value.split(' ')[0]} // Show first word only
                        />
                        <YAxis 
                          stroke="#888888" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false}
                          tickFormatter={(value) => `$${value}`}
                        />
                        <RechartsTooltip 
                          cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-800 text-xs">
                                  <p className="font-bold mb-1 text-sm">{payload[0].payload.name}</p>
                                  <div className="space-y-1">
                                    <p className="flex justify-between gap-4">
                                      <span className="text-slate-400">Cost:</span>
                                      <span className="font-mono text-green-400 font-bold">${payload[0].value}</span>
                                    </p>
                                    <p className="flex justify-between gap-4">
                                      <span className="text-slate-400">Duration:</span>
                                      <span className="font-mono text-white">{payload[0].payload.duration}</span>
                                    </p>
                                    <p className="flex justify-between gap-4">
                                      <span className="text-slate-400">Date:</span>
                                      <span className="font-mono text-slate-300">{payload[0].payload.date}</span>
                                    </p>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                           {costData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.date === 'Today' ? '#22c55e' : '#3b82f6'} />
                            ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Recent Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {costData.slice().reverse().map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 group">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.date === 'Today' ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                            <Zap className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">{item.name}</h4>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span>{item.date}</span>
                              <span>•</span>
                              <span>{item.duration} processing time</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`font-mono font-bold ${item.date === 'Today' ? 'text-green-600' : 'text-slate-900'}`}>${item.cost.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="roadmap" className="mt-0 space-y-6">
              {phases.map((phase, idx) => (
                <Card key={idx} className={`border ${phase.status === 'Completed' ? 'border-green-200 bg-green-50/10' : phase.status === 'In Progress' ? 'border-blue-200 bg-blue-50/10' : 'border-slate-200'}`}>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-lg">{phase.name}</CardTitle>
                          <Badge variant={phase.status === 'Completed' ? 'default' : phase.status === 'In Progress' ? 'secondary' : 'outline'} className={phase.status === 'Completed' ? 'bg-green-600' : ''}>
                            {phase.status}
                          </Badge>
                        </div>
                        <CardDescription>{phase.description}</CardDescription>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-slate-900">{phase.progress}%</span>
                        <p className="text-xs text-slate-500">{phase.date}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4">
                      <Progress value={phase.progress} className={`h-1.5 ${phase.status === 'Completed' ? 'bg-green-100' : 'bg-slate-100'}`} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {phase.tasks.map((task, tIdx) => (
                        <div key={tIdx} className="flex items-center gap-2 text-sm">
                          {task.status === 'Done' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-slate-300 flex-shrink-0" />
                          )}
                          <span className={task.status === 'Done' ? 'text-slate-700' : 'text-slate-400'}>
                            {task.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
            
            <TabsContent value="timeline">
              <Card className="border border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="relative pt-8 pb-4">
                    {/* Month Headers */}
                    <div className="flex border-b border-slate-200 pb-2 mb-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <div className="w-1/3 pl-2">November</div>
                      <div className="w-1/3 pl-2 border-l border-slate-200">December</div>
                      <div className="w-1/3 pl-2 border-l border-slate-200">January</div>
                    </div>

                    {/* Timeline Grid Background */}
                    <div className="absolute inset-0 top-14 bottom-0 flex pointer-events-none">
                      <div className="w-1/6 border-r border-slate-100 h-full"></div>
                      <div className="w-1/6 border-r border-slate-200 h-full"></div> {/* End of Nov */}
                      <div className="w-1/6 border-r border-slate-100 h-full"></div>
                      <div className="w-1/6 border-r border-slate-200 h-full"></div> {/* End of Dec */}
                      <div className="w-1/6 border-r border-slate-100 h-full"></div>
                      <div className="w-1/6 h-full"></div>
                    </div>

                    {/* "Today" Marker - Jan 14th */}
                    <div className="absolute top-10 bottom-0 left-[90%] w-px bg-blue-500 z-10 flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-blue-500 -mt-1"></div>
                      <div className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1 py-0.5 rounded mt-1">Today</div>
                    </div>

                    {/* Timeline Bars */}
                    <div className="space-y-6 relative z-0">
                      {phases.map((phase, idx) => {
                        // Nov 20 - Jan 14 (approx 55 days)
                        // Nov: 10 days (20-30) ~ 18% width
                        // Dec: 31 days ~ 56% width
                        // Jan: 14 days ~ 25% width
                        
                        // Phase 1: Nov 20 - Dec 05 (15 days) -> Start: ~55% of Nov, Width: ~27%
                        // Phase 2: Dec 06 - Dec 20 (15 days) -> Start: ~28% (Dec 6), Width: ~27%
                        // Phase 3: Dec 21 - Jan 05 (16 days) -> Start: ~55% (Dec 21), Width: ~29%
                        // Phase 4: Jan 06 - Jan 14 (9 days) -> Start: ~85% (Jan 6), Width: ~16%
                        
                        let left = "0%";
                        let width = "0%";
                        let color = "bg-slate-200";
                        
                        if (idx === 0) { left = "18%"; width = "27%"; color = "bg-green-500"; }
                        if (idx === 1) { left = "45%"; width = "27%"; color = "bg-green-500"; }
                        if (idx === 2) { left = "72%"; width = "29%"; color = "bg-green-500"; } 
                        if (idx === 3) { left = "90%"; width = "16%"; color = "bg-blue-500 striped-bg"; } // Active

                        return (
                          <div key={idx} className="relative h-12">
                            <div className="absolute top-0 left-0 w-full flex items-center text-sm font-medium text-slate-700 mb-1 z-10">
                              <span className="w-32 truncate mr-4 text-xs font-bold text-slate-500 text-right">{phase.name.split(':')[0]}</span>
                            </div>
                            <div className="ml-36 relative h-8 rounded-md bg-slate-50 w-full overflow-hidden">
                               <div 
                                 className={`absolute top-1 bottom-1 rounded-sm shadow-sm ${color} transition-all hover:opacity-90 cursor-pointer flex items-center px-2`}
                                 style={{ left, width }}
                               >
                                 <span className="text-[10px] font-bold text-white truncate w-full shadow-sm">{phase.name.split(':')[1]}</span>
                               </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="mt-8 flex gap-4 text-xs text-slate-500 justify-center border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> Completed</div>
                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div> In Progress</div>
                    <div className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-300 rounded-sm"></div> Planned</div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Milestones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
                {milestones.map((milestone, idx) => (
                  <div key={idx} className="relative flex items-center gap-4 pl-2">
                    <div className={`z-10 w-10 h-10 rounded-full border-4 border-white shadow-sm flex items-center justify-center flex-shrink-0 ${milestone.status === 'Completed' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase">{milestone.date}</p>
                      <h4 className="font-bold text-slate-900">{milestone.title}</h4>
                      <Badge variant="outline" className="mt-1 text-[10px] h-5">{milestone.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white border-none">
            <CardContent className="p-6">
              <h3 className="font-bold text-lg mb-2">Project Completed</h3>
              <p className="text-indigo-100 text-sm mb-6">
                All modules have been designed and implemented in Phase 3 & 4. Ready for V1 backend integration.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-white/10 p-2 rounded">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-sm font-medium">System Launch Ready</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}