# Camden evidence verification

Date: 12 September 2026.
Base: `26d212e`, current `origin/main` when this worktree started.
Branch: `codex/camden-evidence`.

## Source checks

- Original Camden July 2026 JSON matched its stored SHA256 manifest.
- A fresh bounded Police.uk request returned all five selected persistent IDs.
- All five selected row objects matched their original contents.
- Full-response hashes differ. Both hashes remain in `police-records.json`.
- The original acquisition file remains unchanged.
- A fresh Camden priorities request supplied the retained first issue/action item.
- Official category definitions, field definitions, reporting guidance, and council help pages were read.
- The historical Camden appeal returned HTTP 404. The report labels its current source limitation.

No paid Context.dev request ran. No private feed, production database, or external alert was used.

## Local checks

Commands ran in `/Users/karanmanoharan/Downloads/streetwise-camden-evidence`.

```sh
npm ci
npx vitest run tests/camden-evidence
npm run check
npm run build
node tests/camden-evidence/browser.mjs
git diff --check
```

Nine unit tests passed. They check real-record multiplicity, forbidden classification fields, fictional isolation, evidence references, provenance, and correction coherence.
Nine browser checks passed. They cover five selectors, unknown subtypes, corrected times, withdrawal, isolated states, reset, keyboard use, and viewport sizes.
The component passed at 1440px, 390px, and 320px. All tested buttons have at least 48px height.
No page errors occurred. TypeScript and the production application build passed.

The browser script uses Playwright's installed Chromium.
The preferred Chrome wrapper could not start because the standard Chrome and Canary application paths were absent.

Start the local component preview with:

```sh
./node_modules/.bin/vite --host 127.0.0.1 --port 4189 --strictPort
```

Open `http://127.0.0.1:4189/camden-evidence.html`.
The preview entry is a local test page. Vite's normal build uses the existing application entry.
For integrated browser checks, set `CAMDEN_TEST_URL` to the root-owned `?evidence=camden` route.

Browser evidence lives in ignored `.data/camden-evidence/browser/`.
The report is in `REPORT.md`; its local visual copy is in `.lavish/camden-evidence/index.html`.

## Independent review

A separate reviewer reproduced three invalid graphs accepted by the initial validator.
The fixes reject fictional evidence on real assertions, missing source provenance, and stale assertions after correction.
Regression tests cover each issue. The current builder and validator retain the same source boundaries.

## Integration

Apply all commits on this branch in order. The data commit is required by the component imports.

```tsx
import { CamdenEvidence } from './CamdenEvidence';
<CamdenEvidence onExit={() => { /* return to Camden */ }} />
```

`onExit` is optional. No other props are required.
Root owns the `?evidence=camden` route and website entry. This task did not edit `src/main.tsx`.
The new graph contract is scoped to `packages/camden-evidence`.
No shared schema, migration, lockfile, deployment setting, or public intake contract changed.

The example uses local state. Corrections and withdrawals reset on reload.
It does not write these example nodes into the hosted semantic graph.
Any future stored integration needs the graph owner's reviewed schema extension.

## Limits

This verifies software behaviour and source fidelity, not the truth of an individual allegation.
No incident subtype, victim identity, exact incident time, or case evidence was reconstructed.
No live deployment, production route, phone-camera use, or assisted-technology audit was verified by this local check.
The full 108-file historical acquisition was not revalidated here.
