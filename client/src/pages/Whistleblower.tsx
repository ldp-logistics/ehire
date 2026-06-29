import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Lock, AlertTriangle, Send, EyeOff } from "lucide-react";

export default function Whistleblower() {
  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-slate-100 rounded-full mb-4">
            <Shield className="h-8 w-8 text-slate-900" />
          </div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Secure Reporting Channel</h1>
          <p className="text-slate-500 mt-2">Submit anonymous reports regarding ethics, safety, or compliance violations.</p>
        </div>

        <Card className="border border-slate-200 shadow-lg mb-8">
          <CardHeader className="bg-slate-50 border-b border-slate-100">
            <div className="flex items-center gap-2 text-amber-700">
              <Lock className="h-4 w-4" />
              <span className="text-sm font-bold uppercase tracking-wider">100% Anonymous & Encrypted</span>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select issue type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ethics">Ethics Violation</SelectItem>
                  <SelectItem value="harassment">Harassment or Discrimination</SelectItem>
                  <SelectItem value="fraud">Fraud or Financial Misconduct</SelectItem>
                  <SelectItem value="safety">Safety Hazard</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Subject</Label>
              <Input placeholder="Brief summary of the incident" />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                placeholder="Please provide as much detail as possible. Who, what, when, where?" 
                className="min-h-[150px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Evidence (Optional)</Label>
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer">
                <p className="text-sm text-slate-500">Drag and drop files here, or click to upload</p>
                <p className="text-xs text-slate-400 mt-1">Images, Documents, PDF</p>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex gap-3">
              <EyeOff className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-800">
                Your identity is protected. We strip all metadata from uploaded files. You will receive a unique access key to check the status of your report without revealing who you are.
              </p>
            </div>

            <Button className="w-full h-12 text-lg bg-slate-900 hover:bg-slate-800 text-white">
              <Send className="h-5 w-5 mr-2" /> Submit Secure Report
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
