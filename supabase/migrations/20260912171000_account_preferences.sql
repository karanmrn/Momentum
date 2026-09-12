-- Extends the existing forced-RLS owner row. Account deletion already removes this row.
ALTER TABLE private_accounts.follows ADD COLUMN IF NOT EXISTS settings jsonb;
ALTER TABLE private_accounts.follows ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='account_settings_object' AND conrelid='private_accounts.follows'::regclass) THEN
  ALTER TABLE private_accounts.follows ADD CONSTRAINT account_settings_object CHECK (settings IS NULL OR (jsonb_typeof(settings)='object' AND octet_length(settings::text)<=16384) IS TRUE);
 END IF;
END $$;
