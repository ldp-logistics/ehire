import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from 'recharts';
import { Star, TrendingUp, Award, Target, Grid3X3, Users, BarChart, Sparkles, BrainCircuit } from "lucide-react";
import { useStore, PerformanceReview } from "@/store/useStore";
import { Badge } from "@/components/ui/badge";

const performanceData = [
  { subject: 'Technical', A: 120, B: 110, fullMark: 150 },
  { subject: 'Communication', A: 98, B: 130, fullMark: 150 },
  { subject: 'Leadership', A: 86, B: 130, fullMark: 150 },
  { subject: 'Reliability', A: 99, B: 100, fullMark: 150 },
  { subject: 'Initiative', A: 85, B: 90, fullMark: 150 },
  { subject: 'Teamwork', A: 65, B: 85, fullMark: 150 },
];

export default function Performance() {
  const { employees, reviews } = useStore();

  return (
    <Layout>
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Performance Management</h1>
          <p className="text-muted-foreground text-sm">Talent calibration, 360° reviews, and competency mapping.</p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" className="bg-card border-border text-foreground hover:bg-muted">Download Report</Button>
           <Button className="bg-primary text-primary-foreground hover:bg-primary/90">Start New Cycle</Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-8 bg-muted p-1">
          <TabsTrigger value="overview"><BarChart className="h-4 w-4 mr-2" /> Overview</TabsTrigger>
          <TabsTrigger value="reviews"><Users className="h-4 w-4 mr-2" /> Reviews</TabsTrigger>
          <TabsTrigger value="calibration"><Grid3X3 className="h-4 w-4 mr-2" /> 9-Box Calibration</TabsTrigger>
          <TabsTrigger value="ai-insights"><BrainCircuit className="h-4 w-4 mr-2 text-purple-500" /> AI Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            <div className="lg:col-span-2">
              <Card className="border border-border shadow-sm h-full bg-card">
                 <CardHeader>
                  <CardTitle>Team Competency Matrix</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px] w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={performanceData}>
                        <PolarGrid stroke="var(--border)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} axisLine={false} />
                        <Radar name="Team Average" dataKey="B" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                        <Radar name="Top Performers" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                        <Legend />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="bg-gradient-to-br from-purple-600 to-blue-600 text-white border-none shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <Award className="h-8 w-8 text-yellow-300" />
                    <span className="bg-white/20 px-2 py-1 rounded text-xs font-medium">Top Performer</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-1">John Wick</h3>
                  <p className="text-purple-100 text-sm mb-6">Security Specialist</p>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs text-purple-200 uppercase tracking-wider">Rating</p>
                      <p className="text-3xl font-bold flex items-center gap-1">
                        5.0 <Star className="h-4 w-4 fill-yellow-300 text-yellow-300" />
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" className="bg-white text-purple-600 hover:bg-purple-50">View Profile</Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-border shadow-sm bg-card">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-foreground mb-4">Review Cycle Status</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Self Reviews</span>
                        <span className="font-bold text-foreground">98%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 w-[98%]" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Manager Reviews</span>
                        <span className="font-bold text-foreground">72%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 w-[72%]" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Peer Feedback</span>
                        <span className="font-bold text-foreground">45%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 w-[45%]" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="reviews" className="mt-0">
          <Card className="border border-border shadow-sm bg-card">
            <CardHeader>
              <CardTitle>Recent Reviews</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {reviews.map((review) => {
                  const employee = employees.find(e => e.id === review.employeeId);
                  if (!employee) return null;
                  
                  return (
                    <div key={review.id} className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg transition-colors group cursor-pointer border border-transparent hover:border-border">
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage src={employee.avatar} />
                          <AvatarFallback>{employee.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-bold text-foreground">{employee.name}</p>
                          <p className="text-sm text-muted-foreground">{employee.role}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right hidden md:block">
                          <Badge variant="secondary" className={
                            review.status === 'Completed' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                          }>{review.status}</Badge>
                          <p className="text-xs text-muted-foreground mt-1">Due {review.dueDate}</p>
                        </div>
                        <div className="flex items-center gap-1 font-bold text-foreground w-12 justify-end">
                          {review.rating} <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        </div>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calibration" className="mt-0">
          <Card className="border border-border shadow-sm bg-card">
             <CardHeader>
               <div className="flex justify-between items-center">
                 <div>
                   <CardTitle>9-Box Talent Calibration</CardTitle>
                   <CardDescription>Assess employee performance vs. potential.</CardDescription>
                 </div>
                 <div className="flex items-center gap-2">
                   <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <div className="w-3 h-3 bg-green-500/20 border border-green-500/50 rounded-sm"></div> High Priority
                   </div>
                   <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <div className="w-3 h-3 bg-blue-500/20 border border-blue-500/50 rounded-sm"></div> Retain
                   </div>
                 </div>
               </div>
             </CardHeader>
             <CardContent>
               <div className="relative">
                 {/* Axis Labels */}
                 <div className="absolute -left-8 top-0 bottom-8 flex items-center justify-center">
                    <span className="-rotate-90 text-xs font-bold text-muted-foreground tracking-widest uppercase">Potential</span>
                 </div>
                 <div className="absolute bottom-[-24px] left-0 right-0 flex justify-center">
                    <span className="text-xs font-bold text-muted-foreground tracking-widest uppercase">Performance</span>
                 </div>

                 {/* 3x3 Grid */}
                 <div className="grid grid-cols-3 gap-4 h-[600px] border-l border-b border-border p-4">
                   {/* Top Row (High Potential) */}
                   <div className="border border-border rounded-lg p-3 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors">
                      <p className="text-xs font-bold text-muted-foreground mb-2 uppercase">Rough Diamond</p>
                      {/* Potential: High, Performance: Low */}
                   </div>
                   <div className="border border-border rounded-lg p-3 bg-green-500/10 hover:bg-green-500/20 transition-colors">
                      <p className="text-xs font-bold text-muted-foreground mb-2 uppercase">Future Star</p>
                      {/* Potential: High, Performance: Medium */}
                       <div className="flex -space-x-2 overflow-hidden">
                        <Avatar className="border-2 border-background w-8 h-8">
                          <AvatarImage src="https://ui-avatars.com/api/?name=Jane+Doe&background=random" />
                        </Avatar>
                      </div>
                   </div>
                   <div className="border-2 border-blue-500/30 rounded-lg p-3 bg-blue-500/10 hover:bg-blue-500/20 transition-colors shadow-sm">
                      <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-2 uppercase">Star</p>
                      {/* Potential: High, Performance: High */}
                      <div className="flex flex-wrap gap-2">
                        <div className="flex items-center gap-2 bg-background p-1.5 rounded shadow-sm border border-border w-full">
                           <Avatar className="w-6 h-6">
                             <AvatarImage src={employees[1].avatar} />
                           </Avatar>
                           <span className="text-xs font-medium text-foreground">{employees[1].firstName}</span>
                        </div>
                         <div className="flex items-center gap-2 bg-background p-1.5 rounded shadow-sm border border-border w-full">
                           <Avatar className="w-6 h-6">
                             <AvatarImage src={employees[0].avatar} />
                           </Avatar>
                           <span className="text-xs font-medium text-foreground">{employees[0].firstName}</span>
                        </div>
                      </div>
                   </div>

                   {/* Middle Row (Moderate Potential) */}
                   <div className="border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                      <p className="text-xs font-bold text-muted-foreground mb-2 uppercase">Inconsistent</p>
                      {/* Potential: Mod, Performance: Low */}
                   </div>
                   <div className="border border-border rounded-lg p-3 bg-green-500/5 hover:bg-green-500/15 transition-colors">
                      <p className="text-xs font-bold text-muted-foreground mb-2 uppercase">Key Player</p>
                      {/* Potential: Mod, Performance: Medium */}
                       <div className="flex flex-wrap gap-2">
                        <div className="flex items-center gap-2 bg-background p-1.5 rounded shadow-sm border border-border w-full">
                           <Avatar className="w-6 h-6">
                             <AvatarImage src={employees[2].avatar} />
                           </Avatar>
                           <span className="text-xs font-medium text-foreground">{employees[2].firstName}</span>
                        </div>
                      </div>
                   </div>
                   <div className="border border-border rounded-lg p-3 bg-green-500/10 hover:bg-green-500/20 transition-colors">
                      <p className="text-xs font-bold text-muted-foreground mb-2 uppercase">High Performer</p>
                      {/* Potential: Mod, Performance: High */}
                       <div className="flex flex-wrap gap-2">
                        <div className="flex items-center gap-2 bg-background p-1.5 rounded shadow-sm border border-border w-full">
                           <Avatar className="w-6 h-6">
                             <AvatarImage src={employees[3].avatar} />
                           </Avatar>
                           <span className="text-xs font-medium text-foreground">{employees[3].firstName}</span>
                        </div>
                      </div>
                   </div>

                   {/* Bottom Row (Low Potential) */}
                   <div className="border border-red-500/20 rounded-lg p-3 bg-red-500/10 hover:bg-red-500/20 transition-colors">
                      <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-2 uppercase">Risk</p>
                      {/* Potential: Low, Performance: Low */}
                   </div>
                   <div className="border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                      <p className="text-xs font-bold text-muted-foreground mb-2 uppercase">Effective</p>
                      {/* Potential: Low, Performance: Medium */}
                   </div>
                   <div className="border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                      <p className="text-xs font-bold text-muted-foreground mb-2 uppercase">Trusted Pro</p>
                      {/* Potential: Low, Performance: High */}
                       <div className="flex flex-wrap gap-2">
                        <div className="flex items-center gap-2 bg-background p-1.5 rounded shadow-sm border border-border w-full">
                           <Avatar className="w-6 h-6">
                             <AvatarImage src={employees[4].avatar} />
                           </Avatar>
                           <span className="text-xs font-medium text-foreground">{employees[4].firstName}</span>
                        </div>
                      </div>
                   </div>
                 </div>
               </div>
             </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-insights" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card className="border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-600" /> AI Salary Recommendations
                </CardTitle>
                <CardDescription>Based on performance, market benchmarks, and inflation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="p-4 bg-background rounded-lg border border-border flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={employees[1].avatar} />
                      </Avatar>
                      <div>
                        <p className="font-bold text-foreground">Neo Anderson</p>
                        <p className="text-xs text-muted-foreground">Lead Engineer • Tier 1</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-600">+12% Raise</p>
                      <p className="text-xs text-muted-foreground">Recommended</p>
                    </div>
                  </div>
                  <div className="p-4 bg-background rounded-lg border border-border flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={employees[0].avatar} />
                      </Avatar>
                      <div>
                        <p className="font-bold text-foreground">Sarah Connor</p>
                        <p className="text-xs text-muted-foreground">Product Director • Tier 1</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-600">+8% Raise</p>
                      <p className="text-xs text-muted-foreground">Recommended</p>
                    </div>
                  </div>
                </div>
                <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded text-xs text-purple-800 dark:text-purple-300">
                  <strong>Insight:</strong> Top performers in Engineering are currently 15% below market rate. Adjusting salaries now prevents churn risk.
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5 text-blue-600" /> Upskilling Opportunities
                </CardTitle>
                <CardDescription>Targeted training based on competency gaps.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-background rounded-lg border border-border">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-foreground text-sm">Advanced Leadership Workshop</h4>
                    <Badge variant="outline">High Priority</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Target Audience: Senior Managers with low 'People Management' scores.</p>
                  <div className="flex -space-x-2">
                     <Avatar className="border-2 border-background w-6 h-6"><AvatarImage src={employees[2].avatar} /></Avatar>
                     <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-background flex items-center justify-center text-[10px] text-slate-500 font-bold">+3</div>
                  </div>
                </div>

                <div className="p-4 bg-background rounded-lg border border-border">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-foreground text-sm">Cloud Security Cert (CISSP)</h4>
                    <Badge variant="outline">Strategic</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Recommended for Security team to match updated compliance standards.</p>
                  <div className="flex -space-x-2">
                     <Avatar className="border-2 border-background w-6 h-6"><AvatarImage src={employees[4].avatar} /></Avatar>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
