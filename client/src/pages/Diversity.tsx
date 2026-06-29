import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Users, Globe, Heart } from "lucide-react";

const genderData = [
  { name: "Male", value: 55, color: "#3b82f6" },
  { name: "Female", value: 42, color: "#ec4899" },
  { name: "Non-Binary", value: 3, color: "#a855f7" },
];

const ethnicityData = [
  { name: "White", value: 45, color: "#94a3b8" },
  { name: "Asian", value: 25, color: "#f59e0b" },
  { name: "Hispanic", value: 15, color: "#ef4444" },
  { name: "Black", value: 10, color: "#10b981" },
  { name: "Other", value: 5, color: "#6366f1" },
];

const leadershipData = [
  { group: "Gender", women: 35, men: 65 },
  { group: "Ethnicity", minority: 28, majority: 72 },
];

export default function Diversity() {
  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-slate-900">Diversity & Inclusion</h1>
        <p className="text-slate-500 text-sm">Real-time demographics and equity tracking.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="border border-slate-200 shadow-sm bg-purple-50 border-purple-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-purple-600" />
              <h3 className="font-bold text-purple-900">Gender Balance</h3>
            </div>
            <p className="text-3xl font-bold text-slate-900">42%</p>
            <p className="text-xs text-purple-700 mt-1">Female Representation</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm bg-blue-50 border-blue-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-blue-900">Global Reach</h3>
            </div>
            <p className="text-3xl font-bold text-slate-900">18</p>
            <p className="text-xs text-blue-700 mt-1">Countries Represented</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm bg-pink-50 border-pink-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="h-5 w-5 text-pink-600" />
              <h3 className="font-bold text-pink-900">Inclusion Score</h3>
            </div>
            <p className="text-3xl font-bold text-slate-900">8.4</p>
            <p className="text-xs text-pink-700 mt-1">Employee Sentiment</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Gender Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genderData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {genderData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Ethnicity Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ethnicityData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={12} width={80} />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                    {ethnicityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Leadership Representation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-700">Women in Leadership</span>
              <span className="font-bold text-slate-900">35%</span>
            </div>
            <Progress value={35} className="h-3 bg-slate-100" />
            <p className="text-xs text-slate-500 mt-1">Target: 40% by 2025</p>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-700">Underrepresented Groups in Leadership</span>
              <span className="font-bold text-slate-900">28%</span>
            </div>
            <Progress value={28} className="h-3 bg-slate-100" />
            <p className="text-xs text-slate-500 mt-1">Target: 30% by 2025</p>
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}
