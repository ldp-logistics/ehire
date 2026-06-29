import type { Request, Response, NextFunction } from "express";
import { RecruitmentService } from "./RecruitmentService.js";
import { fetchResumeBuffer } from "../../lib/freshteamApi.js";
import { publicDisplayFromBranch } from "../../lib/timezone.js";

type QueryParams = Record<string, string | string[] | undefined>;

/** SendGrid Inbound Parse may put large `text`/`html` parts as multipart file fields; merge into body. */
function mergeInboundMultipartBody(req: Request): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(req.body as Record<string, unknown>) };
  const files = (req as Request & { files?: Express.Multer.File[] }).files;
  if (!Array.isArray(files)) return out;
  for (const f of files) {
    if (!f?.fieldname) continue;
    const buf = f.buffer;
    if (!buf?.length) continue;
    const str = buf.toString("utf8");
    if (!str.trim()) continue;
    const existing = out[f.fieldname];
    if (existing == null || (typeof existing === "string" && !String(existing).trim())) {
      out[f.fieldname] = str;
    }
  }
  return out;
}

export class RecruitmentController {
  private readonly svc = new RecruitmentService();
  constructor() { const b=(c:any)=>{for(const k of Object.getOwnPropertyNames(Object.getPrototypeOf(c)))if(k!=="constructor"&&typeof c[k]==="function")c[k]=c[k].bind(c)};b(this); }

