import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Copy, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function JobGenerator() {
  const [generated, setGenerated] = useState(false);

  return (
    <Layout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-slate-900">AI Job Description Generator</h1>
        <p className="text-slate-500 text-sm">Create compelling job posts in seconds.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Job Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Job Title</Label>
              <Input placeholder="e.g. Senior Product Designer" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eng">Engineering</SelectItem>
                    <SelectItem value="prod">Product</SelectItem>
                    <SelectItem value="mkt">Marketing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Experience Level</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jr">Junior</SelectItem>
                    <SelectItem value="mid">Mid-Level</SelectItem>
                    <SelectItem value="sr">Senior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Key Skills (Comma separated)</Label>
              <Input placeholder="React, TypeScript, Figma, User Research" />
            </div>
            <div className="space-y-2">
              <Label>Tone</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 border-blue-600 bg-blue-50 text-blue-700">Professional</Button>
                <Button variant="outline" size="sm" className="flex-1">Exciting</Button>
                <Button variant="outline" size="sm" className="flex-1">Technical</Button>
              </div>
            </div>
            <Button className="w-full mt-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:opacity-90" onClick={() => setGenerated(true)}>
              <Sparkles className="h-4 w-4 mr-2" /> Generate with AI
            </Button>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm bg-slate-50/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Preview</CardTitle>
            {generated && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm"><RefreshCw className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm"><Copy className="h-4 w-4 mr-2" /> Copy</Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {generated ? (
              <div className="prose prose-sm max-w-none text-slate-700">
                <h3 className="text-slate-900 font-bold">Senior Product Designer</h3>
                <p>We are looking for a visionary Senior Product Designer to lead our design system and core product experience...</p>
                
                <h4 className="font-bold mt-4">Responsibilities</h4>
                <ul className="list-disc pl-4">
                  <li>Lead design projects from concept to launch</li>
                  <li>Mentor junior designers and conduct design reviews</li>
                  <li>Collaborate closely with engineering and product management</li>
                </ul>

                <h4 className="font-bold mt-4">Requirements</h4>
                <ul className="list-disc pl-4">
                  <li>5+ years of experience in product design</li>
                  <li>Proficiency in Figma and prototyping tools</li>
                  <li>Strong portfolio demonstrating UX problem solving</li>
                </ul>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                <Sparkles className="h-12 w-12 mb-2 opacity-20" />
                <p>Fill out the form to generate a description</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
