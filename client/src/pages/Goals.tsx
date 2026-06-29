import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, Plus, Calendar } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const goals = [
  { id: 1, title: "Increase ARR by 20%", owner: "Sarah Connor", type: "Company", progress: 65, status: "On Track", dueDate: "Q4 2025" },
  { id: 2, title: "Launch Mobile App v2", owner: "Neo Anderson", type: "Team", progress: 80, status: "On Track", dueDate: "Q3 2025" },
  { id: 3, title: "Hire 5 Senior Engineers", owner: "Morpheus King", type: "Department", progress: 40, status: "At Risk", dueDate: "Q2 2025" },
  { id: 4, title: "Obtain SOC 2 Certification", owner: "Agent Smith", type: "Company", progress: 90, status: "On Track", dueDate: "Q4 2025" },
];

export default function Goals() {
  return (
    <Layout>
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Goals & OKRs</h1>
          <p className="text-slate-500 text-sm">Align teams with strategic objectives.</p>
        </div>
        <Button className="bg-primary text-white hover:bg-blue-700 shadow-sm">
          <Plus className="h-4 w-4 mr-2" /> Create Goal
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white lg:col-span-2">
          <CardContent className="p-8">
            <div className="flex justify-between items-start mb-8">
              <div>
                <Badge className="bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 border-none mb-2">Company Wide</Badge>
                <h2 className="text-3xl font-bold">Q4 Strategic Initiatives</h2>
              </div>
              <div className="text-right">
                <p className="text-4xl font-bold text-blue-400">68%</p>
                <p className="text-sm text-slate-400">Overall Progress</p>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                 <div className="flex justify-between text-sm mb-2">
                    <span>Revenue Growth</span>
                    <span className="text-blue-200">82%</span>
                 </div>
                 <Progress value={82} className="h-2 bg-slate-700" />
              </div>
              <div>
                 <div className="flex justify-between text-sm mb-2">
                    <span>Customer Expansion</span>
                    <span className="text-blue-200">45%</span>
                 </div>
                 <Progress value={45} className="h-2 bg-slate-700" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>My Objectives</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
               <div className="flex justify-between mb-2">
                 <p className="font-bold text-sm text-slate-900">Complete Leadership Training</p>
                 <span className="text-xs font-bold text-green-600">Done</span>
               </div>
               <Progress value={100} className="h-1.5" />
             </div>
             <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
               <div className="flex justify-between mb-2">
                 <p className="font-bold text-sm text-slate-900">Mentor 2 Juniors</p>
                 <span className="text-xs font-bold text-blue-600">50%</span>
               </div>
               <Progress value={50} className="h-1.5" />
             </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {goals.map((goal) => (
          <Card key={goal.id} className="border border-slate-200 shadow-sm hover:border-blue-300 transition-all cursor-pointer">
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">{goal.type}</Badge>
                  <Badge className={goal.status === 'On Track' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    {goal.status}
                  </Badge>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8"><TrendingUp className="h-4 w-4 text-slate-400" /></Button>
              </div>
              
              <h3 className="font-bold text-lg text-slate-900 mb-2">{goal.title}</h3>
              
              <div className="flex items-center justify-between mt-6 mb-2">
                 <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src="https://github.com/shadcn.png" />
                      <AvatarFallback>CN</AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-slate-500">{goal.owner}</span>
                 </div>
                 <div className="flex items-center gap-1 text-xs text-slate-500">
                   <Calendar className="h-3 w-3" /> {goal.dueDate}
                 </div>
              </div>
              
              <Progress value={goal.progress} className="h-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </Layout>
  );
}
