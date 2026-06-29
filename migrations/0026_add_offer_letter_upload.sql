-- Add offer letter PDF storage to offers (upload after approval; email sending via nodemailer later).
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS offer_letter_url text,
  ADD COLUMN IF NOT EXISTS offer_letter_filename text;

COMMENT ON COLUMN offers.offer_letter_url IS 'Data URL or path to uploaded offer letter PDF';
COMMENT ON COLUMN offers.offer_letter_filename IS 'Original filename of the offer letter PDF';
