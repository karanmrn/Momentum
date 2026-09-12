import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const roles = ['anon', 'authenticated', 'service_role', 'streetwise_demo_app'] as const;
const tables = ['dataset_artifacts', 'dataset_records'] as const;
const artifactId = 'a'.repeat(64);
let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE streetwise_demo_app NOLOGIN;
    CREATE ROLE research_ingest_test NOLOGIN NOBYPASSRLS;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon, authenticated, service_role, streetwise_demo_app;
  `);
  await database.exec(await readFile(new URL(
    '../../supabase/migrations/20260912143718_private_research_datasets.sql', import.meta.url,
  ), 'utf8'));
  await database.query(`INSERT INTO research.dataset_artifacts
    (artifact_id,dataset,relative_path,sha256,byte_count,record_count,manifest)
    VALUES ($1,'fixture','fixtures/synthetic-test.json',$1,100,1,'{"testFixture":true}')`, [artifactId]);
  await database.query(`INSERT INTO research.dataset_records
    (artifact_id,record_key,pilot_id,source_id,source_url,fetched_at,observed_at,raw)
    VALUES ($1,'fixture-1','camden_town','TEST-FIXTURE','https://example.test/source',
      '2026-09-12T14:00:00Z','2026-09','{"testFixture":true}')`, [artifactId]);
});
afterAll(async () => { await database?.close(); });

describe('private research dataset storage', () => {
  it('enables and forces RLS on both tables with no default policies', async () => {
    const result = await database.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='research' AND c.relkind='r' ORDER BY c.relname`);
    expect(result.rows).toEqual(tables.map(relname => ({ relname, relrowsecurity: true, relforcerowsecurity: true })));
    expect((await database.query("SELECT policyname FROM pg_policies WHERE schemaname='research'")).rows).toEqual([]);
  });

  it.each(roles)('removes schema and default table grants from %s', async role => {
    const result = await database.query<{ schema_access: boolean; table_access: boolean }>(`
      SELECT has_schema_privilege($1,'research','USAGE') AS schema_access,
        has_table_privilege($1,'research.dataset_artifacts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
        OR has_table_privilege($1,'research.dataset_records','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS table_access`, [role]);
    expect(result.rows).toEqual([{ schema_access: false, table_access: false }]);
  });

  it.each(roles.flatMap(role => tables.map(table => ({ role, table }))))(
    'denies $role direct reads of $table', async ({ role, table }) => {
      await expect(database.transaction(async tx => {
        await tx.exec(`SET LOCAL ROLE ${role}`);
        await tx.query(`SELECT * FROM research.${table}`);
      })).rejects.toMatchObject({ code: '42501' });
    },
  );

  it.each(roles)('still denies %s table access if schema usage is granted later', async role => {
    await expect(database.transaction(async tx => {
      await tx.exec(`GRANT USAGE ON SCHEMA research TO ${role}; SET LOCAL ROLE ${role};`);
      await tx.query('SELECT raw FROM research.dataset_records');
    })).rejects.toMatchObject({ code: '42501' });
  });

  it.each(roles)('denies %s inserts into research records', async role => {
    await expect(database.transaction(async tx => {
      await tx.exec(`SET LOCAL ROLE ${role}`);
      await tx.query(`INSERT INTO research.dataset_records(artifact_id,record_key,source_id,raw)
        VALUES($1,'blocked','TEST-FIXTURE','{}')`, [artifactId]);
    })).rejects.toMatchObject({ code: '42501' });
  });

  it.each(['london', 'hounslow', 'camden_town_centre', 'east_croydon', 'west-croydon'])(
    'rejects an unsupported pilot ID: %s', async pilotId => {
      await expect(database.transaction(tx => tx.query(`INSERT INTO research.dataset_records
        (artifact_id,record_key,pilot_id,source_id,raw) VALUES($1,'bad-pilot',$2,'TEST-FIXTURE','{}')`,
      [artifactId, pilotId]))).rejects.toMatchObject({ code: '23514' });
    },
  );

  it('accepts all contract pilot IDs and an explicitly unknown pilot', async () => {
    const result = await database.transaction(async tx => {
      const pilots = ['hounslow_town_centre', 'camden_town', 'west_croydon', null];
      for (const [index, pilot] of pilots.entries()) {
        await tx.query(`INSERT INTO research.dataset_records(artifact_id,record_key,pilot_id,source_id,raw)
          VALUES($1,$2,$3,'TEST-FIXTURE','{}')`, [artifactId, `pilot-${index}`, pilot]);
      }
      return tx.query('SELECT pilot_id FROM research.dataset_records WHERE record_key LIKE $1 ORDER BY record_key', ['pilot-%']);
    });
    expect(result.rows).toEqual([
      { pilot_id: 'hounslow_town_centre' }, { pilot_id: 'camden_town' }, { pilot_id: 'west_croydon' }, { pilot_id: null },
    ]);
  });

  it.each(tables.flatMap(table => ['publication_allowed', 'synthetic'].map(column => ({ table, column })) ))(
    'rejects enabling $column on $table', async ({ table, column }) => {
      await expect(database.transaction(tx => tx.query(`UPDATE research.${table} SET ${column}=true WHERE artifact_id=$1`,
        [artifactId]))).rejects.toMatchObject({ code: '23514' });
    },
  );

  it('defaults imported rows to private and non-synthetic and preserves source dates', async () => {
    expect((await database.query(`SELECT publication_allowed,synthetic FROM research.dataset_artifacts WHERE artifact_id=$1`,
      [artifactId])).rows).toEqual([{ publication_allowed: false, synthetic: false }]);
    const rows = (await database.query<{ publication_allowed: boolean; synthetic: boolean; observed_at: string; fetched_at: Date }>(`
      SELECT publication_allowed,synthetic,observed_at,fetched_at FROM research.dataset_records WHERE record_key='fixture-1'`)).rows;
    expect(rows[0]).toMatchObject({ publication_allowed: false, synthetic: false, observed_at: '2026-09' });
    expect(new Date(rows[0].fetched_at).toISOString()).toBe('2026-09-12T14:00:00.000Z');
  });

  it.each([
    { column: 'artifact_id', value: 'not-a-checksum' },
    { column: 'sha256', value: 'x'.repeat(64) },
    { column: 'dataset', value: '' },
    { column: 'relative_path', value: '' },
    { column: 'byte_count', value: -1 },
    { column: 'record_count', value: -1 },
    { column: 'manifest', value: '[]' },
  ])('enforces artifact metadata constraints: $column', async ({ column, value }) => {
    await expect(database.transaction(tx => tx.query(`UPDATE research.dataset_artifacts SET ${column}=$2 WHERE artifact_id=$1`,
      [artifactId, value]))).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects records without their registered artifact and duplicate record keys', async () => {
    await expect(database.transaction(tx => tx.query(`INSERT INTO research.dataset_records(artifact_id,record_key,source_id,raw)
      VALUES($1,'orphan','TEST-FIXTURE','{}')`, ['b'.repeat(64)]))).rejects.toMatchObject({ code: '23503' });
    await expect(database.transaction(tx => tx.query(`INSERT INTO research.dataset_records(artifact_id,record_key,source_id,raw)
      VALUES($1,'fixture-1','TEST-FIXTURE','{}')`, [artifactId]))).rejects.toMatchObject({ code: '23505' });
  });

  it('requires explicit RLS policies as well as grants for a dedicated ingest role', async () => {
    await expect(database.transaction(async tx => {
      await tx.exec(`GRANT USAGE ON SCHEMA research TO research_ingest_test;
        GRANT SELECT,INSERT ON research.dataset_artifacts,research.dataset_records TO research_ingest_test;
        SET LOCAL ROLE research_ingest_test;`);
      expect((await tx.query('SELECT * FROM research.dataset_records')).rows).toEqual([]);
      await tx.query(`INSERT INTO research.dataset_records(artifact_id,record_key,source_id,raw)
        VALUES($1,'no-policy','TEST-FIXTURE','{}')`, [artifactId]);
    })).rejects.toMatchObject({ code: '42501' });
  });

  it('allows scoped private ingestion after explicit grants and policies, without bypassing RLS', async () => {
    await database.transaction(async tx => {
      await tx.exec(`GRANT USAGE ON SCHEMA research TO research_ingest_test;
        GRANT SELECT,INSERT ON research.dataset_artifacts,research.dataset_records TO research_ingest_test;
        CREATE POLICY test_ingest_artifact_select ON research.dataset_artifacts
          FOR SELECT TO research_ingest_test USING (NOT publication_allowed AND NOT synthetic);
        CREATE POLICY test_ingest_artifact_insert ON research.dataset_artifacts
          FOR INSERT TO research_ingest_test WITH CHECK (NOT publication_allowed AND NOT synthetic);
        CREATE POLICY test_ingest_record_select ON research.dataset_records
          FOR SELECT TO research_ingest_test USING (NOT publication_allowed AND NOT synthetic);
        CREATE POLICY test_ingest_record_insert ON research.dataset_records
          FOR INSERT TO research_ingest_test WITH CHECK (NOT publication_allowed AND NOT synthetic);
        SET LOCAL ROLE research_ingest_test;`);
      await tx.query(`INSERT INTO research.dataset_artifacts
        (artifact_id,dataset,relative_path,sha256,byte_count,record_count,manifest)
        VALUES($1,'fixture','fixtures/ingest-test.json',$1,2,1,'{}')`, ['c'.repeat(64)]);
      await tx.query(`INSERT INTO research.dataset_records(artifact_id,record_key,pilot_id,source_id,raw)
        VALUES($1,'ingest-proof','west_croydon','TEST-FIXTURE','{"testFixture":true}')`, ['c'.repeat(64)]);
      expect((await tx.query(`SELECT publication_allowed,synthetic FROM research.dataset_records WHERE record_key='ingest-proof'`)).rows)
        .toEqual([{ publication_allowed: false, synthetic: false }]);
      expect((await tx.query('SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows).toEqual([{ rolbypassrls: false }]);
    });
    await expect(database.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE research_ingest_test');
      await tx.query('DELETE FROM research.dataset_records');
    })).rejects.toMatchObject({ code: '42501' });
  });
});
