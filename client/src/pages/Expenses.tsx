import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, DollarSign, Plus, Check, X, Filter, FileText, Upload } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";

const expenses = [
  { id: 1, user: "John Wick", description: "Client Dinner", amount: 245.00, category: "Meals", date: "Nov 20", status: "Pending", img: "https://github.com/shadcn.png" },
  { id: 2, user: "Trinity Moss", description: "Figma Subscription", amount: 45.00, category: "Software", date: "Nov 18", status: "Approved", img: "https://github.com/shadcn.png" },
  { id: 3, user: "Neo Anderson", description: "AWS Server Costs", amount: 1250.00, category: "Infrastructure", date: "Nov 15", status: "Approved", img: "https://github.com/shadcn.png" },
  { id: 4, user: "Sarah Connor", description: "Team Offsite", amount: 850.00, category: "Events", date: "Nov 12", status: "Rejected", img: "https://github.com/shadcn.png" },
];

export default function Expenses() {
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsOpen(false);
    toast({
      title: "Expense Submitted",
      description: "Your reimbursement request has been sent for approval.",
    });
  };

  return (
    <Layout>
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Expense Reimbursement</h1>
          <p className="text-slate-500 text-sm">Track, approve, and manage company spending.</p>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-white hover:bg-blue-700 shadow-sm">
              <Plus className="h-4 w-4 mr-2" /> New Expense
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>New Expense Request</DialogTitle>
              <DialogDescription>
                Submit a new reimbursement claim. Please attach receipts.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" placeholder="e.g. Client Dinner with Acme Corp" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="amount">Amount</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                    <Input id="amount" type="number" placeholder="0.00" className="pl-9" required />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Select required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meals">Meals</SelectItem>
                      <SelectItem value="travel">Travel</SelectItem>
                      <SelectItem value="software">Software</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="receipt">Receipt</Label>
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-slate-50 cursor-pointer transition-colors">
                  <Upload className="h-8 w-8 text-slate-400 mb-2" />
                  <span className="text-xs text-slate-500 font-medium">Click to upload or drag & drop</span>
                  <span className="text-[10px] text-slate-400">PDF, JPG, PNG up to 5MB</span>
                </div>
              </div>
              <DialogFooter className="mt-2">
                <Button type="submit">Submit Request</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <p className="text-slate-500 text-xs font-bold uppercase mb-1">Pending Approval</p>
            <h3 className="text-3xl font-bold text-slate-900">$245.00</h3>
            <p className="text-xs text-orange-600 mt-2 font-medium">3 requests waiting</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <p className="text-slate-500 text-xs font-bold uppercase mb-1">This Month</p>
            <h3 className="text-3xl font-bold text-slate-900">$4,285.00</h3>
            <p className="text-xs text-green-600 mt-2 font-medium">+12% vs last month</p>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <p className="text-slate-500 text-xs font-bold uppercase mb-1">Avg Processing</p>
            <h3 className="text-3xl font-bold text-slate-900">1.5 Days</h3>
            <p className="text-xs text-blue-600 mt-2 font-medium">Within SLA</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4 flex flex-row items-center justify-between">
          <CardTitle>Recent Requests</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8">
              <Filter className="h-3 w-3 mr-2" /> Status
            </Button>
            <Button variant="outline" size="sm" className="h-8">
              <FileText className="h-3 w-3 mr-2" /> Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {expenses.map((expense) => (
              <div key={expense.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarImage src={expense.img} />
                    <AvatarFallback>JD</AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{expense.description}</h4>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>{expense.user}</span>
                      <span>•</span>
                      <span>{expense.category}</span>
                      <span>•</span>
                      <span>{expense.date}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-6">
                  <span className="font-bold text-slate-900 w-20 text-right">${expense.amount.toFixed(2)}</span>
                  <Badge className={`w-24 justify-center
                    ${expense.status === 'Approved' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 
                      expense.status === 'Rejected' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 
                      'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'}
                  `}>
                    {expense.status}
                  </Badge>
                  <div className="flex gap-1">
                    {expense.status === 'Pending' && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:bg-green-50">
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50">
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                      <Receipt className="h-4 w-4" />
                    </Button>
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
