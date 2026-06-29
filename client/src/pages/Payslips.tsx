import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Printer, Share2, DollarSign, Calendar, Building2, User } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useState } from "react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function Payslips() {
  const { employees, payrollRecords } = useStore();
  const [selectedMonth, setSelectedMonth] = useState("2024-11");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("1"); // Default to first employee

  const currentRecord = payrollRecords.find(
    r => r.employeeId.toString() === selectedEmployeeId && r.month === selectedMonth
  );

  const employee = employees.find(e => e.id.toString() === selectedEmployeeId);

  return (
    <Layout>
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Payslips</h1>
          <p className="text-muted-foreground text-sm">View and download monthly salary slips.</p>
        </div>
        <div className="flex gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px] bg-card">
              <SelectValue placeholder="Select Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2024-11">November 2024</SelectItem>
              <SelectItem value="2024-10">October 2024</SelectItem>
              <SelectItem value="2024-09">September 2024</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Employee List Sidebar */}
        <Card className="lg:col-span-3 border border-border shadow-sm h-fit">
          <CardHeader>
            <CardTitle className="text-sm uppercase text-muted-foreground">Select Employee</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {employees.map((emp) => (
                <div 
                  key={emp.id} 
                  className={`p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors ${selectedEmployeeId === emp.id.toString() ? 'bg-muted border-l-4 border-primary' : ''}`}
                  onClick={() => setSelectedEmployeeId(emp.id.toString())}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={`/api/employees/${emp.id}/avatar`} />
                    <AvatarFallback>{emp.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="overflow-hidden">
                    <p className={`text-sm font-bold truncate ${selectedEmployeeId === emp.id.toString() ? 'text-primary' : 'text-foreground'}`}>
                      {emp.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{emp.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Payslip View */}
        <div className="lg:col-span-9">
          {currentRecord && employee ? (
            <Card className="border border-border shadow-md bg-card print:shadow-none print:border-none">
              <CardContent className="p-8">
                {/* Payslip Header */}
                <div className="flex justify-between items-start border-b border-border pb-8 mb-8">
                  <div className="flex items-center gap-4">
                     <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                        <Building2 className="h-6 w-6" />
                     </div>
                     <div>
                       <h2 className="text-2xl font-bold text-foreground">Admani Holdings</h2>
                       <p className="text-sm text-muted-foreground">123 Business Park, Silicon Valley, CA</p>
                     </div>
                  </div>
                  <div className="text-right">
                    <h3 className="text-xl font-mono font-bold text-foreground uppercase tracking-widest">Payslip</h3>
                    <p className="text-sm text-muted-foreground font-medium mt-1">
                      {format(new Date(selectedMonth + "-01"), "MMMM yyyy")}
                    </p>
                    <Badge variant="outline" className="mt-2 bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                      PAID
                    </Badge>
                  </div>
                </div>

                {/* Employee Details Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8 bg-muted/30 p-6 rounded-lg border border-border">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">Employee Name</p>
                    <p className="font-bold text-foreground">{employee.name}</p>
                  </div>
                   <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">Employee ID</p>
                    <p className="font-bold text-foreground">{employee.employeeId}</p>
                  </div>
                   <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">Department</p>
                    <p className="font-bold text-foreground">{employee.department}</p>
                  </div>
                   <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">Designation</p>
                    <p className="font-bold text-foreground">{employee.role}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">Bank Account</p>
                    <p className="font-mono text-foreground">****4589</p>
                  </div>
                   <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">Pay Date</p>
                    <p className="font-bold text-foreground">Nov 30, 2024</p>
                  </div>
                   <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">Days Worked</p>
                    <p className="font-bold text-foreground">
                      {Math.round((currentRecord.attendancePercentage / 100) * 30)} / 30
                    </p>
                  </div>
                   <div>
                    <p className="text-xs text-muted-foreground uppercase mb-1">LOP Days</p>
                    <p className="font-bold text-red-500">{currentRecord.unpaidLeaves}</p>
                  </div>
                </div>

                {/* Earnings & Deductions Table */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  {/* Earnings */}
                  <div>
                    <h4 className="font-bold text-foreground border-b border-border pb-2 mb-4 uppercase text-xs tracking-wider">Earnings</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Basic Salary</span>
                        <span className="font-mono font-medium text-foreground">${currentRecord.baseSalary.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">House Rent Allowance</span>
                        <span className="font-mono font-medium text-foreground">$0.00</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Special Allowance</span>
                        <span className="font-mono font-medium text-foreground">${currentRecord.additions.toLocaleString()}</span>
                      </div>
                      <div className="border-t border-border pt-3 mt-3 flex justify-between font-bold">
                        <span className="text-foreground">Total Earnings</span>
                        <span className="font-mono text-foreground">${(currentRecord.baseSalary + currentRecord.additions).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Deductions */}
                  <div>
                    <h4 className="font-bold text-foreground border-b border-border pb-2 mb-4 uppercase text-xs tracking-wider">Deductions</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Income Tax</span>
                        <span className="font-mono font-medium text-foreground">${(currentRecord.deductions * 0.8).toLocaleString()}</span>
                      </div>
                       <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Provident Fund</span>
                        <span className="font-mono font-medium text-foreground">${(currentRecord.deductions * 0.2).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Unpaid Leave Deduction</span>
                        <span className="font-mono font-medium text-red-500">$0.00</span>
                      </div>
                       <div className="border-t border-border pt-3 mt-3 flex justify-between font-bold">
                        <span className="text-foreground">Total Deductions</span>
                        <span className="font-mono text-foreground">${currentRecord.deductions.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Net Pay */}
                <div className="bg-primary/5 rounded-lg p-6 border border-primary/20 flex justify-between items-center mb-8">
                  <div>
                    <p className="text-sm text-primary font-medium uppercase tracking-wider mb-1">Net Payable Amount</p>
                    <p className="text-xs text-muted-foreground">Five Thousand Only</p>
                  </div>
                  <div className="text-3xl font-mono font-bold text-primary">
                    ${currentRecord.netSalary.toLocaleString()}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-3 print:hidden">
                  <Button variant="outline">
                    <Share2 className="h-4 w-4 mr-2" /> Share
                  </Button>
                  <Button variant="outline" onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-2" /> Print
                  </Button>
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <Download className="h-4 w-4 mr-2" /> Download PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center h-[400px] border border-dashed border-border rounded-lg bg-muted/20">
              <Calendar className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground font-medium">No payroll record found for this period.</p>
              <Button variant="link" className="text-primary mt-2">Generate Payroll</Button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}