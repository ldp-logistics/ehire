-- Add 'it' to user_role enum (run this if 0013_rbac_harden wasn't applied or enum add failed).
-- Safe to run: IF NOT EXISTS prevents duplicate value (PostgreSQL 10+).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'it';
