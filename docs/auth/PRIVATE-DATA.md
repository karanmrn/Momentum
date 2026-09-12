# Private account data contract 1.0

This module uses the UUID from verified Supabase Auth responses.
Demo personas, synthetic sessions, and public graph projections remain separate.

## Setup

Apply `supabase/migrations/20260912160000_private_accounts.sql` after review.
Set server-only `ACCOUNT_DATABASE_URL` to the selected private account database connection.
Do not expose this URL in browser configuration.
The connection must support transactions and `SET LOCAL ROLE streetwise_account_app`.
The hosted application does not apply this migration automatically.

Retain `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from the existing account contract.
Keep email confirmation enabled.
No provider identity or production database is changed by this code delivery.

## HTTP interface

Each operation requires a verified, confirmed, non-anonymous account token.
All responses use `Cache-Control: no-store` and the version 1.0 envelope.
The server supplies ownership. Client owner fields and role metadata cannot grant access.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/account/data/reports` | Read owned private reports. |
| POST | `/api/account/data/reports` | Reject while public intake remains closed. |
| GET, PUT | `/api/account/data/follows` | Read or replace explicit area/category follows and pause state. |
| GET | `/api/account/data/inbox` | Read owned notification metadata. |
| PATCH | `/api/account/data/inbox/:id` | Mark an owned entry read using `{read:true}`. |
| GET | `/api/account/data/scopes` | Read current server-assigned area authority. |
| GET | `/api/account/data/export` | Export owned application data. |
| DELETE | `/api/account/data` | Delete owned application data after explicit confirmation. |

Deletion requires `{confirmation:"DELETE MY ACCOUNT DATA"}`.
Deletion removes private reports, follows, inbox entries, and account role assignments atomically.
A minimal UUID tombstone prevents existing tokens from recreating deleted data.
This operation does not delete the Supabase Auth identity.
The UI signs out after application data deletion.
Provider identity deletion requires a separate supported administrative process.

## Isolation and limits

Role grants are operator-controlled, area-specific, expiring, and revocable.
The runtime cannot grant itself moderator or partner authority.
No account role currently opens partner publishing or public intake.
Private reports are not copied into public graphs, model prompts, caches, or external deliveries.
Exports and deletion cover this module's stored data, not unrelated future data stores.
Future consumers must add deletion behavior before copying private data.

Routes enforce bounded JSON, account request budgets, strict schemas, and same-origin browser writes.
Missing storage returns an unavailable state. It never becomes an empty success.
Deleted accounts return 410 for later data operations.

## Remaining operational checks

Apply the migration only to the explicitly selected database.
Verify hosted RLS, grants, TLS, and pooler transaction behavior before activation.
Verify real provider confirmation and logout through the selected project.
Keep public intake and external push closed until their separate reviews pass.
