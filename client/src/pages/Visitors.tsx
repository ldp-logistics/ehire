import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogIn, LogOut, UserPlus, Clock, Search } from "lucide-react";

const visitors = [
  { id: 1, name: "Elon Musk", company: "SpaceX", host: "Neo Anderson", checkIn: "10:00 AM", status: "Checked In", type: "VIP" },
  { id: 2, name: "Peter Thiel", company: "Palantir", host: "Morpheus King", checkIn: "11:30 AM", status: "Checked In", type: "Investor" },
  { id: 3, name: "Sam Altman", company: "OpenAI", host: "Sarah Connor", checkIn: "--", status: "Pre-registered", type: "Partner" },
];

export default function Visitors() {
  return (
    <Layout>
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Visitor Management</h1>
          <p className="text-slate-500 text-sm">Track guests and office security.</p>
        </div>
        <Button className="bg-primary text-white hover:bg-blue-700 shadow-sm">
          <UserPlus className="h-4 w-4 mr-2" /> Pre-register Guest
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <Card className="border border-slate-200 shadow-sm bg-blue-600 text-white">
          <CardContent className="p-6 text-center">
            <p className="text-blue-100 text-sm font-bold uppercase mb-2">Currently On-site</p>
            <h3 className="text-5xl font-bold mb-2">12</h3>
            <p className="text-sm text-blue-100">Guests Checked In</p>
          </CardContent>
        </Card>
         <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6 text-center">
            <p className="text-slate-500 text-sm font-bold uppercase mb-2">Expected Today</p>
            <h3 className="text-5xl font-bold text-slate-900 mb-2">24</h3>
            <p className="text-sm text-slate-500">Total Registrations</p>
          </CardContent>
        </Card>
         <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6 text-center">
            <p className="text-slate-500 text-sm font-bold uppercase mb-2">Avg Visit Duration</p>
            <h3 className="text-5xl font-bold text-slate-900 mb-2">2h</h3>
            <p className="text-sm text-slate-500">15m</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex justify-between items-center">
            <CardTitle>Today's Log</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search visitors..." className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {visitors.map((visitor) => (
              <div key={visitor.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                   <Avatar>
                    <AvatarFallback>{visitor.name[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-bold text-slate-900">{visitor.name}</h4>
                    <p className="text-xs text-slate-500">{visitor.company} • Host: {visitor.host}</p>
                  </div>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-600">{visitor.type}</Badge>
                </div>

                <div className="flex items-center gap-6">
                   <div className="text-right">
                      <p className="text-xs text-slate-500 uppercase font-bold">Check In</p>
                      <p className="text-sm font-mono font-medium text-slate-900">{visitor.checkIn}</p>
                   </div>
                   <div className="flex gap-2">
                     {visitor.status === 'Pre-registered' ? (
                       <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                         <LogIn className="h-3 w-3 mr-2" /> Check In
                       </Button>
                     ) : (
                       <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                         <LogOut className="h-3 w-3 mr-2" /> Check Out
                       </Button>
                     )}
                   </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}
