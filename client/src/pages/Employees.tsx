import Layout from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Mail, Users, Download, Plus, Trash2, Eye, Upload, RefreshCw, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useRegionView } from "@/hooks/useRegionView";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import type { EmployeeListRow } from "@shared/employeeTypes";
import { formatEmployeeLegalName } from "@shared/employeeDisplayName";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";

type OrgOption = { id: string; name: string };

// Comprehensive Add Employee Form Component (org options = migrated from FreshTeam only, no mocks)
function AddEmployeeDialog({
  onSuccess,
  departments = [],
  businessUnits = [],
  levels = [],
  branches = [],
  shifts = [],
  teams = [],
}: {
  onSuccess?: () => void;
  departments?: string[];
  businessUnits?: OrgOption[];
  levels?: OrgOption[];
  branches?: OrgOption[];
  shifts?: OrgOption[];
  teams?: OrgOption[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("basic");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    // Basic Info
    employeeId: "",
    firstName: "",
    middleName: "",
    lastName: "",
    nickname: "",
    workEmail: "",
    avatar: "",
    
    // Work Details
    jobTitle: "",
    department: "",
    subDepartment: "",
    businessUnit: "",
    primaryTeam: "",
    costCenter: "",
    grade: "",
    jobCategory: "",
    location: "",
    role: "",
    managerEmail: "",
    hrEmail: "",
    
    // Employment
    requiresOnboarding: true,
    employmentStatus: "onboarding",
    employeeType: "full_time",
    shift: "",
    joinDate: new Date().toISOString().split("T")[0],
    probationStartDate: "",
    probationEndDate: "",
    confirmationDate: "",
    noticePeriod: "",
    
    // Contact
    personalEmail: "",
    personalPhone: "",
    workPhone: "",
    
    // Personal
    dob: "",
    gender: "",
    maritalStatus: "",
    bloodGroup: "",
    
    // Address
    street: "",
    city: "",
    state: "",
    country: "",
    zipCode: "",
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleChange("avatar", reader.result as string);
      };
      reader.readAsDataURL(file);
      toast.success("Avatar uploaded");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const required: { key: keyof typeof formData; label: string; tab: string }[] = [
      { key: "employeeId", label: "Employee ID", tab: "basic" },
      { key: "firstName", label: "First Name", tab: "basic" },
      { key: "lastName", label: "Last Name", tab: "basic" },
      { key: "workEmail", label: "Work Email", tab: "basic" },
      { key: "jobTitle", label: "Job Title", tab: "work" },
      { key: "department", label: "Department", tab: "work" },
      { key: "joinDate", label: "Join Date", tab: "employment" },
    ];
    const missing = required.filter((r) => {
      if (r.key === "workEmail" && formData.requiresOnboarding) return false;
      return !String(formData[r.key] ?? "").trim();
    });
    if (missing.length > 0) {
      const first = missing[0];
      setActiveTab(first.tab);
      toast.error("Please fill in all required fields", {
        description: `Missing: ${missing.map((m) => m.label).join(", ")}`,
      });
      return;
    }

    setLoading(true);
    try {
      const payload = { ...formData };
      delete (payload as Record<string, unknown>).requiresOnboarding;
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      
      if (!res.ok) {
        const msg = data?.error?.message ?? data?.error ?? data?.message ?? "Failed to create employee";
        throw new Error(typeof msg === "string" ? msg : "Failed to create employee");
      }

      // API returns { success: true, data: employee } (ApiResponse.created envelope)
      const employee = data.data ?? data.employee ?? data;
      const empId = employee?.id;
      const requiresOnboarding = formData.requiresOnboarding;

      toast.success("Employee created successfully!", {
        description: `${formData.firstName} ${formData.lastName} has been added to the directory.`,
      });
      
      setOpen(false);
      resetForm();
      onSuccess?.();

      if (empId) {
        setLocation(`/employees/${empId}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create employee");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      employeeId: "",
      firstName: "",
      middleName: "",
      lastName: "",
      nickname: "",
      workEmail: "",
      avatar: "",
      jobTitle: "",
      department: "",
      subDepartment: "",
      businessUnit: "",
      primaryTeam: "",
      costCenter: "",
      grade: "",
      jobCategory: "",
      location: "",
      role: "",
      managerEmail: "",
      hrEmail: "",
      requiresOnboarding: true,
      employmentStatus: "onboarding",
      employeeType: "full_time",
      shift: "",
      joinDate: new Date().toISOString().split("T")[0],
      probationStartDate: "",
      probationEndDate: "",
      confirmationDate: "",
      noticePeriod: "",
      personalEmail: "",
      personalPhone: "",
      workPhone: "",
      dob: "",
      gender: "",
      maritalStatus: "",
      bloodGroup: "",
      street: "",
      city: "",
      state: "",
      country: "",
      zipCode: "",
    });
    setActiveTab("basic");
  };

  const generateEmployeeId = async () => {
    try {
      const res = await fetch("/api/employees/suggested-id", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to get suggested ID");
      const data = await res.json();
      const suggestedId = data?.suggestedId ?? data;
      if (typeof suggestedId === "string" && suggestedId.trim()) {
        handleChange("employeeId", suggestedId.trim());
      } else {
        toast.error("Could not get next employee ID");
      }
    } catch {
      toast.error("Failed to load suggested employee ID");
    }
  };

  const initials = formData.firstName && formData.lastName 
    ? `${formData.firstName[0]}${formData.lastName[0]}`.toUpperCase()
    : "?";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetForm(); }}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm">
          <Plus className="h-4 w-4 mr-2" /> Add New Employee
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Add New Employee</DialogTitle>
          <DialogDescription>
            Create a complete employee profile. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-4">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="work">Work</TabsTrigger>
              <TabsTrigger value="employment">Employment</TabsTrigger>
              <TabsTrigger value="personal">Personal</TabsTrigger>
              <TabsTrigger value="address">Address</TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[400px] pr-4">
              {/* Basic Info Tab */}
              <TabsContent value="basic" className="space-y-4 mt-0">
                {/* Avatar Upload */}
                <div className="flex items-center gap-6 p-4 bg-muted/50 rounded-lg">
                  <div className="relative group">
                    <Avatar className="h-20 w-20 border-2 border-border">
                      <AvatarImage src={formData.avatar} />
                      <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
                    </Avatar>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Upload className="h-6 w-6 text-white" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Profile Photo</p>
                    <p className="text-xs text-muted-foreground mb-2">Upload a photo or enter URL</p>
                    <Input
                      placeholder="Or paste image URL..."
                      value={formData.avatar}
                      onChange={(e) => handleChange("avatar", e.target.value)}
                      disabled={loading}
                      className="text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Also known as (pseudonym)</Label>
                  <Input
                    placeholder="Optional — office or desk name"
                    value={formData.nickname}
                    onChange={(e) => handleChange("nickname", e.target.value)}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown on the employee profile. You can leave this blank and set it later from the profile or onboarding checklist.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Employee ID *</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g., EMP006"
                        value={formData.employeeId}
                        onChange={(e) => handleChange("employeeId", e.target.value)}
                        disabled={loading}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={generateEmployeeId} disabled={loading}>
                        Auto
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Work Email {formData.requiresOnboarding ? "(optional when onboarding)" : "*"}</Label>
                    <Input
                      type="email"
                      placeholder={formData.requiresOnboarding ? "Add later during onboarding" : "email@admani.com"}
                      value={formData.workEmail}
                      onChange={(e) => handleChange("workEmail", e.target.value)}
                      disabled={loading}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formData.requiresOnboarding ? "Can be left blank and added later during onboarding." : "Microsoft / company login email."}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>First Name *</Label>
                    <Input
                      placeholder="John"
                      value={formData.firstName}
                      onChange={(e) => handleChange("firstName", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Middle Name</Label>
                    <Input
                      placeholder="William"
                      value={formData.middleName}
                      onChange={(e) => handleChange("middleName", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name *</Label>
                    <Input
                      placeholder="Doe"
                      value={formData.lastName}
                      onChange={(e) => handleChange("lastName", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Personal Email</Label>
                    <Input
                      type="email"
                      placeholder="personal@gmail.com"
                      value={formData.personalEmail}
                      onChange={(e) => handleChange("personalEmail", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Personal Phone</Label>
                    <Input
                      placeholder="Mobile or personal number"
                      value={formData.personalPhone}
                      onChange={(e) => handleChange("personalPhone", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Work Phone</Label>
                    <Input
                      placeholder="Office or desk line"
                      value={formData.workPhone}
                      onChange={(e) => handleChange("workPhone", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Work Details Tab */}
              <TabsContent value="work" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Job Title *</Label>
                    <Input
                      placeholder="Software Engineer"
                      value={formData.jobTitle}
                      onChange={(e) => handleChange("jobTitle", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Department *</Label>
                    {departments.length > 0 ? (
                      <Select value={formData.department || "__none__"} onValueChange={(v) => handleChange("department", v === "__none__" ? "" : v)} disabled={loading}>
                        <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Select department</SelectItem>
                          {departments.map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        placeholder="e.g. Technology, Operations"
                        value={formData.department}
                        onChange={(e) => handleChange("department", e.target.value)}
                        disabled={loading}
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Sub Department</Label>
                    <Input
                      placeholder="e.g., Frontend"
                      value={formData.subDepartment}
                      onChange={(e) => handleChange("subDepartment", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Business Unit</Label>
                    <Select value={formData.businessUnit} onValueChange={(v) => handleChange("businessUnit", v)} disabled={loading}>
                      <SelectTrigger><SelectValue placeholder={businessUnits.length ? "Select" : "Run org migration first"} /></SelectTrigger>
                      <SelectContent>
                        {businessUnits.map((bu) => <SelectItem key={bu.id} value={bu.name}>{bu.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Primary Team</Label>
                    <Select value={formData.primaryTeam} onValueChange={(v) => handleChange("primaryTeam", v)} disabled={loading}>
                      <SelectTrigger><SelectValue placeholder={teams.length ? "Select team" : "Run org migration first"} /></SelectTrigger>
                      <SelectContent>
                        {teams.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cost Center</Label>
                    <Input
                      placeholder="e.g., CC-001"
                      value={formData.costCenter}
                      onChange={(e) => handleChange("costCenter", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Grade</Label>
                    <Select value={formData.grade} onValueChange={(v) => handleChange("grade", v)} disabled={loading}>
                      <SelectTrigger><SelectValue placeholder={levels.length ? "Select" : "Run org migration first"} /></SelectTrigger>
                      <SelectContent>
                        {levels.map((l) => <SelectItem key={l.id} value={l.name}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Select value={formData.location} onValueChange={(v) => handleChange("location", v)} disabled={loading}>
                      <SelectTrigger><SelectValue placeholder={branches.length ? "Select" : "Run org migration first"} /></SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Manager Email</Label>
                    <Input
                      type="email"
                      placeholder="manager@admani.com"
                      value={formData.managerEmail}
                      onChange={(e) => handleChange("managerEmail", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>HR Partner Email</Label>
                    <Input
                      type="email"
                      placeholder="hr@admani.com"
                      value={formData.hrEmail}
                      onChange={(e) => handleChange("hrEmail", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Employment Tab */}
              <TabsContent value="employment" className="space-y-4 mt-0">
                <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-muted/30">
                  <input
                    type="checkbox"
                    id="requiresOnboarding"
                    checked={formData.requiresOnboarding}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setFormData((prev) => ({ ...prev, requiresOnboarding: v, employmentStatus: v ? "onboarding" : "active" }));
                    }}
                    disabled={loading}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="requiresOnboarding" className="text-sm font-medium cursor-pointer">
                    Does this employee require onboarding?
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  If Yes: employee status = Onboarding, and you will be redirected to the onboarding checklist. If No: employee status = Active, and you will be redirected to their profile.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Employment Status</Label>
                    <Input
                      value={formData.requiresOnboarding ? "Onboarding" : "Active"}
                      readOnly
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Employee Type</Label>
                    <Select value={formData.employeeType} onValueChange={(v) => handleChange("employeeType", v)} disabled={loading}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full_time">Full Time</SelectItem>
                        <SelectItem value="part_time">Part Time</SelectItem>
                        <SelectItem value="contractor">Contractor</SelectItem>
                        <SelectItem value="intern">Intern</SelectItem>
                        <SelectItem value="temporary">Temporary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Shift</Label>
                    <Select value={formData.shift} onValueChange={(v) => handleChange("shift", v)} disabled={loading}>
                      <SelectTrigger><SelectValue placeholder={shifts.length ? "Select" : "Run org migration first"} /></SelectTrigger>
                      <SelectContent>
                        {shifts.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Notice Period</Label>
                    <Select value={formData.noticePeriod} onValueChange={(v) => handleChange("noticePeriod", v)} disabled={loading}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15 Days">15 Days</SelectItem>
                        <SelectItem value="30 Days">30 Days</SelectItem>
                        <SelectItem value="60 Days">60 Days</SelectItem>
                        <SelectItem value="90 Days">90 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Join Date *</Label>
                    <Input
                      type="date"
                      value={formData.joinDate}
                      onChange={(e) => handleChange("joinDate", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirmation Date</Label>
                    <Input
                      type="date"
                      value={formData.confirmationDate}
                      onChange={(e) => handleChange("confirmationDate", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Probation Start</Label>
                    <Input
                      type="date"
                      value={formData.probationStartDate}
                      onChange={(e) => handleChange("probationStartDate", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Probation End</Label>
                    <Input
                      type="date"
                      value={formData.probationEndDate}
                      onChange={(e) => handleChange("probationEndDate", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Personal Tab */}
              <TabsContent value="personal" className="space-y-4 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date of Birth</Label>
                    <Input
                      type="date"
                      value={formData.dob}
                      onChange={(e) => handleChange("dob", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Gender</Label>
                    <Select value={formData.gender} onValueChange={(v) => handleChange("gender", v)} disabled={loading}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                        <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Marital Status</Label>
                    <Select value={formData.maritalStatus} onValueChange={(v) => handleChange("maritalStatus", v)} disabled={loading}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single</SelectItem>
                        <SelectItem value="married">Married</SelectItem>
                        <SelectItem value="divorced">Divorced</SelectItem>
                        <SelectItem value="widowed">Widowed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Blood Group</Label>
                    <Select value={formData.bloodGroup} onValueChange={(v) => handleChange("bloodGroup", v)} disabled={loading}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A+">A+</SelectItem>
                        <SelectItem value="A-">A-</SelectItem>
                        <SelectItem value="B+">B+</SelectItem>
                        <SelectItem value="B-">B-</SelectItem>
                        <SelectItem value="O+">O+</SelectItem>
                        <SelectItem value="O-">O-</SelectItem>
                        <SelectItem value="AB+">AB+</SelectItem>
                        <SelectItem value="AB-">AB-</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              {/* Address Tab */}
              <TabsContent value="address" className="space-y-4 mt-0">
                <p className="text-sm text-muted-foreground">Permanent Address</p>
                <div className="space-y-2">
                  <Label>Street Address</Label>
                  <Input
                    placeholder="123 Main St, Apt 4B"
                    value={formData.street}
                    onChange={(e) => handleChange("street", e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      placeholder="San Francisco"
                      value={formData.city}
                      onChange={(e) => handleChange("city", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>State / Province</Label>
                    <Input
                      placeholder="CA"
                      value={formData.state}
                      onChange={(e) => handleChange("state", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Input
                      placeholder="USA"
                      value={formData.country}
                      onChange={(e) => handleChange("country", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Zip / Postal Code</Label>
                    <Input
                      placeholder="94105"
                      value={formData.zipCode}
                      onChange={(e) => handleChange("zipCode", e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <DialogFooter className="mt-4 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Employees() {
  const { isAdmin, isHR, isLimitedHR, isBreakGlassAccount } = useAuth();
  const regionView = useRegionView();
  const canViewInactiveInDirectory = isAdmin || isHR || isLimitedHR;
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  /** Query string only (wouter strips leading `?`). Pathname-only `useLocation` does not update when only ?risk= changes. */
  const routeSearch = useSearch();
  const riskFilter = useMemo(() => {
    try {
      const params = new URLSearchParams(routeSearch || "");
      const r = params.get("risk");
      return r === "no_manager" || r === "no_leave_policy" ? r : "";
    } catch {
      return "";
    }
  }, [routeSearch]);
  const [employees, setEmployees] = useState<EmployeeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!canViewInactiveInDirectory && includeInactive) setIncludeInactive(false);
  }, [canViewInactiveInDirectory, includeInactive]);

  useEffect(() => {
    if (!canViewInactiveInDirectory && ["Terminated", "Resigned", "Offboarded"].includes(statusFilter)) {
      setStatusFilter("all");
    }
  }, [canViewInactiveInDirectory, statusFilter]);
  const { data: departmentsData } = useQuery<{ departments: string[] }>({
    queryKey: ["/api/employees/departments"],
    queryFn: async () => {
      const res = await fetch("/api/employees/departments", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch departments");
      return res.json();
    },
  });
  const { data: businessUnitsData } = useQuery<{ success?: boolean; data?: { businessUnits: OrgOption[] } }>({
    queryKey: ["/api/departments/business-units"],
    queryFn: async () => {
      const res = await fetch("/api/departments/business-units", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch business units");
      return res.json();
    },
  });
  const { data: levelsData } = useQuery<{ success?: boolean; data?: { levels: OrgOption[] } }>({
    queryKey: ["/api/departments/levels"],
    queryFn: async () => {
      const res = await fetch("/api/departments/levels", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch levels");
      return res.json();
    },
  });
  const { data: branchesData } = useQuery<{ success?: boolean; data?: { branches: OrgOption[] } }>({
    queryKey: ["/api/departments/branches"],
    queryFn: async () => {
      const res = await fetch("/api/departments/branches", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch branches");
      return res.json();
    },
  });
  const { data: shiftsData } = useQuery<{ success?: boolean; data?: { shifts: OrgOption[] } }>({
    queryKey: ["/api/departments/shifts"],
    queryFn: async () => {
      const res = await fetch("/api/departments/shifts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch shifts");
      return res.json();
    },
  });
  const { data: jobCategoriesData } = useQuery<{ success?: boolean; data?: { jobCategories: OrgOption[] } }>({
    queryKey: ["/api/departments/job-categories"],
    queryFn: async () => {
      const res = await fetch("/api/departments/job-categories", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch job categories");
      return res.json();
    },
  });
  const { data: teamsData } = useQuery<{ success?: boolean; data?: { teams: OrgOption[] } }>({
    queryKey: ["/api/departments/teams"],
    queryFn: async () => {
      const res = await fetch("/api/departments/teams", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch teams");
      return res.json();
    },
  });
  const { data: rolesData } = useQuery<{ success?: boolean; data?: { roles: OrgOption[] } }>({
    queryKey: ["/api/departments/roles"],
    queryFn: async () => {
      const res = await fetch("/api/departments/roles", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch roles");
      return res.json();
    },
  });
  const departments = departmentsData?.departments ?? [];
  const businessUnits = businessUnitsData?.data?.businessUnits ?? [];
  const levels = levelsData?.data?.levels ?? [];
  const branches = branchesData?.data?.branches ?? [];
  const shifts = shiftsData?.data?.shifts ?? [];
  const jobCategories = jobCategoriesData?.data?.jobCategories ?? [];
  const teams = teamsData?.data?.teams ?? [];
  const roles = rolesData?.data?.roles ?? [];

  const canAddEmployee = isAdmin || isHR;
  const canDeleteEmployee = isAdmin;
  const [migrateOrgLoading, setMigrateOrgLoading] = useState(false);

  const handleMigrateOrgStructure = async () => {
    setMigrateOrgLoading(true);
    try {
      const res = await fetch("/api/departments/migrate-from-freshteam", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 503) {
          toast.error(data?.error ?? "FreshTeam is not configured. Set FRESHTEAM_DOMAIN and FRESHTEAM_API_KEY.");
          return;
        }
        toast.error(data?.error ?? "Migration failed");
        return;
      }
      const b = data.branches ?? {};
      const bu = data.businessUnits ?? {};
      const lv = data.levels ?? {};
      const tm = data.teams ?? {};
      const rl = data.roles ?? {};
      const ws = data.workShifts ?? {};
      const jc = data.jobCategories ?? {};
      const msg = [
        `Branches: ${(b.created ?? 0) + (b.updated ?? 0)}`,
        `Business units: ${(bu.created ?? 0) + (bu.updated ?? 0)}`,
        `Levels: ${(lv.created ?? 0) + (lv.updated ?? 0)}`,
        `Teams: ${(tm.created ?? 0) + (tm.updated ?? 0)}`,
        `Roles: ${(rl.created ?? 0) + (rl.updated ?? 0)}`,
        `Shifts: ${(ws.created ?? 0) + (ws.updated ?? 0)}`,
        `Job categories: ${(jc.created ?? 0) + (jc.updated ?? 0)}`,
        `Employees linked: ${data.employeesLinked ?? 0}`,
      ].join(" · ");
      toast.success(msg);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["/api/departments/business-units"] }),
        queryClient.refetchQueries({ queryKey: ["/api/departments/levels"] }),
        queryClient.refetchQueries({ queryKey: ["/api/departments/branches"] }),
        queryClient.refetchQueries({ queryKey: ["/api/departments/teams"] }),
        queryClient.refetchQueries({ queryKey: ["/api/departments/roles"] }),
        queryClient.refetchQueries({ queryKey: ["/api/departments/shifts"] }),
        queryClient.refetchQueries({ queryKey: ["/api/departments/job-categories"] }),
      ]);
      fetchEmployees();
    } finally {
      setMigrateOrgLoading(false);
    }
  };

  const PAGE_SIZE = 24;
  const [totalCount, setTotalCount] = useState(0);

  // Build status param for API (lowercase)
  const statusToParam = (s: string) => {
    if (s === "all") return null;
    const m: Record<string, string> = { "Active": "active", "Onboarding": "onboarding", "On Leave": "on_leave", "Terminated": "terminated", "Resigned": "resigned", "Offboarded": "offboarded" };
    return m[s] ?? null;
  };

  // Fetch employees from API (server-side search, filters, and pagination)
  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String((currentPage - 1) * PAGE_SIZE));
      if (includeInactive) params.set("includeInactive", "true");
      const q = searchTerm.trim();
      if (q) params.set("q", q);
      if (departmentFilter !== "all") params.set("department", departmentFilter);
      const statusParam = statusToParam(statusFilter);
      if (statusParam) params.set("status", statusParam);
      if (riskFilter) params.set("risk", riskFilter);
      const url = `/api/employees?${params.toString()}`;
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const body = await res.json();
        if (body != null && typeof body === "object" && "data" in body && Array.isArray(body.data)) {
          setEmployees(body.data);
          setTotalCount(typeof body.total === "number" ? body.total : body.data.length);
        } else {
          const list = Array.isArray(body) ? body : [];
          setEmployees(list);
          setTotalCount(list.length);
        }
      } else {
        toast.error("Failed to fetch employees");
      }
    } catch (error) {
      console.error("Error fetching employees:", error);
      toast.error("Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, departmentFilter, statusFilter, includeInactive, riskFilter, regionView]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, departmentFilter, statusFilter, includeInactive, riskFilter]);

  const handleExportCSV = async () => {
    const params = new URLSearchParams();
    params.set("limit", "10000");
    params.set("offset", "0");
    if (includeInactive) params.set("includeInactive", "true");
    const q = searchTerm.trim();
    if (q) params.set("q", q);
    if (departmentFilter !== "all") params.set("department", departmentFilter);
    const statusParam = statusToParam(statusFilter);
    if (statusParam) params.set("status", statusParam);
    if (riskFilter) params.set("risk", riskFilter);
    try {
      const res = await fetch(`/api/employees?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const body = await res.json();
      const list = body?.data != null && Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : [];
      if (list.length === 0) {
        toast.error("No employees to export");
        return;
      }
      const headers = ["Employee ID", "First Name", "Last Name", "Nickname", "Email", "Job Title", "Department", "Location", "Status", "Join Date"];
      const rows = list.map((emp: EmployeeListRow) => [
        emp.employee_id,
        emp.first_name,
        emp.last_name,
        emp.nickname ?? "",
        emp.work_email,
        emp.job_title,
        emp.department,
        emp.location || emp.city || "",
        formatStatus(emp.employment_status),
        emp.join_date
      ]);
      const csvContent = [
        headers.join(","),
        ...rows.map((row: string[]) => row.map(cell => `"${(cell || "").replace(/"/g, '""')}"`).join(","))
      ].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `employees_${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success(`Exported ${list.length} employees`);
    } catch {
      toast.error("Failed to export employees");
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (confirm("Are you sure you want to delete this employee?")) {
      try {
        const res = await fetch(`/api/employees/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (res.ok) {
          toast.success("Employee deleted");
          fetchEmployees(); // Refresh the list
          queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] }); // Refresh onboarding list
        } else {
          const data = await res.json();
          toast.error(data.error || "Failed to delete employee");
        }
      } catch (error) {
        toast.error("Failed to delete employee");
      }
    }
  };

  // Helper to get display name
  const getDisplayName = (emp: EmployeeListRow) =>
    formatEmployeeLegalName(emp.first_name, emp.last_name);

  // Helper to format status for display
  const formatStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      active: "Active",
      onboarding: "Onboarding",
      on_leave: "On Leave",
      terminated: "Terminated",
      resigned: "Resigned",
      offboarded: "Offboarded",
    };
    return statusMap[status] || status;
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const displayEmployees = employees;

  const riskBanner =
    riskFilter === "no_manager"
      ? "Showing employees with no manager assigned (active / onboarding / on leave)."
      : riskFilter === "no_leave_policy"
        ? "Showing employees with no leave balance / policy row yet — assign a policy or initialize balances in Leave admin."
        : "";

  return (
    <Layout>
      {riskBanner && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <span>{riskBanner}</span>
          <Button type="button" variant="outline" size="sm" className="border-amber-300 bg-white/80 shrink-0 dark:bg-transparent" onClick={() => setLocation("/employees")}>
            Clear filter
          </Button>
        </div>
      )}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Employee Directory</h1>
          <p className="text-muted-foreground text-sm">Manage your workforce and view profiles.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" className="bg-card border-border text-foreground hover:bg-muted" onClick={fetchEmployees} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          {canAddEmployee && (
            <Button variant="outline" className="bg-card border-border text-foreground hover:bg-muted" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          )}
          {isBreakGlassAccount && (
            <Button
              variant="outline"
              className="bg-card border-border text-foreground hover:bg-muted"
              onClick={handleMigrateOrgStructure}
              disabled={migrateOrgLoading}
              title="Sync locations, business units, levels, teams, roles, shifts & job categories from FreshTeam and link active employees"
            >
              <Database className={`h-4 w-4 mr-2 ${migrateOrgLoading ? "animate-pulse" : ""}`} />
              {migrateOrgLoading ? "Migrating…" : "Migrate org from FreshTeam"}
            </Button>
          )}
          {canAddEmployee && (
            <AddEmployeeDialog
              onSuccess={() => {
                fetchEmployees();
                queryClient.invalidateQueries({ queryKey: ["/api/employees/departments"] });
              }}
              departments={departments}
              businessUnits={businessUnits}
              levels={levels}
              branches={branches}
              shifts={shifts}
              teams={teams}
            />
          )}
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by legal name, pseudonym (nickname), email, employee ID, or job title…" 
              className="pl-9 bg-muted/50 border-border"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full md:w-48">
             <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="bg-muted/50 border-border">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-48">
             <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-muted/50 border-border">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Onboarding">Onboarding</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="On Leave">On Leave</SelectItem>
                {canViewInactiveInDirectory && (
                  <>
                    <SelectItem value="Terminated">Terminated</SelectItem>
                    <SelectItem value="Resigned">Resigned</SelectItem>
                    <SelectItem value="Offboarded">Offboarded</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          {canViewInactiveInDirectory && (
            <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap text-sm text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="rounded border-border"
              />
              Include terminated / inactive
            </label>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : displayEmployees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">No employees found</p>
          <p className="text-sm">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayEmployees.map((employee) => {
            const displayName = getDisplayName(employee);
            const initials = `${employee.first_name[0]}${employee.last_name[0]}`.toUpperCase();
            const status = formatStatus(employee.employment_status);
            return (
              <div key={employee.id} className="relative bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group">
                {/* Actions on hover - top right */}
                <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canDeleteEmployee && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-background/80 rounded-full" onClick={(e) => { e.preventDefault(); handleDeleteEmployee(employee.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-background/80 rounded-full" asChild>
                    <Link href={`/employees/${employee.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>

                <div className="pt-8 pb-6 px-6 flex flex-col items-center text-center">
                  <EmployeeAvatar
                    employeeId={employee.id}
                    avatarFromList={employee.avatar}
                    fallbackInitials={initials}
                    className="h-28 w-28 rounded-full border-2 border-border shadow-sm mb-4 flex-shrink-0"
                    fallbackClassName="text-xl font-medium"
                  />

                  <Link href={`/employees/${employee.id}`} className="text-base font-semibold text-[#0077b6] hover:text-[#005a8c] hover:underline underline-offset-2 focus:outline-none mb-1">
                    {displayName}
                  </Link>
                  {employee.nickname?.trim() ? (
                    <p className="text-xs text-muted-foreground mb-1 max-w-full px-1 leading-snug">
                      {employee.nickname.trim()}
                    </p>
                  ) : null}
                  <p className="text-sm font-medium text-foreground mb-0.5">{employee.job_title}</p>
                  <p className="text-xs text-muted-foreground mb-2">{employee.department || "—"}</p>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-medium ${
                      status === "Active" ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" :
                      status === "Terminated" || status === "Resigned" || status === "Offboarded" ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" :
                      status === "Onboarding" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800" :
                      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                    }`}
                  >
                    {status}
                  </Badge>
                  <a href={`mailto:${employee.work_email}`} className="mt-2 text-xs text-muted-foreground hover:text-primary truncate max-w-full px-2" title={employee.work_email}>
                    {employee.work_email}
                  </a>
                  {(isAdmin || isHR) && employee.employment_status === "onboarding" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                      onClick={(e) => {
                        e.preventDefault();
                        setLocation(`/onboarding?employeeId=${employee.id}`);
                      }}
                    >
                      Send Checklist
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalCount > PAGE_SIZE && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount} employees
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.max(1, p - 1)); }}
                  className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="px-4 py-2 text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.min(totalPages, p + 1)); }}
                  className={currentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

    </Layout>
  );
}
