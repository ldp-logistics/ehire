-- Run after 0075_break_glass_security.sql (adds TOTP / must_change columns).
-- Rename baseline break-glass admin row to the real Microsoft sign-in email.
-- Same user id, SSO + local password / TOTP flows unchanged.

UPDATE users
SET email = 'ehire@ldplogistics.com', updated_at = NOW()
WHERE LOWER(TRIM(email)) = 'admin@admani.com';
