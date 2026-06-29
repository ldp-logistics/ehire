import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Plus, BarChart2, Clock, Users, ArrowRight } from "lucide-react";

const activeSurveys = [
  { id: 1, title: "Q4 Employee Satisfaction", responses: 145, total: 200, deadline: "2 days left", status: "Active" },
  { id: 2, title: "Remote Work Preferences", responses: 89, total: 200, deadline: "5 days left", status: "Active" },
  { id: 3, title: "Holiday Party Theme", responses: 190, total: 200, deadline: "Closed", status: "Completed" },
];

const resultData = [
  { name: "Very Satisfied", value: 45, color: "#22c55e" },
  { name: "Satisfied", value: 30, color: "#3b82f6" },
  { name: "Neutral", value: 15, color: "#eab308" },
  { name: "Dissatisfied", value: 10, color: "#f97316" },
];

export default function Surveys() {
  return (
    <Layout>
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Surveys & Polls</h1>
          <p className="text-slate-500 text-sm">Gather feedback and insights from your team.</p>
        </div>
        <Button className="bg-primary text-white hover:bg-blue-700 shadow-sm">
          <Plus className="h-4 w-4 mr-2" /> Create Survey
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Active Surveys</h3>
          {activeSurveys.map((survey) => (
            <Card key={survey.id} className="border border-slate-200 shadow-sm hover:border-blue-300 transition-all cursor-pointer">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-bold text-slate-900 text-lg">{survey.title}</h4>
                    <p className="text-xs text-slate-500 flex items-center mt-1">
                      <Clock className="h-3 w-3 mr-1" /> {survey.deadline}
                    </p>
                  </div>
                  <Badge variant={survey.status === 'Active' ? 'default' : 'secondary'} className={survey.status === 'Active' ? 'bg-green-100 text-green-700 hover:bg-green-200' : ''}>
                    {survey.status}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">{survey.responses} responses</span>
                    <span className="text-slate-900 font-medium">{Math.round((survey.responses / survey.total) * 100)}%</span>
                  </div>
                  <Progress value={(survey.responses / survey.total) * 100} className="h-2" />
                </div>
                
                <div className="mt-6 flex gap-3">
                  <Button variant="outline" size="sm" className="flex-1">Edit Questions</Button>
                  <Button size="sm" className="flex-1 bg-slate-900 text-white">View Results</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          <Card className="border border-slate-200 shadow-sm h-full">
            <CardHeader>
              <CardTitle>Q4 Pulse Check Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={resultData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {resultData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 text-center">
                <p className="text-3xl font-bold text-slate-900">75%</p>
                <p className="text-sm text-slate-500">Positive Sentiment Score</p>
              </div>
              <Button variant="ghost" className="w-full mt-6 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                View Full Report <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
