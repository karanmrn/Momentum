-- Private account data is separate from all public and demonstration projections.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='streetwise_account_app') THEN
    CREATE ROLE streetwise_account_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS private_accounts;
REVOKE ALL ON SCHEMA private_accounts FROM PUBLIC;
GRANT USAGE ON SCHEMA private_accounts TO streetwise_account_app;
CREATE TABLE private_accounts.accounts (
 owner uuid PRIMARY KEY, deleted_at timestamptz
);
CREATE TABLE private_accounts.reports (
 id uuid PRIMARY KEY, owner uuid NOT NULL REFERENCES private_accounts.accounts,
 pilot_id text NOT NULL CHECK(pilot_id IN ('hounslow_town_centre','camden_town','west_croydon')),
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 120),
 description text NOT NULL CHECK(length(trim(description)) BETWEEN 10 AND 2000),
 source_basis text NOT NULL CHECK(source_basis IN ('firsthand','other_source')),
 client_request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner,client_request_id)
);
CREATE TABLE private_accounts.follows (
 owner uuid PRIMARY KEY REFERENCES private_accounts.accounts,
 pilot_ids text[] NOT NULL CHECK(cardinality(pilot_ids)<=3 AND pilot_ids <@ ARRAY['hounslow_town_centre','camden_town','west_croydon']::text[]),
 categories text[] NOT NULL CHECK(cardinality(categories)<=3 AND categories <@ ARRAY['infrastructure','community','transport']::text[]),
 paused boolean NOT NULL
);
CREATE TABLE private_accounts.inbox (
 id uuid PRIMARY KEY, owner uuid NOT NULL REFERENCES private_accounts.accounts,
 pilot_id text NOT NULL CHECK(pilot_id IN ('hounslow_town_centre','camden_town','west_croydon')),
 notice_id text NOT NULL CHECK(length(notice_id) BETWEEN 1 AND 160),
 created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
CREATE TABLE private_accounts.scopes (
 owner uuid NOT NULL REFERENCES private_accounts.accounts,
 pilot_id text NOT NULL CHECK(pilot_id IN ('hounslow_town_centre','camden_town','west_croydon')),
 role text NOT NULL CHECK(role IN ('moderator','partner')),
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 PRIMARY KEY(owner,pilot_id,role)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['accounts','reports','follows','inbox','scopes'] LOOP
 EXECUTE format('ALTER TABLE private_accounts.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE private_accounts.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY own_rows ON private_accounts.%I TO streetwise_account_app USING (owner = nullif(current_setting(''app.account_id'',true),'''')::uuid) WITH CHECK (owner = nullif(current_setting(''app.account_id'',true),'''')::uuid)',t);
 EXECUTE format('REVOKE ALL ON private_accounts.%I FROM PUBLIC',t);
 END LOOP;
END $$;
GRANT SELECT ON private_accounts.accounts TO streetwise_account_app;
GRANT INSERT(owner) ON private_accounts.accounts TO streetwise_account_app;
GRANT SELECT, INSERT ON private_accounts.reports TO streetwise_account_app;
GRANT SELECT, INSERT, UPDATE ON private_accounts.follows TO streetwise_account_app;
GRANT SELECT ON private_accounts.inbox, private_accounts.scopes TO streetwise_account_app;
GRANT UPDATE(read_at) ON private_accounts.inbox TO streetwise_account_app;
-- Only this fixed function can erase rows and create a permanent tombstone.
CREATE FUNCTION private_accounts.delete_owned_data() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE account uuid := nullif(current_setting('app.account_id',true),'')::uuid;
BEGIN
 IF account IS NULL THEN RAISE EXCEPTION 'Account required'; END IF;
 DELETE FROM private_accounts.reports WHERE owner=account;
 DELETE FROM private_accounts.follows WHERE owner=account;
 DELETE FROM private_accounts.inbox WHERE owner=account;
 DELETE FROM private_accounts.scopes WHERE owner=account;
 UPDATE private_accounts.accounts SET deleted_at=now() WHERE owner=account;
END $$;
REVOKE ALL ON FUNCTION private_accounts.delete_owned_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private_accounts.delete_owned_data() TO streetwise_account_app;
CREATE INDEX reports_owner ON private_accounts.reports(owner,created_at);
CREATE INDEX inbox_owner ON private_accounts.inbox(owner,created_at);

-- Deleted UUIDs cannot regain private rows.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['reports','follows','inbox','scopes'] LOOP
 EXECUTE format($policy$CREATE POLICY active_account ON private_accounts.%I AS RESTRICTIVE TO streetwise_account_app USING (EXISTS (SELECT 1 FROM private_accounts.accounts a WHERE a.owner = nullif(current_setting('app.account_id',true),'')::uuid AND a.deleted_at IS NULL)) WITH CHECK (EXISTS (SELECT 1 FROM private_accounts.accounts a WHERE a.owner = nullif(current_setting('app.account_id',true),'')::uuid AND a.deleted_at IS NULL))$policy$,t);
 END LOOP;
END $$;
