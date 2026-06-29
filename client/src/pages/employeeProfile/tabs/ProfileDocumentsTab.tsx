import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Eye, Upload, Trash2, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTimeDisplay } from "@/lib/dateUtils";

/** Display order: NDA → T&C → ID (CNIC) → Appointment Letter → User Documents (keys match docTypeToSection buckets). */
const DOCUMENT_SECTIONS = [
  { key: "nda", title: "NDA" },
  { key: "additional", title: "T&C" },
  { key: "id_documents", title: "ID (CNIC)" },
  { key: "offer_letter", title: "Appointment Letter" },
  { key: "education", title: "User Documents" },
] as const;

const docTypeToSection: Record<string, string> = {
  id_document: "id_documents",
  cnic_front: "id_documents", cnic_back: "id_documents", passport: "id_documents",
  drivers_license: "id_documents", professional_photo: "id_documents",
  education: "education", degree_transcript: "education", internship_certificate: "education",
  offer_letter: "offer_letter",
  nda: "nda",
  additional: "additional", manual: "additional",
  experience_certificate: "additional", salary_slip: "additional", resignation_acceptance: "additional",
};

type DocRow = {
  id: string;
  display_name: string | null;
  document_type: string;
  file_name: string | null;
  source: string;
  uploaded_at: string | null;
  created_at: string;
};

export interface ProfileDocumentsTabProps {
  employeeId: string;
  canAdminEdit: boolean;
}

function getDocSection(documentType: string): string {
  return docTypeToSection[documentType] || "additional";
}

function ProfileDocumentsTab({ employeeId, canAdminEdit }: ProfileDocumentsTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [uploadDisplayName, setUploadDisplayName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocumentType, setUploadDocumentType] = useState<string>("additional");
  const [uploadLoading, setUploadLoading] = useState(false);

  const { data: employeeDocuments = [] } = useQuery<DocRow[]>({
    queryKey: ["/api/employees", employeeId, "documents"],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/employees/${employeeId}/documents`);
      return r.json();
    },
    enabled: !!employeeId,
  });

  const documentsBySection = (() => {
    const map: Record<string, DocRow[]> = {};
    DOCUMENT_SECTIONS.forEach((s) => { map[s.key] = []; });
    employeeDocuments.forEach((doc) => {
      const section = getDocSection(doc.document_type || "");
      if (map[section]) map[section].push(doc);
      else map.additional.push(doc);
    });
    return map;
  })();

  const handleUploadDocument = async () => {
    if (!uploadFile) {
      toast.error("Please select a file");
      return;
    }
    setUploadLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const fileUrl = reader.result as string;
          const fileName = uploadFile.name;
          const displayName = (uploadDisplayName && uploadDisplayName.trim()) || fileName;
          const r = await apiRequest("POST", `/api/employees/${employeeId}/documents`, {
            displayName,
            fileUrl,
            fileName,
            documentType: uploadDocumentType,
          });
          if (!r.ok) throw new Error(await r.text());
          toast.success("File uploaded");
          queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId, "documents"] });
          setUploadDocOpen(false);
          setUploadDisplayName("");
          setUploadFile(null);
          setUploadDocumentType("additional");
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Upload failed");
        } finally {
          setUploadLoading(false);
        }
      };
      reader.readAsDataURL(uploadFile);
    } catch {
      setUploadLoading(false);
      toast.error("Upload failed");
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm("Remove this file from the employee profile?")) return;
    try {
      const r = await apiRequest("DELETE", `/api/employees/documents/${docId}`);
      if (!r.ok) throw new Error(await r.text());
      toast.success("Document removed");
      queryClient.invalidateQueries({ queryKey: ["/api/employees", employeeId, "documents"] });
    } catch {
      toast.error("Could not remove document");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-row items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Employee files and manual uploads.
        </p>
        {canAdminEdit && (
          <Button size="sm" variant="outline" onClick={() => setUploadDocOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Upload file
          </Button>
        )}
      </div>

      {DOCUMENT_SECTIONS.map((section) => {
        const docs = documentsBySection[section.key] || [];
        return (
          <Card key={section.key} className="border border-border shadow-sm bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{section.title}</CardTitle>
              <CardDescription>
                  {docs.length === 0 ? "No files in this section." : `${docs.length} file${docs.length === 1 ? "" : "s"}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {docs.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                  No files yet. {canAdminEdit && "Upload a file and select this section."}
                </div>
              ) : (
                docs.map((doc) => {
                  const displayName = doc.file_name || doc.display_name || doc.document_type?.replace(/_/g, " ") || "Document";
                  const dateStr = doc.uploaded_at
                    ? formatDateTimeDisplay(doc.uploaded_at, user?.timeZone ?? null, user?.dateFormat ?? null)
                    : doc.created_at
                      ? formatDateTimeDisplay(doc.created_at, user?.timeZone ?? null, user?.dateFormat ?? null)
                      : "";
                  return (
                    <div key={doc.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 text-primary p-2 rounded">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{doc.display_name || doc.document_type?.replace(/_/g, " ") || "Document"}</p>
                          <p className="text-xs text-muted-foreground">
                            {dateStr ? `Uploaded ${dateStr}` : ""}
                            {doc.source === "tentative_verification" ? " · Verification" : doc.source === "manual" ? " · Manual" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-primary"
                          title="View document"
                          onClick={() => window.open(`${window.location.origin}/api/employees/documents/${doc.id}/file`, "_blank", "noopener,noreferrer")}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-primary"
                          title="Download document"
                          onClick={async () => {
                            try {
                              const r = await fetch(`/api/employees/documents/${doc.id}/file`, { credentials: "include" });
                              if (!r.ok) throw new Error("Failed to load file");
                              const blob = await r.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = displayName || "document";
                              a.click();
                              URL.revokeObjectURL(url);
                            } catch {
                              toast.error("Could not download document");
                            }
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {canAdminEdit && (
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => handleDeleteDocument(doc.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={uploadDocOpen} onOpenChange={setUploadDocOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload file</DialogTitle>
            <DialogDescription>Add a file to this employee&apos;s profile. Choose the section and upload a PDF or image.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Section *</Label>
              <Select value={uploadDocumentType} onValueChange={setUploadDocumentType}>
                <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nda">NDA</SelectItem>
                  <SelectItem value="additional">T&amp;C</SelectItem>
                  <SelectItem value="id_document">ID (CNIC)</SelectItem>
                  <SelectItem value="offer_letter">Appointment Letter</SelectItem>
                  <SelectItem value="education">User Documents</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Display name (optional)</Label>
              <Input placeholder="e.g. Passport copy" value={uploadDisplayName} onChange={(e) => setUploadDisplayName(e.target.value)} />
              <p className="text-xs text-muted-foreground">If left blank, the file name will be used.</p>
            </div>
            <div className="space-y-2">
              <Label>File *</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                {uploadFile ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{uploadFile.name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setUploadFile(null)}>Remove</Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Click to upload (PDF, max 5MB)</p>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f && f.size <= 5 * 1024 * 1024) setUploadFile(f);
                        else if (f) toast.error("File must be under 5MB");
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDocOpen(false)}>Cancel</Button>
            <Button onClick={handleUploadDocument} disabled={uploadLoading || !uploadFile}>{uploadLoading ? "Uploading..." : "Upload"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ProfileDocumentsTab;
