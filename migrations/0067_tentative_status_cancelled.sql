-- Allow marking tentative as cancelled when application is moved out of tentative stage (not a compliance failure).
ALTER TYPE tentative_status ADD VALUE IF NOT EXISTS 'cancelled';
