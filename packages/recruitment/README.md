# Fictional research consent

`server/research-consent.ts` stores fictional answers in the private demo session. It validates consent, owner access, revisions, and submission keys.

Demo session RLS blocks access after 24 hours. Research reads remove expired answers from active sessions. Session creation and server startup delete expired sessions in batches of 100.

Cleanup is lazy. Access expiry does not guarantee physical deletion at that exact time. No scheduled cleanup service is configured.

Withdrawal replaces answers with a minimal tombstone. Submission references prevent a replay from restoring withdrawn answers.

Real participant intake remains disabled. These controls support a fictional exercise, not a reviewed research retention policy.
