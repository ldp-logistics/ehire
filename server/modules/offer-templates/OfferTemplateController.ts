import type { Request, Response, NextFunction } from "express";
import { OfferTemplateService } from "./OfferTemplateService.js";
import { ApiResponse } from "../../core/utils/apiResponse.js";
import { OFFER_MERGE_TEXT_FIELD_KEYS } from "../../../shared/offerMergeFields.js";

export class OfferTemplateController {
  private svc = new OfferTemplateService();

  constructor() {
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.create = this.create.bind(this);
    this.update = this.update.bind(this);
    this.remove = this.remove.bind(this);
    this.preview = this.preview.bind(this);
    this.uploadPdfTemplate = this.uploadPdfTemplate.bind(this);
    this.getPdfFieldNames = this.getPdfFieldNames.bind(this);
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const templates = await this.svc.list(includeInactive);
      ApiResponse.ok(res, { templates });
    } catch (e) { next(e); }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const template = await this.svc.getById(req.params.id);
      ApiResponse.ok(res, template);
    } catch (e: any) {
      if (e.status === 404) return ApiResponse.error(res, 404, e.message, "NOT_FOUND");
      next(e);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, description, docxBase64, docxFilename, pdfBase64, pdfFilename } = req.body;
      const template = await this.svc.create({
        name,
        description,
        docxBase64,
        docxFilename: docxFilename || "template.docx",
        pdfBase64,
        pdfFilename: pdfFilename || "template.pdf",
        createdBy: req.user?.id || null,
      });
      ApiResponse.created(res, template);
    } catch (e: any) {
      if (e.status === 400) return ApiResponse.error(res, 400, e.message, "VALIDATION_ERROR");
      next(e);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, description, docxBase64, docxFilename, isActive } = req.body;
      const template = await this.svc.update(req.params.id, {
        name,
        description,
        docxBase64,
        docxFilename,
        isActive,
      });
      ApiResponse.ok(res, template);
    } catch (e: any) {
      if (e.status === 404) return ApiResponse.error(res, 404, e.message, "NOT_FOUND");
      if (e.status === 400) return ApiResponse.error(res, 400, e.message, "VALIDATION_ERROR");
      next(e);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await this.svc.delete(req.params.id);
      ApiResponse.noContent(res);
    } catch (e: any) {
      if (e.status === 404) return ApiResponse.error(res, 404, e.message, "NOT_FOUND");
      next(e);
    }
  }

  /** POST /api/offer-templates/:id/preview — merge sample variables and return HTML. */
  async preview(req: Request, res: Response, next: NextFunction) {
    try {
      const template = await this.svc.getById(req.params.id);
      const variables = req.body.variables || {};
      if (template.template_type === "pdf_form" && template.pdf_template_url) {
        const html = await this.svc.previewPdfFormFilledHtml(template, variables);
        return ApiResponse.ok(res, { html });
      }
      const mergedDocx = await this.svc.mergeTemplate(template.docx_data, variables);
      // Use preview mode so signature markers render as visible [Sign here] boxes
      const html = await this.svc.docxToHtmlWithSignaturePreview(mergedDocx);
      ApiResponse.ok(res, { html });
    } catch (e: any) {
      if (e.status === 404) return ApiResponse.error(res, 404, e.message, "NOT_FOUND");
      next(e);
    }
  }

  /**
   * POST /api/offer-templates/:id/upload-pdf
   * Body: { pdfBase64: string, pdfFilename?: string }
   *
   * Validates the uploaded PDF has AcroForm fields, stores it, sets template_type = 'pdf_form',
   * and returns the list of discovered field names so HR can verify.
   */
  async uploadPdfTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const { pdfBase64, pdfFilename } = req.body as { pdfBase64?: string; pdfFilename?: string };
      if (!pdfBase64) return ApiResponse.error(res, 400, "pdfBase64 is required", "VALIDATION_ERROR");

      const MAX_PDF_BYTES = 10 * 1024 * 1024;
      const buf = Buffer.from(pdfBase64, "base64");
      if (buf.length > MAX_PDF_BYTES) {
        return ApiResponse.error(res, 400, "PDF must be at most 10 MB", "VALIDATION_ERROR");
      }
      if (buf.slice(0, 4).toString("ascii") !== "%PDF") {
        return ApiResponse.error(res, 400, "Uploaded file is not a valid PDF", "VALIDATION_ERROR");
      }

      const { inspectPdfFormFields } = await import("./pdfFormService.js");
      const fields = await inspectPdfFormFields(buf);

      const template = await this.svc.storePdfTemplate(req.params.id, pdfBase64, pdfFilename || "template.pdf");
      ApiResponse.ok(res, {
        success: true,
        template,
        fields,
        knownFieldNames: [...OFFER_MERGE_TEXT_FIELD_KEYS],
      });
    } catch (e: any) {
      if (e.status === 404) return ApiResponse.error(res, 404, e.message, "NOT_FOUND");
      if (e.status === 400) return ApiResponse.error(res, 400, e.message, "VALIDATION_ERROR");
      next(e);
    }
  }

  /** GET /api/offer-templates/pdf-field-names — return the canonical field name list. */
  async getPdfFieldNames(_req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, { fields: [...OFFER_MERGE_TEXT_FIELD_KEYS] });
    } catch (e) { next(e); }
  }
}
