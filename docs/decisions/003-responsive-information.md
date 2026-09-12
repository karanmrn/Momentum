# Responsive local information

The first responsive release showed fictional notices before real source information.
The revised Now view puts local sources first. Community reports keep separate fictional labels.

## Interface evidence

The design review used recorded Mobbin references from the project planning task.
The Airbnb map/list flow informed context preservation when switching views.
The Wise status flow informed the current-status and revision distinction.

- [Map and list reference](https://mobbin.com/flows/ed7d4a94-2729-44f9-92c1-f82c7a078333)
- [Status and updates reference](https://mobbin.com/flows/a40c0d62-f02c-43aa-8bae-51687fd9fdee)

The implementation retains Streetwise's forest and cream palette and existing report contracts.
It applies Unslop and Anti UI Slop to labels, metadata, responsive behaviour, and complete controls.

## Implemented rules

Mobile starts with a list and has Explore, My reports, Updates, and Get help tabs.
Preferences and research remain reachable outside these four tabs.
Desktop shows the map beside source information.
Area changes clear old content and reject late responses for a previous area.
Map/list switching preserves the selected area.

Help markers use verified directory coordinates and named 48-pixel targets.
They do not represent incident locations or guaranteed assistance.
Map failures preserve the equivalent list.
Source records retain source links, retrieval times, sample limits, and unknown availability.
Dataset coverage shows dated acquisition snapshots and missing sources separately.

## Verification

The integrated release passed nine Playwright journeys and the production build.
The final unit and integration suite passed 154 tests.

Independent visual review passed at 320, 390, and 1440 pixels.
It verified map sizing, marker names, 48-pixel form controls, graph labels, and source placement.
Automated tests verified reporting, review, correction delivery, and revision-aware inbox navigation.
They also verified dataset coverage in every area and unavailable-source recovery.

Hosted deployment, native devices, and real participant research remain unverified.
The report workflow remains fictional. Raw acquisition records remain outside public Git history.
