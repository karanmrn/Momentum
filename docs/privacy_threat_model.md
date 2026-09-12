# Privacy, misuse and public-launch gates

This is an engineering risk plan, not a legal opinion. Review current ICO/Ofcom guidance [L01–L04] and obtain qualified input before launching real public intake.

## Main threats and required controls

| Threat | Control | Release evidence |
|---|---|---|
| Allegations identify someone | No names/faces/plates/suspect profiles; private moderation and redaction | adversarial fixtures, publication tests, reviewer playbook |
| Reporter or victim can be located | Minimal approximate location; no live tracking; exact private fields avoided | API/log/cache/export inspection |
| Graph reveals hidden records | ACL before traversal; public projections; no private neighbour counts | cross-user and role-level graph tests |
| False or coordinated reports | rate bounds, revision trail, source-family checks, human moderation | abuse scenario exercise and rollback |
| An official article is mistaken for adjudication | retain reported/alleged wording; no guilty-person graph | content review and assertions schema |
| Private content copied to an LLM | AI off by default; allowlisted public/redacted inputs only after review | request inspection and provider policy review |
| Stale warning persists | separate valid time/fetch time; expiry and correction propagation | stale/withdrawal notification tests |
| Scraper reads private networks | fixed allowlist, SSRF and redirect/IP controls, no user-controlled fetch URL | security tests |
| User account leaks commute | private area/station follows, no home address, coarse explicit windows | RLS, cache and export tests |
| Public query reconstructs sensitive small counts | preapproved aggregates, suppression strategy and filter limits | differencing/repeated query review |
| Unstaffed app treated as emergency channel | fixed emergency signpost, no response promise; intake off without staffing | copy review and kill-switch exercise |
| Bad actors solicit confrontation | no patrol coordination, targeting, vigilante calls or public suspect maps | moderation rules and appeal path |

## Legal/data classification decisions

Identifiable allegations about suspected offenders may be Article 10 criminal-offence data; do not assume open-web origin or a standard consent checkbox makes processing lawful. ICO distinguishes that from victim/witness data as such, although those data still need protection and may reveal other sensitive facts. Use field-level classification, lawful-basis review, access restrictions and retention policies.

Complete DPIA screening for combined location, reporting, profiling and vulnerable-user context; document residual risk. Review user-to-user service duties and child-access considerations. An adult-oriented design or hackathon label is not an automatic exemption. No age verification architecture should be invented without proportionality and policy review.

## Data minimisation and retention

Store no background location traces. Optional current position is used in browser memory and rounded only when the user explicitly submits a location. Do not store a precise home/work origin. Do not collect a protected attribute to infer vulnerability. Accessibility preferences describe the desired service, not a diagnosis.

Define a reviewed retention schedule per class: private submissions, published summaries, account settings, moderation metadata, public-source snapshots and failed job logs. Draft proposal for review: unsubmitted text in memory only; withdrawn/rejected report content deleted promptly under the chosen documented policy; minimal audit tombstones separated from content. Do not hardcode arbitrary “keep everything for seven years” or pretend a deletion button erases provider backups immediately.

Deleting/withdrawing data must cover relational rows, graph projections, full-text/vector indexes if added, object storage, caches and pending delivery. Retain only legally justified metadata; document backup retention and expiration. Do not make sensitive immutable raw archives an architecture requirement.

## Publication permission

An account is not verified identity or verified truth. Roles: reader, member, local moderator, scoped partner, administrator and source worker. Partners can publish only within authorised domain/geography; moderators cannot promote themselves to police authority. Moderator assignment is server controlled.

Default flags keep public intake/public community publication/external push/AI disabled. A controlled demo uses clearly synthetic data and test-only subscribers; authentic operator data can still be shown read-only with source/coverage labels. No production Supabase/Netlify changes, paid upgrades or public external alert campaign are authorised by this planning document.

## Required launch checklist

Named accountable operator and moderator rota; workable deletion/complaint/appeal flow; source permissions; legal/DPIA screening; current official emergency links; user-tested uncertainty labels; rollback and notification correction drill; privacy notice matching actual network behaviour; logs without report text/contact details; cross-user RLS tests; separate demo environment; documented source outage behaviour. Failure of a required gate keeps the affected feature off while the read-only map remains usable.
