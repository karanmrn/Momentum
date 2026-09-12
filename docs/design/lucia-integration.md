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

## Incident to graph journey

The reporter chooses an incident category before entering the observation. Use a centered composer, clear field groups, and one primary action. Keep the current source, time, privacy, and review controls.

After a successful save, offer View report in graph. Carry a versioned report reference through session storage. Do not include the private reference or narrative in public links.

The graph loads the reporter's receipt through the existing authenticated workflow. Show that receipt as a private, unreviewed node. Connect it to the selected area as context only. Do not infer matches to police records, community reports, or outcomes.

Keep private nodes out of public exports and comparison. Clear private selection when the user switches to public mode or another area. Missing, withdrawn, unauthorized, and unavailable receipts must retain distinct states.

Use Lucia's centered composer, step navigation, dark graph, and adjacent inspector. Keep Momentum's fonts, colors, source labels, and existing controls. On phones, the graph inspector follows the graph. The report action stays reachable without horizontal scrolling.

Verify the complete saved-report journey at320px and1440px. Confirm the selected graph node shows the saved category and title. Confirm public links, exports, and another reporter's session cannot expose that receipt.
