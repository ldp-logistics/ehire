import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, Calendar, CheckCircle, Download } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const certifications = [
  { id: 1, name: "GDPR Compliance", issuer: "European Data Protection", expires: "Dec 15, 2025", status: "Valid", progress: 100 },
  { id: 2, name: "SOC 2 Type II", issuer: "AICPA", expires: "Nov 30, 2024", status: "Expiring Soon", progress: 85 },
  { id: 3, name: "Workplace Safety", issuer: "OSHA", expires: "Oct 10, 2024", status: "Expired", progress: 0 },
];

export default function Compliance() {
  return (
    <Layout>
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Compliance Tracker</h1>
          <p className="text-slate-500 text-sm">Monitor certifications and regulatory requirements.</p>
        </div>
        <Button className="bg-primary text-white hover:bg-blue-700 shadow-sm">
          <ShieldCheck className="h-4 w-4 mr-2" /> Add Certification
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="border border-slate-200 shadow-sm bg-green-50 border-green-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <h3 className="font-bold text-green-900">Compliance Score</h3>
            </div>
            <p className="text-3xl font-bold text-slate-900">92%</p>
            <p className="text-xs text-green-700 mt-1">Excellent Standing</p>
          </CardContent>
        </Card>
        
        <Card className="border border-slate-200 shadow-sm bg-yellow-50 border-yellow-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <h3 className="font-bold text-yellow-900">Action Required</h3>
            </div>
            <p className="text-3xl font-bold text-slate-900">3</p>
            <p className="text-xs text-yellow-700 mt-1">Items expiring within 30 days</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Certifications</h3>
        {certifications.map((cert) => (
          <Card key={cert.id} className="border border-slate-200 shadow-sm">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${cert.status === 'Valid' ? 'bg-green-100 text-green-600' : cert.status === 'Expiring Soon' ? 'bg-yellow-100 text-yellow-600' : 'bg-red-100 text-red-600'}`}>
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-lg">{cert.name}</h4>
                  <p className="text-sm text-slate-500 mb-2">Issued by {cert.issuer}</p>
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                    <Calendar className="h-3 w-3" /> Expires: {cert.expires}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <Badge className={`
                  ${cert.status === 'Valid' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 
                    cert.status === 'Expiring Soon' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' : 
                    'bg-red-100 text-red-700 hover:bg-red-200'}
                `}>
                  {cert.status}
                </Badge>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" /> Certificate
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </Layout>
  );
}
