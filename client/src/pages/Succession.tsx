import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowRight, UserCheck, AlertTriangle, TrendingUp } from "lucide-react";

const keyRoles = [
  { 
    role: "VP of Engineering", 
    incumbent: "Morpheus King",
    risk: "Medium",
    successors: [
      { name: "Neo Anderson", readiness: "Ready Now", gap: "Leadership Experience" },
      { name: "Trinity Moss", readiness: "1-2 Years", gap: "Technical Depth" }
    ]
  },
  { 
    role: "Product Director", 
    incumbent: "Sarah Connor",
    risk: "Low",
    successors: [
      { name: "John Doe", readiness: "Ready Now", gap: "None" }
    ]
  },
  { 
    role: "Chief Security Officer", 
    incumbent: "Agent Smith",
    risk: "High",
    successors: []
  }
];

export default function Succession() {
  return (
    <Layout>
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Succession Planning</h1>
          <p className="text-slate-500 text-sm">Identify and develop future leaders.</p>
        </div>
        <Button className="bg-primary text-white hover:bg-blue-700 shadow-sm">
          <TrendingUp className="h-4 w-4 mr-2" /> Plan New Role
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="border border-slate-200 shadow-sm bg-red-50 border-red-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h3 className="font-bold text-red-900">High Risk Roles</h3>
            </div>
            <p className="text-3xl font-bold text-slate-900">3</p>
            <p className="text-xs text-red-700 mt-1">No successors identified</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm bg-green-50 border-green-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="h-5 w-5 text-green-600" />
              <h3 className="font-bold text-green-900">Successor Coverage</h3>
            </div>
            <p className="text-3xl font-bold text-slate-900">82%</p>
            <p className="text-xs text-green-700 mt-1">Critical roles covered</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm bg-blue-50 border-blue-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-blue-900">Internal Promo Rate</h3>
            </div>
            <p className="text-3xl font-bold text-slate-900">45%</p>
            <p className="text-xs text-blue-700 mt-1">Last 12 months</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {keyRoles.map((role, i) => (
          <Card key={i} className="border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{role.role}</h3>
                <p className="text-sm text-slate-500">Incumbent: <span className="font-medium text-slate-900">{role.incumbent}</span></p>
              </div>
              <Badge variant="outline" className={`${role.risk === 'High' ? 'text-red-600 border-red-200 bg-red-50' : role.risk === 'Medium' ? 'text-yellow-600 border-yellow-200 bg-yellow-50' : 'text-green-600 border-green-200 bg-green-50'}`}>
                {role.risk} Flight Risk
              </Badge>
            </div>
            <CardContent className="p-6">
              <h4 className="text-xs font-bold uppercase text-slate-400 mb-4">Identified Successors</h4>
              {role.successors.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {role.successors.map((successor, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src="https://github.com/shadcn.png" />
                          <AvatarFallback>SU</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{successor.name}</p>
                          <Badge variant="secondary" className="text-[10px] h-5">{successor.readiness}</Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Gap Analysis</p>
                        <p className="text-xs font-medium text-slate-700">{successor.gap}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <p className="text-slate-500 text-sm mb-2">No successors identified yet.</p>
                  <Button size="sm" variant="outline">Find Candidates</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </Layout>
  );
}
