import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Server, Database, Globe, CheckCircle, AlertCircle, Clock } from "lucide-react";

const services = [
  { name: "Core API", status: "Operational", uptime: "99.99%", latency: "45ms", icon: Server },
  { name: "Database Cluster", status: "Operational", uptime: "99.95%", latency: "12ms", icon: Database },
  { name: "Frontend CDN", status: "Operational", uptime: "100%", latency: "24ms", icon: Globe },
  { name: "Email Service", status: "Degraded", uptime: "98.50%", latency: "450ms", icon: Activity },
];

const incidents = [
  { id: 1, title: "Email Delivery Delays", status: "Investigating", time: "15 mins ago", severity: "Minor" },
  { id: 2, title: "Scheduled Maintenance", status: "Completed", time: "2 days ago", severity: "Info" },
];

export default function SystemHealth() {
  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-slate-900">System Health</h1>
        <p className="text-slate-500 text-sm">Real-time status of platform services.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {services.map((service) => (
          <Card key={service.name} className={`border-l-4 shadow-sm ${service.status === 'Operational' ? 'border-l-green-500' : 'border-l-yellow-500'}`}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <service.icon className="h-5 w-5 text-slate-600" />
                </div>
                <Badge variant="outline" className={service.status === 'Operational' ? 'text-green-600 border-green-200 bg-green-50' : 'text-yellow-600 border-yellow-200 bg-yellow-50'}>
                  {service.status}
                </Badge>
              </div>
              <h3 className="font-bold text-slate-900 mb-1">{service.name}</h3>
              <div className="flex justify-between text-xs text-slate-500 mt-4">
                <span>Uptime: {service.uptime}</span>
                <span>Lat: {service.latency}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Incident History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {incidents.map((incident) => (
              <div key={incident.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-full ${incident.status === 'Completed' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                    {incident.status === 'Completed' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{incident.title}</h4>
                    <p className="text-xs text-slate-500 flex items-center">
                      <Clock className="h-3 w-3 mr-1" /> {incident.time}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">{incident.status}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}
