import Layout from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, Mail, AlertTriangle, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

type EmergencyContactRow = {
  id: string;
  employee_id: string;
  full_name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  first_name: string;
  last_name: string;
  work_email: string;
};

export default function Emergency() {
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading, error } = useQuery<EmergencyContactRow[]>({
    queryKey: ["/api/compensation/emergency-contacts"],
    queryFn: async () => {
      const res = await fetch("/api/compensation/emergency-contacts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load emergency contacts");
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
        (r.work_email || "").toLowerCase().includes(q) ||
        (r.full_name || "").toLowerCase().includes(q) ||
        (r.relationship || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <Layout>
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Emergency Contacts</h1>
          <p className="text-slate-500 text-sm">Critical contact information for all employees.</p>
        </div>
        <Button variant="destructive" className="shadow-sm">
          <AlertTriangle className="h-4 w-4 mr-2" /> Broadcast Alert
        </Button>
      </div>

      <Card className="border border-slate-200 shadow-sm mb-6">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by employee or contact name..."
              className="pl-9 bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <CardContent className="p-0">
          {isLoading && (
            <div className="p-8 text-center text-slate-500">Loading emergency contacts...</div>
          )}
          {error && (
            <div className="p-8 text-center text-destructive">Failed to load emergency contacts.</div>
          )}
          {!isLoading && !error && filtered.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              {rows.length === 0
                ? "No emergency contacts in the system. Run Migrate from FreshTeam or add contacts in employee profiles."
                : "No contacts match your search."}
            </div>
          )}
          <div className="divide-y divide-slate-100">
            {filtered.map((contact) => {
              const employeeName = `${contact.first_name} ${contact.last_name}`.trim() || "Employee";
              return (
                <div
                  key={contact.id}
                  className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12 border border-slate-200">
                      <AvatarFallback>{employeeName[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-bold text-slate-900">{employeeName}</h3>
                      <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                        {contact.work_email && (
                          <span className="flex items-center">
                            <Mail className="h-3 w-3 mr-1" /> {contact.work_email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 md:max-w-md bg-red-50 rounded-lg p-3 border border-red-100">
                    <p className="text-xs font-bold text-red-800 uppercase mb-2 flex items-center">
                      <AlertTriangle className="h-3 w-3 mr-1" /> Emergency Contact
                    </p>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold text-slate-900">{contact.full_name}</p>
                        {contact.relationship && (
                          <p className="text-xs text-slate-500">{contact.relationship}</p>
                        )}
                      </div>
                      <div className="text-right">
                        {contact.phone && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 bg-white border-red-200 text-red-700 hover:bg-red-50"
                            asChild
                          >
                            <a href={`tel:${contact.phone}`}>
                              <Phone className="h-3 w-3 mr-2" /> Call Now
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}
