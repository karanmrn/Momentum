# Environment and deployment decisions

This is a configuration checklist, not an actual .env or account setup.

Server-only: Supabase privileged credentials (only for narrowly controlled worker/admin operations), source API credentials, notification signing/provider secrets, partner-ingestion secrets, feature gates and configured source allowlist. Prefer user-scoped verified access where possible; a generic service-role proxy defeats RLS.

Browser-safe only when supported by the vendor: Supabase project URL/publishable key, public API base path, origin-restricted map client token and non-sensitive presentation flags. Never expose a service-role key via a VITE_ variable. Public keys do not replace RLS.

Development: local/isolated database, fake delivery adapter, explicit synthetic fixture namespace and visibly labelled demo. Staging: separate credentials/project and test subscribers. Production: authorisation, source rights and launch gates required; never assume a deploy preview gets production secrets safely.

Worktrees: choose distinct app ports and database containers/namespaces. The shared Git repository does not imply a safely shared dev database. Do not copy production .env files into every worktree automatically. Inspect account quotas/credits before starting repeated build/LLM runs.

Netlify: Vite build output depends on the agreed root/monorepo layout; thread 00 sets build command, publish directory and functions directory accordingly. Scheduled functions require explicit local/preview invocation tests and have documented runtime limits. Do not declare a source job working merely because deployment succeeded.
