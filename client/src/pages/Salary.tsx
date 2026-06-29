import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, DollarSign, Briefcase } from "lucide-react";

const salaryData = [
  { role: 'Junior Dev', company: 95000, market: 92000 },
  { role: 'Senior Dev', company: 145000, market: 150000 },
  { role: 'Product Mgr', company: 130000, market: 135000 },
  { role: 'Designer', company: 110000, market: 105000 },
  { role: 'Data Scientist', company: 160000, market: 155000 },
];

export default function Salary() {
  return (
    <Layout>
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Salary Benchmarking</h1>
          <p className="text-slate-500 text-sm">Real-time market compensation analysis.</p>
        </div>
        <Button className="bg-primary text-white hover:bg-blue-700 shadow-sm">
          <TrendingUp className="h-4 w-4 mr-2" /> Update Market Data
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <Card className="border border-slate-200 shadow-sm bg-slate-900 text-white lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-6">
               <h3 className="font-bold text-lg">Compensation vs Market</h3>
               <div className="flex gap-4 text-xs">
                 <span className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded-sm" /> Admani Avg</span>
                 <span className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-500 rounded-sm" /> Market Avg</span>
               </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salaryData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="role" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  />
                  <Bar dataKey="company" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="market" fill="#64748b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <h3 className="font-bold text-slate-900 mb-2">Market Position</h3>
              <p className="text-3xl font-bold text-green-600 mb-1">+2.4%</p>
              <p className="text-xs text-slate-500 mb-4">Above industry average</p>
              <Progress value={75} className="h-2 mb-2" />
              <p className="text-xs text-slate-400 text-center">75th Percentile</p>
            </CardContent>
          </Card>

           <Card className="border border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <h3 className="font-bold text-slate-900 mb-4">Budget Utilization</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">Base Salary</span>
                    <span className="font-bold text-slate-900">92%</span>
                  </div>
                  <Progress value={92} className="h-1.5" />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">Bonuses</span>
                    <span className="font-bold text-slate-900">45%</span>
                  </div>
                  <Progress value={45} className="h-1.5" />
                </div>
                 <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">Equity</span>
                    <span className="font-bold text-slate-900">68%</span>
                  </div>
                  <Progress value={68} className="h-1.5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
