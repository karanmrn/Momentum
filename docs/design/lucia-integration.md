# Lucia prototype integration

Reference: https://github.com/luciabanjo/momentum, commit 4d55f1f.

Lucia built a static, synthetic prototype. It has no report storage, source adapters, authentication, or real subscriptions. Its authored source is dist/index.html.

## Decisions

Adapt the graph interactions and the Report, Evidence, Changes journey. Keep Momentum's data contracts, review controls, source details, and persistence.

| Screen job | Decision |
| --- | --- |
| Inspect a graph record | Select a node, bring it into view, and show a compact source card. Keep the full inspector synchronized. |
| Arrange the graph | Drag a node without changing its record, relationships, or geographic meaning. Fit resets the local layout. |
| Follow a saved report | Keep report details, area evidence, and actual status history within one receipt view. |
| Find support | Link to the existing help directory for the selected area. |
| Evidence meaning | Area evidence does not confirm a private report or prove that records concern the same incident. |
| Visual language | Use Momentum's existing graph colours, cream pages, green text, and shared controls. |
| Input modes | Preserve keyboard selection, pointer dragging, touch targets, and reduced motion. |
| Failure states | Preserve empty, unavailable, withdrawn, and source-limited states. |
| Mobile | Keep selected-node details readable without covering the graph controls. Receipt controls wrap within the page. |

## Source decisions

Lucia's graph contains seven fixed synthetic records. Do not import its offence counts, distances, public-post claims, lighting approval, or causal outcome statements.

Her submit action changes screens after a delay. Her watch button changes text only. Keep our validated report submission and persisted follow controls.

Her insights remain separate from the graph. Preserve that distinction. Do not turn a visual connection into a verified relationship.

Do not copy decorative particles or continuous movement. Use motion only to explain selection or direct manipulation.

## Acceptance

Select nodes by pointer and keyboard. Confirm camera focus, compact card, full inspector, and source labels agree. Drag one node and confirm its edges follow. Panning and zooming must still work. Fit must reset local positions. Dataset changes must clear stale positions and cards.

Save a fictional report. Open Report, Evidence, and Changes. Confirm that its saved data and history remain unchanged. Evidence and help links must preserve area without exposing the private report identifier or narrative.

Check phone and desktop layouts, long labels, reduced motion, empty data, and existing receipt correction and withdrawal controls.
