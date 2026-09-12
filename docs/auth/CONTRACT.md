# Account contract 1.0

Real accounts use Supabase Auth. Demo personas remain separate.
The server never accepts a client-selected account ID, role, or moderator persona.

## Configuration

Set these server environment variables after the user selects a hosted Supabase project:

- `SUPABASE_URL`: the selected project's HTTPS origin.
- `SUPABASE_PUBLISHABLE_KEY`: its modern `sb_publishable_` key.

Do not use a service role, secret key, or legacy JWT key here.
The server exposes this publishable configuration through the account config endpoint.
Passwords and refresh tokens go directly to the selected Supabase Auth service through its browser SDK.
They do not pass through the Streetwise server.

The pinned client is `@supabase/supabase-js` version `2.116.0`.
Configure the Supabase Site URL and permitted confirmation redirect URLs for the deployed website.
Keep email confirmation enabled. Do not disable it to make tests pass.
Custom domains and local Supabase origins are not supported by this configuration validator.

## Public configuration

`GET /api/account/config` returns the standard version 1.0 envelope with `synthetic: false`.
Its `data` is:

```ts
{ configured: boolean; supabaseUrl: string | null; publishableKey: string | null }
```

Missing or invalid configuration returns `configured: false` and null values.
Do not show a working signup form when configuration is unavailable.
This route does not require the demo invitation or a database session.

## Verified account

Send `Authorization: Bearer <access_token>` to `GET /api/account/session`.
The server validates each token with Supabase `auth.getUser(token)`.
A successful envelope contains:

```ts
{ id: string; emailConfirmed: true; role: 'member' }
```

The UUID comes only from the verified provider response.
User metadata, email content, passwords, tokens, and profile details are excluded.
User-editable role metadata cannot grant moderator access.
The server does not persist, refresh, or cache these access tokens.

| HTTP status | Meaning |
| --- | --- |
| 200 | Verified, confirmed, non-anonymous member |
| 401 | Missing, malformed, rejected, or expired token |
| 403 | Anonymous account or unconfirmed email |
| 429 | Provider or local verification capacity limit |
| 503 | Configuration, provider, or response validation unavailable |

All account responses use `Cache-Control: no-store` and create no cookies.
Unsupported writes return 405. Account creation uses the browser SDK after deliberate user submission.
Existing `/api/session` and demo routes retain their invitation guard.
A Supabase token does not authorize demo persona selection.

## Future private routes

Use `requireAccount()` from `server/account.ts` to set `response.locals.account`.
Require that identity for each private operation and apply row ownership in the database.
This middleware does not authorize real report intake, moderators, or graph publication by itself.

Logout removes the browser session and revokes refresh access through Supabase.
Existing access tokens can remain usable until expiry. Sensitive future operations need strict session-revocation checks.
Do not treat authentication alone as consent, source authority, review, or publication permission.

## Verification and setup limits

`tests/account/server.test.ts` uses provider responses mocked over the real HTTP application.
It tests configuration, token rejection, confirmed identity, metadata isolation, and provider failures.
`npm run test:server` verifies native Node startup with account configuration absent.

No production project, auth settings, user accounts, email messages, or database schema were changed.
Supabase Auth already owns `auth.users`; this account identity slice needs no custom migration.
Live signup, email confirmation, login, logout, and provider configuration remain unverified until a project is selected.

## References

- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/changelog.md

The changelog was checked on 12 September 2026.
Node.js 20 support ended; this project uses Node.js 22.12 or later.
The free-plan email template change does not remove the need to test actual confirmation delivery.
