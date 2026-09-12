# Dataset inventory

This inventory describes the 12 September 2026 acquisition.
It covers Hounslow town centre, Camden Town centre, and West Croydon.

## Reading the counts

The police collector acquired 108 monthly source files from August 2023 through July 2026.
Its ignored local store contains 134,305 source rows.
These rows cover one-mile research circles around the three anchors.
They are not approved pilot boundaries or approved pilot crime totals.
No per-pilot crime total is published in this inventory.

The Census rows use one nearby LSOA and one nearby MSOA per area.
The two geography types overlap.
Do not add these rows or use them as local population denominators.

## Published coverage by area

| Area | Historical police records | TfL station groups | NaPTAN references | Census context | Police priority pairs | Independent community observations |
| --- | --- | ---: | ---: | --- | ---: | --- |
| Hounslow town centre | 36 monthly files, Aug 2023-Jul 2026, one-mile research circle | 2 | 2 | 2 Census 2021 rows | 3 | Not collected |
| Camden Town centre | 36 monthly files, Aug 2023-Jul 2026, one-mile research circle | 2 | 2 | 2 Census 2021 rows | 3 | Not collected |
| West Croydon | 36 monthly files, Aug 2023-Jul 2026, one-mile research circle | 1 | 8 | 2 Census 2021 rows | 3 | Not collected |
| Total acquired coverage | 108 monthly files | 5 | 12 | 6 Census rows | 9 | 0 |

The table reports source coverage only.
It does not report incidents, personal risk, service availability, or approved pilot totals.
TfL data is a dated snapshot.
NaPTAN data is a static identity reference.
Police priority actions can describe plans and do not prove completion.

## Real, fictional, and unavailable material

| Material | Status | Use and limit |
| --- | --- | --- |
| Police.uk street records | Real, acquired | Historical source-circle records. Public totals remain unpublished. |
| TfL station and line-status responses | Real, acquired | Dated station and line-status coverage. Not a live safety feed. |
| DfT NaPTAN records | Real, acquired | Static transport reference coverage. Not current access or service evidence. |
| ONS Census 2021 via Nomis | Real, acquired | Statistical context only. It is not a town-centre population total. |
| Police.uk priorities | Real, acquired | Official issue and action pairs. They are not independent community reports. |
| OpenStreetMap selection | Real, acquired, internal only | 160 selected map records. It is not part of the public coverage cards. |
| Demonstration reports and notices | Fictional | The demo workflow uses synthetic reports. They are not local observations or evidence. |
| Independent community dataset | Unavailable | No genuine recent community dataset is connected. |
| Nextdoor or other personal community data | Not collected | No Nextdoor personal dataset was acquired or used. |

## Storage and publication boundary

Raw responses and normalized source records stay in the acquisition worktree's ignored `.data/datasets/` directory.
That directory is a local reference only.
It is not committed, bundled, or copied into this document.
The public application uses dated coverage metadata and source limitations.
It does not expose raw identities, source rows, or detailed records.

## Evidence

- [Published coverage snapshot](../research/datasets/coverage.json) records the six coverage cards for each area.
- [Dataset handoff](../research/datasets/HANDOFF.md) records acquisition totals, storage boundaries, and source limits.
- [Resource audit](../research/datasets/RESOURCE_AUDIT.md) records excluded sources and internal-only OpenStreetMap coverage.
