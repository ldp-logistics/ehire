-- ──────────────────────────────────────────────────────────────────────────────
-- 0092 — Fix offer_templates marked pdf_form but backed by a Word (.docx) file
-- (caused merge to use fillOfferPdfTemplate on non-PDF bytes → unresolved {{…}})
-- ──────────────────────────────────────────────────────────────────────────────

UPDATE offer_templates
SET template_type = 'docx'
WHERE template_type = 'pdf_form'
  AND (
    (docx_data IS NOT NULL AND trim(docx_data) <> '')
    OR lower(coalesce(docx_filename, '')) LIKE '%.docx'
  );
