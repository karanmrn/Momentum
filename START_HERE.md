# Start here — three-area safety Codex pack

## Which document is current?

`generalist.md` in this pack is the new master plan for Hounslow town centre, Camden Town centre and West Croydon. It replaces the old mental-health and West End scope. Archive older conflicting plans rather than asking coding agents to reconcile them silently.

This is a planning package. It does not contain a built web application, an approved boundary, a live crime dataset, or successful deployment results. The contracts/configurations/fixtures are proposed starting assets. Application tests have not run.

## How to use it in an existing repository

1. Commit or safely preserve current work. Put this pack under `planning/three-area-safety/`, or copy its master to the root as the current `generalist.md` after archiving the previous scope. Make the paths clear to every Codex thread.
2. Merge the guidance from this pack's `AGENTS.md` into an existing root `AGENTS.md`; do not overwrite unrelated repository rules.
3. Start **thread 00 only**, using `prompts/00-integration-architect.md`. Let it inspect the repository, freeze the shared contracts, scaffold agreed paths and commit a common base.
4. Start separate worktrees from that same foundation commit for threads 01, 02, 03, 04 and 07. Thread 09 can begin a parallel threat review. Use the matching prompt file, not the master prompt alone.
5. Start threads 05, 06 and 08 once their contract dependencies are stable. Thread 10 handles end-to-end release evidence. Keep one coordinator responsible for integration, migration order and lockfiles.
6. Review and merge small changes in dependency order. Do not point parallel migration/reset jobs at one shared production database. Assign separate development ports and local database instances/schemas where needed.

## Minimal opening prompt

```text
Read planning/three-area-safety/generalist.md and START_HERE.md.
You are thread 00. Follow prompts/00-integration-architect.md.
Inspect the existing repository before editing. Freeze contracts and
ownership, scaffold a complete end-to-end demonstration path, and return
the exact common-base commit and prompts/dependencies for the other
worktrees. Do not replace sound existing code unnecessarily.
```

Adjust the prefix only to match where you placed the pack. Do not copy a fictional repository path as though it exists.

## Most important files

- `generalist.md`: complete product and engineering plan.
- `research/sources.md` and `source_registry.json`: sources, licence/access caveats and follow-up tasks.
- `research/research_notes.md` and `endpoint_probes.json`: what was and was not independently checked.
- `docs/knowledge_graph.md`: ontology, relationship semantics and privacy-aware storage.
- `docs/correlation_protocol.md`: matching versus association, data sufficiency and statistical interpretation.
- `docs/privacy_threat_model.md`: abuse cases and public-launch gates.
- `contracts/domain.ts` and `API_RULES.md`: proposed shared contracts.
- `config/pilot_areas.json`: area assumptions; deliberately no fabricated station IDs or polygons.
- `config/feature_flags.json`: default feature gates.
- `prompts/`: one scoped prompt per workstream.
- `tests/acceptance_matrix.json`: specified tests to implement, not passed test claims.
- `fixtures/synthetic/demo.json`: isolated invented example relationships; never publish as live evidence.

## First successful demo

Choose each area; inspect a source-backed card or an honestly unavailable source state; create a synthetic observation; moderate its public summary; inspect supported graph relations; show two different explicit-preference feeds; withdraw/retract the notice; see the correction and suppressed queued old alert. The graph and APIs must work, not merely appear in slides. A correlation panel may correctly say there is insufficient comparable real history.