  // ── Candidates ──────────────────────────────────────────────────────────────
  async listCandidates(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listCandidates(req.query as QueryParams, req.user)); } catch (e) { next(e); } }
  async getCandidateFilterOptions(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getCandidateFilterOptions(req.query as QueryParams, req.user)); } catch (e) { next(e); } }

  async getCandidateById(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getCandidateById(req.params.id, req.user, req.query as QueryParams)); } catch (e) { next(e); } }

  async getCandidateResume(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const forceDownload = req.query.download === "1" || req.query.download === "true";
      const candidate = await this.svc.getCandidateResume(id, req.user);
      const storedUrl = candidate.resume_url?.trim() ?? "";
      const storedFilename = candidate.resume_filename?.trim() || "resume.pdf";
      const isPlaceholder = !storedUrl || storedUrl === "data:application/octet-stream;base64," || storedUrl === "data:application/octet-stream;base64" || (storedUrl.startsWith("data:application/octet-stream;base64,") && storedUrl.replace(/\s/g,"").length < 60);
      if (isPlaceholder) return res.status(404).json({ error: "No resume" });
      const disposition = forceDownload ? "attachment" : "inline";
      const dispValue = `${disposition}; filename="${storedFilename.replace(/"/g,'\\"')}"`;
      if (storedUrl.startsWith("data:")) {
        const base64Index = storedUrl.indexOf(";base64,");
        if (base64Index !== -1) {
          const contentType = storedUrl.slice(5, base64Index).trim() || "application/octet-stream";
          const buf = Buffer.from(storedUrl.slice(base64Index + 8).replace(/\s/g,""), "base64");
          if (buf.length === 0) return res.status(404).json({ error: "No resume" });
          res.setHeader("Content-Type", contentType);
          res.setHeader("Content-Disposition", dispValue);
          return res.send(buf);
        }
        return res.status(404).json({ error: "No resume" });
      }
      if (storedUrl.startsWith("http://") || storedUrl.startsWith("https://")) {
        const result = await fetchResumeBuffer(storedUrl, storedFilename);
        if (result) {
          res.setHeader("Content-Type", result.contentType);
          res.setHeader("Content-Disposition", forceDownload ? `attachment; filename="${result.filename.replace(/"/g,'\\"')}"` : `inline; filename="${result.filename.replace(/"/g,'\\"')}"`);
          return res.send(result.buffer);
        }
        return res.status(502).json({ error: "Resume link may have expired; re-run migration to store a copy." });
      }
      return res.status(400).json({ error: "Invalid resume format" });
    } catch (e) { next(e); }
  }

  async createCandidate(req: Request, res: Response, next: NextFunction) {
    try {
      const { candidate, isNew } = await this.svc.createCandidate(req.body, req.user, req.query.region as string);
      res.status(isNew ? 201 : 200).json(candidate);
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: e.errors });
      next(e);
    }
  }

  /** Authenticated ATS manual add — always stamps the HR user's region on the candidate. */
  async createCandidateManual(req: Request, res: Response, next: NextFunction) {
    try {
      const { candidate, isNew } = await this.svc.createCandidate(req.body, req.user, req.query.region as string, {
        staffManual: true,
      });
      res.status(isNew ? 201 : 200).json(candidate);
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: e.errors });
      next(e);
    }
  }

  async updateCandidate(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.updateCandidate(req.params.id, req.body, req.user)); } catch (e) { next(e); } }

  async deleteCandidate(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteCandidate(req.params.id, req.user); res.json({ message: "Candidate deleted" }); } catch (e) { next(e); } }

  // ── Job Postings ──────────────────────────────────────────────────────────────
  async listAssignableUsers(_: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listRecruitmentAssignableUsers()); } catch (e) { next(e); } }
  async getJobFilterOptions(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getJobFilterOptions(req.user)); } catch (e) { next(e); } }
  async listJobs(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listJobs(req.query as QueryParams, req.user)); } catch (e) { next(e); } }
  async getPublishedJobs(req: Request, res: Response, next: NextFunction) { try { const region = typeof req.query.region === "string" && req.query.region.trim() ? req.query.region.trim() : null; res.json(await this.svc.getPublishedJobs(region)); } catch (e) { next(e); } }
  async getJobById(req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.getJobById(req.params.id, req.user)); }
    catch (e: any) { if (e?.statusCode) return res.status(e.statusCode).json({ error: e.message }); next(e); }
  }

  async createJob(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json(await this.svc.createJob(req.body, req.user)); }
    catch (e: any) { if (e?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: e.errors }); next(e); }
  }

  async updateJob(req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.updateJob(req.params.id, req.body, req.user)); }
    catch (e: any) { if (e?.statusCode) return res.status(e.statusCode).json({ error: e.message }); next(e); }
  }
  async deleteJob(req: Request, res: Response, next: NextFunction) {
    try { await this.svc.deleteJob(req.params.id, req.user); res.json({ message: "Job posting deleted" }); }
    catch (e: any) { if (e?.statusCode) return res.status(e.statusCode).json({ error: e.message }); next(e); }
  }

  async generateLinkedInPost(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tone = (req.body?.tone as string) || "professional";
      if (!["professional", "casual", "exciting"].includes(tone)) {
        return res.status(400).json({ error: "tone must be one of: professional, casual, exciting" });
      }

      const job = await this.svc.getJobById(id, req.user);
      if (!job) return res.status(404).json({ error: "Job not found" });

      const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
      if (!apiKey) return res.status(503).json({ error: "AI service not configured (ANTHROPIC_API_KEY missing)" });
      if (!apiKey.startsWith("sk-ant-")) {
        return res.status(503).json({ error: "Invalid ANTHROPIC_API_KEY format. Expected key starting with sk-ant-" });
      }

      const salaryPart = [job.salary_range_min, job.salary_range_max].filter(Boolean).length
        ? `${job.salary_currency || ""}${job.salary_range_min ? " " + Number(job.salary_range_min).toLocaleString() : ""}${job.salary_range_max ? " – " + Number(job.salary_range_max).toLocaleString() : ""}`
        : "Not disclosed";
      const experiencePart = job.experience_level || "Not specified";
      const locationPart = [job.location, job.remote ? "(Remote)" : null].filter(Boolean).join(" ") || "Not specified";
      const jobTypePart = job.employment_type ? job.employment_type.replace(/_/g, " ") : "Not specified";
      const descriptionPart = (job.description || "") + (job.requirements ? `\n\nRequirements:\n${job.requirements}` : "");

      const prompt = `You are an expert HR copywriter. Write a ${tone} LinkedIn job post for the following role.

Job details:
- Title: ${job.title}
- Department: ${job.department}
- Location: ${locationPart}
- Job Type: ${jobTypePart}
- Salary Range: ${salaryPart}
- Experience Required: ${experiencePart}
- Description: ${descriptionPart}

Tone instructions:
- professional: formal, structured, corporate language, bullet points for requirements
- casual: friendly, conversational, use "we're looking for", "love to chat"
- exciting: energetic, use urgency words, exclamation marks, bold emojis

Always include:
1. An attention-grabbing opening line with relevant emoji
2. A short intro about the role
3. What the candidate will work on (3–4 bullet points)
4. What we're looking for (3–4 bullet points)
5. Salary, location, job type
6. A clear call to action (apply link or email)
7. 4–6 relevant hashtags at the end

Return only the post text, no explanations.`;

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const post = (message.content[0] as { type: string; text: string }).text ?? "";
      return res.json({ post });
    } catch (e: any) {
      if (e?.statusCode === 404) return res.status(404).json({ error: e.message });
      const msg: string = e?.message ?? String(e);
      if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate") || e?.status === 429) {
        console.warn("[linkedin-post] Claude rate-limit:", msg.slice(0, 300));
        return res.status(429).json({ error: "AI rate limit reached. Please wait a moment and try again." });
      }
      console.error("[linkedin-post] Claude error:", msg.slice(0, 300));
      return res.status(502).json({ error: "AI service unavailable, please try again" });
    }
  }

  // ── Application Form Config (global default) ─────────────────────────────────
  async getApplicationFormConfig(_: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.getApplicationFormConfig()); } catch (e) { next(e); }
  }
  async saveApplicationFormConfig(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.body?.config || typeof req.body.config !== "object") {
        return res.status(400).json({ error: "config is required and must be an object" });
      }
      res.json(await this.svc.saveApplicationFormConfig(req.body.config));
    } catch (e) { next(e); }
  }

  /** Copies the current global default form JSON onto every row in job_postings (uses app DB + live default). */
  async syncApplicationFormToAllJobs(_: Request, res: Response, next: NextFunction) {
    try {
      const { updated } = await this.svc.syncApplicationFormToAllJobs();
      res.json({
        message: "Copied the default application form to all job postings",
        updated,
      });
    } catch (e) { next(e); }
  }

  // ── Per-job Application Form Config ──────────────────────────────────────────
  async getJobApplicationFormConfig(req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.getJobFormConfig(req.params.id)); } catch (e) { next(e); }
  }
  async saveJobApplicationFormConfig(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.body?.config || typeof req.body.config !== "object") {
        return res.status(400).json({ error: "config is required and must be an object" });
      }
      res.json(await this.svc.saveJobFormConfig(req.params.id, req.body.config));
    } catch (e) { next(e); }
  }

  // ── Applications ──────────────────────────────────────────────────────────────
  async listApplications(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listApplications(req.query as QueryParams, req.user)); } catch (e) { next(e); } }
  async getApplicationById(req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.getApplicationById(req.params.id, req.user)); }
    catch (e: any) { if (e?.statusCode) return res.status(e.statusCode).json({ error: e.message }); next(e); }
  }

  async createApplication(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json(await this.svc.createApplication(req.body, req.user?.id ?? null, !!req.user?.id, req.user));
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: e.errors });
      if (e?.code === "23505") return res.status(400).json({ error: "Candidate has already applied to this job" });
      if (e?.statusCode === 403) return res.status(403).json({ error: e.message });
      next(e);
    }
  }

  async updateApplicationStage(req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.updateApplicationStage(req.params.id, req.body, req.user!.id, req.user)); }
    catch (e: any) {
      if (e?.statusCode) return res.status(e.statusCode).json({ error: e.message });
      next(e);
    }
  }

  async restoreWorkflowStage(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await this.svc.restoreWorkflowStage(req.params.id, req.user!.id, req.user));
    } catch (e: any) {
      if (e?.statusCode) return res.status(e.statusCode).json({ error: e.message });
      next(e);
    }
  }

  async addInterviewRound(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json(await this.svc.addInterviewRound(req.params.id, req.body, req.user!.id, req.user));
    } catch (e: any) {
      if (e?.statusCode) return res.status(e.statusCode).json({ error: e.message });
      next(e);
    }
  }

  async getInterviewSchedulePreview(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await this.svc.getInterviewSchedulePreview(req.params.id, req.query as Record<string, string | undefined>, req.user));
    } catch (e) {
      next(e);
    }
  }

  async sendInterviewSchedule(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await this.svc.sendInterviewSchedule(req.params.id, req.body, req.user!.id, req.user));
    } catch (e) {
      next(e);
    }
  }

  async updateApplicationRating(req: Request, res: Response, next: NextFunction) {
    try {
      const raw = req.body.rating;
      if (raw === undefined) {
        res.status(400).json({ error: "rating is required (1-5 or null to clear)" });
        return;
      }
      const rating =
        raw === null || raw === ""
          ? null
          : typeof raw === "number"
            ? (raw >= 1 && raw <= 5 ? raw : undefined)
            : (() => { const n = parseInt(String(raw), 10); return Number.isFinite(n) && n >= 1 && n <= 5 ? n : undefined; })();
      if (rating !== undefined || raw === null || raw === "") {
        res.json(await this.svc.updateApplicationRating(req.params.id, rating ?? null, req.user));
      } else {
        res.status(400).json({ error: "rating must be 1-5 or null" });
      }
    } catch (e: any) {
      if (e?.statusCode) return res.status(e.statusCode).json({ error: e.message });
      next(e);
    }
  }

  async deleteApplication(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteApplication(req.params.id); res.json({ message: "Application deleted" }); } catch (e) { next(e); } }
  async getApplicationHistory(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getApplicationHistory(req.params.id, req.user)); } catch (e) { next(e); } }

  // ── Application Emails ────────────────────────────────────────────────────────
  async listApplicationEmails(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listApplicationEmails(req.params.id, req.user)); } catch (e) { next(e); } }

  async sendApplicationEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const fromEmail = req.user?.email ?? "noreply@ldplogistics.com";
      const result = await this.svc.sendApplicationEmail(req.params.id, req.body, fromEmail, req.user);
      res.status(201).json(result);
    } catch (e: any) {
      if (e?.statusCode === 502) return res.status(502).json({ error: e.userMessage ?? e.message, detail: e.message });
      next(e);
    }
  }

  async handleInboundEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const merged = mergeInboundMultipartBody(req);
      await this.svc.handleInboundEmail(merged);
      res.status(200).json({ ok: true });
    } catch (e: any) {
      if (e?.statusCode === 400) return res.status(400).json({ error: e.message, hint: e.hint });
      next(e);
    }
  }

  async deleteApplicationEmail(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteApplicationEmail(req.params.id, req.params.emailId, req.user); res.status(200).json({ ok: true }); } catch (e) { next(e); } }

  // ── Offers ────────────────────────────────────────────────────────────────────
  async listOffers(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listOffers(req.user)); } catch (e) { next(e); } }

  async getOffer(req: Request, res: Response, next: NextFunction) {
    try {
      const offer = await this.svc.getOfferById(req.params.id, req.user);
      if (!offer) return res.status(404).json({ error: "Offer not found" });
      res.json(offer);
    } catch (e) { next(e); }
  }

  async createOffer(req: Request, res: Response, next: NextFunction) {
    try {
      const protocol = (req.headers["x-forwarded-proto"] as string || req.protocol);
      const host = (req.headers["x-forwarded-host"] as string || req.get("host") || "");
      const appBaseUrl = host ? `${protocol}://${host}` : undefined;
      res.status(201).json(await this.svc.createOffer(req.body, req.user!.id, req.user, appBaseUrl));
    }
    catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: e.errors });
      if (e?.code === "23505") return res.status(400).json({ error: "An offer already exists for this application" });
      next(e);
    }
  }

  async updateOffer(req: Request, res: Response, next: NextFunction) {
    try {
      const protocol = (req.headers["x-forwarded-proto"] as string || req.protocol);
      const host = (req.headers["x-forwarded-host"] as string || req.get("host") || "");
      const appBaseUrl = host ? `${protocol}://${host}` : undefined;
      res.json(await this.svc.updateOffer(req.params.id, req.body, req.user!.id, appBaseUrl, req.user));
    } catch (e) { next(e); }
  }
  async approveOffer(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.approveOffer(req.params.id, req.user!.id, req.user)); } catch (e) { next(e); } }
  async rejectOffer(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.rejectOffer(req.params.id, req.user!.id, req.user)); } catch (e) { next(e); } }

  async getApplicationAuditLog(req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.getApplicationAuditLog(req.params.id, req.user)); } catch (e) { next(e); }
  }

  async requestOfferApproval(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await this.svc.requestOfferApproval(req.params.id, req.user!.id, req.user));
    } catch (e) {
      next(e);
    }
  }

  async uploadOfferLetter(req: Request, res: Response, next: NextFunction) {
    try { await this.svc.uploadOfferLetter(req.params.id, req.body.fileUrl, req.body.fileName, req.user); res.json({ success: true, message: "Offer letter uploaded" }); }
    catch (e) { next(e); }
  }

  async setManualOfferDoc(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.svc.setManualOfferDoc(req.params.id, req.body.fileUrl, req.body.fileName, req.user);
      res.json({ success: true, offer: result });
    } catch (e) { next(e); }
  }

  async getOfferSignedPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.svc.getOfferSignedPdf(req.params.id, req.user);
      if (!result) return res.status(404).json({ error: "Signed PDF not available (offer not yet e-signed or signature data missing)" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${result.filename.replace(/"/g, "%22")}"`);
      res.send(result.buffer);
    } catch (e) { next(e); }
  }

  async getOfferLetter(req: Request, res: Response, next: NextFunction) {
    try {
      const rows = await this.svc.getOfferLetter(req.params.id, req.user);
      const fileUrl = rows.offer_letter_url?.trim();
      const fileName = rows.offer_letter_filename?.trim() || "offer-letter.pdf";
      if (!fileUrl || typeof fileUrl !== "string") {
        return res.status(404).json({ error: "No offer letter uploaded" });
      }
      if (fileUrl.startsWith("data:")) {
        const match = fileUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return res.status(400).json({ error: "Invalid file data" });
        const buffer = Buffer.from(match[2], "base64");
        res.setHeader("Content-Type", match[1].trim() || "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${fileName.replace(/"/g,"%22")}"`);
        return res.send(buffer);
      }
      if (!fileUrl.startsWith("http://") && !fileUrl.startsWith("https://")) {
        return res.status(400).json({ error: "Invalid offer letter URL" });
      }
      res.redirect(302, fileUrl);
    } catch (e) { next(e); }
  }

  async getOfferByToken(req: Request, res: Response, next: NextFunction) {
    try {
      const offer = await this.svc.getOfferByToken(req.params.token);
      const candidateName = [offer.candidate_first_name, offer.candidate_last_name].filter(Boolean).join(" ").trim() || "Candidate";
      const { displayTimeZone, displayDateFormat } = publicDisplayFromBranch(offer.branch_time_zone, offer.branch_date_format);
      res.json({
        id: offer.id,
        candidateName,
        candidateEmail: offer.candidate_email,
        jobTitle: offer.job_title,
        department: offer.department || offer.job_posting_department,
        jobPostingTitle: offer.job_posting_title,
        location: offer.job_location,
        salary: offer.salary,
        salaryCurrency: offer.salary_currency,
        startDate: offer.start_date,
        employmentType: offer.employment_type || offer.job_employment_type,
        terms: offer.terms,
        status: offer.status,
        sentAt: offer.sent_at,
        respondedAt: offer.responded_at,
        displayTimeZone,
        displayDateFormat,
        /** Same `response_token` works on `/offer-sign/:token` when a merged letter exists. */
        hasSigningDocument: !!offer.merged_document_url,
      });
    } catch (e) { next(e); }
  }

  async offerResponseDeprecated(_: Request, res: Response) {
    res.status(410).json({
      error:
        "This link no longer accepts responses online. Open your e-sign offer link from the same email, or contact HR.",
    });
  }

  async getOfferSigningPage(req: Request, res: Response, next: NextFunction) {
    try {
      const { html, offer } = await this.svc.getOfferHtmlByToken(req.params.token);
      const candidateName = [offer.candidate_first_name, offer.candidate_last_name].filter(Boolean).join(" ").trim() || "Candidate";
      res.json({
        id: offer.id,
        candidateName,
        candidateEmail: offer.candidate_email,
        jobTitle: offer.job_title,
        department: offer.department || offer.job_posting_department,
        salary: offer.salary,
        salaryCurrency: offer.salary_currency,
        startDate: offer.start_date,
        employmentType: offer.employment_type,
        status: offer.status,
        esignStatus: offer.esign_status,
        esignSignedAt: offer.esign_signed_at,
        offerHtml: html,
        hasTemplate: !!offer.template_id,
        hasPdf: !!offer.merged_document_url,
        expiresAt: offer.esign_token_expires_at,
      });
    } catch (e) { next(e); }
  }

  async getOfferSigningPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.params.token;
      if (!token || token.length < 16) return res.status(400).json({ error: "Invalid token" });
      const offer = await this.svc.getOfferByToken(token);
      if (!offer) return res.status(404).json({ error: "Offer not found" });
      if (!offer.merged_document_url) return res.status(404).json({ error: "No document available" });
      const { OfferTemplateService } = await import("../offer-templates/OfferTemplateService.js");
      const tmplSvc = new OfferTemplateService();
      // Match original letter layout (not signing-page preview with [Sign here] boxes)
      const pdfBuf = await tmplSvc.docxToUnsignedOfferPdf(offer.merged_document_url);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="offer-letter.pdf"`);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(pdfBuf);
    } catch (e) { next(e); }
  }

  async submitEsign(req: Request, res: Response, next: NextFunction) {
    try {
      const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "").split(",")[0].trim();
      const ua = req.headers["user-agent"] || "";
      const result = await this.svc.submitEsign(req.params.token, req.body.signatureData, ip, ua);
      res.json({ success: true, message: "Offer signed successfully", status: result.status });
    } catch (e) { next(e); }
  }

  async declineOfferByToken(req: Request, res: Response, next: NextFunction) {
    try {
      await this.svc.declineOfferByToken(req.params.token);
      res.json({ success: true, message: "Offer declined" });
    } catch (e) { next(e); }
  }

  async mergeOfferTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { templateId, variableOverrides } = req.body;
      if (!templateId) return res.status(400).json({ error: "templateId is required" });
      const protocol = (req.headers["x-forwarded-proto"] as string || req.protocol);
      const host = (req.headers["x-forwarded-host"] as string || req.get("host") || "");
      const appBaseUrl = host ? `${protocol}://${host}` : undefined;
      const result = await this.svc.mergeOfferTemplate(req.params.id, templateId, variableOverrides, req.user?.id, appBaseUrl);
      res.json({ success: true, ...result });
    } catch (e) { next(e); }
  }

  async getOfferVariables(req: Request, res: Response, next: NextFunction) {
    try {
      const variables = await this.svc.buildOfferVariables(req.params.id);
      res.json({ success: true, data: { variables } });
    } catch (e) { next(e); }
  }

  async getOfferLink(req: Request, res: Response, next: NextFunction) {
    try {
      const protocol = (req.headers["x-forwarded-proto"] || req.protocol) as string;
      const host = (req.headers["x-forwarded-host"] || req.get("host")) as string;
      res.json(await this.svc.getOfferLink(req.params.id, protocol, host, req.user));
    } catch (e) { next(e); }
  }

  // ── Hire ─────────────────────────────────────────────────────────────────────
  async hireCandidate(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json(await this.svc.hireCandidate(req.params.id, req.body, req.user!.id, req.user)); }
    catch (e: any) {
      if (e?.code === "23505") return res.status(409).json({ error: "Employee ID or work email already exists" });
      if (e?.code === "22P02") return res.status(400).json({ error: "Invalid employee data from offer or candidate profile. Please check employment type and personal details." });
      next(e);
    }
  }

  // ── Application Comments ──────────────────────────────────────────────────────
  async listApplicationComments(req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.listApplicationComments(req.params.id, req.user)); } catch (e) { next(e); }
  }

  async createApplicationComment(req: Request, res: Response, next: NextFunction) {
    try {
      const { body, visibility = "public", attachments = [], mentions = [] } = req.body;
      if (!body?.trim()) return res.status(400).json({ error: "body is required" });
      const comment = await this.svc.createApplicationComment(
        req.params.id,
        body,
        visibility,
        attachments,
        mentions,
        req.user!,
      );
      res.status(201).json(comment);
    } catch (e) { next(e); }
  }

  async deleteApplicationComment(req: Request, res: Response, next: NextFunction) {
    try {
      await this.svc.deleteApplicationComment(req.params.commentId, req.user!);
      res.json({ success: true });
    } catch (e) { next(e); }
  }

  async getMentionableUsers(req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.getMentionableUsers(req.params.id, req.user)); } catch (e) { next(e); }
  }

  async uploadCommentAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      const files = (req as any).files as Express.Multer.File[] | undefined;
      const file = files?.[0] ?? (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const { uploadFileToSharePoint, isSharePointAvatarConfigured } = await import("../../lib/sharepoint.js");
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileName = `${Date.now()}_${sanitized}`;
      let url: string | null = null;

      if (isSharePointAvatarConfigured()) {
        url = await uploadFileToSharePoint(
          `Recruitment/CommentAttachments`,
          fileName,
          file.buffer,
          file.mimetype,
        );
      }

      res.json({
        name: file.originalname,
        url: url ?? "",
        mime: file.mimetype,
        size: file.size,
      });
    } catch (e) { next(e); }
  }

  // ── Interview Feedback ────────────────────────────────────────────────────────

  async listScheduledInterviews(req: Request, res: Response, next: NextFunction) {
    try {
      const limitRaw = req.query.limit != null ? Number(req.query.limit) : undefined;
      res.json(await this.svc.listScheduledInterviews(req.user, limitRaw));
    } catch (e) { next(e); }
  }

  async listMyInterviewerAssignments(req: Request, res: Response, next: NextFunction) {
    try {
      const limitRaw = req.query.limit != null ? Number(req.query.limit) : undefined;
      res.json(await this.svc.listMyInterviewerAssignments(req.user, limitRaw));
    } catch (e) { next(e); }
  }

  async getApplicationInterviews(req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.getApplicationInterviews(req.params.id, req.user)); }
    catch (e) { next(e); }
  }

  async getInterviewFeedback(req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.getInterviewFeedback(req.params.id, req.params.historyId, req.user)); }
    catch (e) { next(e); }
  }

  async submitInterviewFeedback(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as {
        status: "draft" | "submitted" | "no_show";
        overallRating?: number | null;
        overallComments?: string | null;
        scorecard?: unknown[];
      };
      res.json(await this.svc.submitInterviewFeedback(req.params.id, req.params.historyId, body, req.user));
    } catch (e) { next(e); }
  }

  async sendInterviewFeedbackReminder(req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.sendInterviewFeedbackReminder(req.params.id, req.params.historyId, req.user)); }
    catch (e) { next(e); }
  }

  async editInterview(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
      res.json(await this.svc.editInterview(req.params.id, req.params.historyId, req.body, req.user.id, req.user));
    } catch (e) { next(e); }
  }

  async cancelInterview(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
      res.json(await this.svc.cancelInterview(req.params.id, req.params.historyId, req.user.id, req.user));
    } catch (e) { next(e); }
  }

  async markInterviewNoShow(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
      res.json(await this.svc.markInterviewNoShow(req.params.id, req.params.historyId, req.user.id, req.user));
    } catch (e) { next(e); }
  }

  async uploadInterviewTestReport(req: Request, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file?.buffer?.length) return res.status(400).json({ error: "No file provided" });
      const result = await this.svc.uploadInterviewTestReport(
        req.params.id,
        req.params.historyId,
        file.buffer,
        file.originalname,
        file.mimetype,
        req.user,
      );
      res.json(result);
    } catch (e) { next(e); }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────
  async getStats(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getStats(req.user)); } catch (e) { next(e); } }

  // ── FreshTeam ─────────────────────────────────────────────────────────────────
  async migrateFreshteamJobs(_: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.migrateFreshteamJobs()); }
    catch (e: any) { if (e?.statusCode === 503) return res.status(503).json({ error: e.message, message: "Set FRESHTEAM_DOMAIN and FRESHTEAM_API_KEY in .env" }); next(e); }
  }

  async syncFreshteamJobAudit(_: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.migrateFreshteamJobAudit()); }
    catch (e: any) { if (e?.statusCode === 503) return res.status(503).json({ error: e.message, message: "Set FRESHTEAM_DOMAIN and FRESHTEAM_API_KEY in .env" }); next(e); }
  }

  async migrateFreshteamCandidates(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const phase2ResumeRaw = (body as { phase2ResumeAfterProcessed?: unknown }).phase2ResumeAfterProcessed;
      const ftJobIdsRaw = (body as { ftJobIds?: unknown }).ftJobIds;
      const ftJobIds = Array.isArray(ftJobIdsRaw)
        ? ftJobIdsRaw.map((id) => String(id).trim()).filter(Boolean)
        : undefined;
      res.json(
        await this.svc.migrateFreshteamCandidates({
          phase2Only: (body as { phase2Only?: boolean }).phase2Only === true,
          onlyZeroApplicantJobs: (body as { onlyZeroApplicantJobs?: boolean }).onlyZeroApplicantJobs === true,
          ftJobIds,
          phase2ResumeAfterProcessed:
            typeof phase2ResumeRaw === "number" && Number.isFinite(phase2ResumeRaw)
              ? phase2ResumeRaw
              : typeof phase2ResumeRaw === "string" && /^\d+$/.test(phase2ResumeRaw)
                ? parseInt(phase2ResumeRaw, 10)
                : undefined,
        })
      );
    }
    catch (e: any) {
      if (e?.statusCode === 503) return res.status(503).json({ error: e.message });
      if (e?.statusCode === 409) return res.status(409).json({ error: e.message });
      next(e);
    }
  }
}
