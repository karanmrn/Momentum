# Camden evidence study

Research checked: 12 September 2026. Scope: Camden Town centre research examples.

## Result

Five real Police.uk records are available. Their public fields cannot establish five detailed incident accounts.
All five use the combined category **Violence and sexual offences**.
The sexual-assault subtype, non-sexual assault subtype, victim gender, exact time, and narrative are unknown.
Do not describe these as five confirmed attacks on women.

The website can show useful facts without filling these gaps.
It can compare police publication, separately labelled fictional accounts, and source-linked area context.
This comparison concerns information structure. It does not match the fictional accounts to the real records.

## The five records

Each record has source month **July 2026** and outcome month **July 2026**.
These are historical records. Outcomes below describe the retrieved source snapshot, not a current case-status check.

| Example | API record ID | Published approximate place | Published outcome | What happened? |
| --- | --- | --- | --- | --- |
| CAM-01 | 136284076 | On or near Parkway | Under investigation | The source records violence or a sexual offence. Further details are absent. |
| CAM-02 | 136311506 | On or near Camden High Street | Unable to prosecute suspect | The source records violence or a sexual offence. The prosecution reason is absent. |
| CAM-03 | 136340068 | On or near Camden High Street | Under investigation | The source records violence or a sexual offence. Further details are absent. |
| CAM-04 | 136305750 | On or near Camden Road | Under investigation | The source records violence or a sexual offence. Further details are absent. |
| CAM-05 | 136338147 | On or near Camden High Street | Under investigation | The source records violence or a sexual offence. Further details are absent. |

[Police.uk source query](https://data.police.uk/api/crimes-street/all-crime?date=2026-07&lat=51.5392&lng=-0.1426).
The five excerpts, persistent IDs, row positions, coordinates, and snapshot hashes are in [police-records.json](police-records.json).

For every record:

- Exact date and time: not published.
- Sexual assault versus non-sexual assault: cannot be determined.
- People involved: not published.
- Victim gender and age: not published.
- Witness account, CCTV, forensic material, and statement contents: not published.
- Context field: empty.
- Link to a community account: not established.

Police.uk groups common assault, grievous bodily harm, and sexual offences within this category.
A public record cannot support a separate battery classification.
“Unable to prosecute” does not identify the offence subtype or explain the decision.
[Category definitions](https://www.police.uk/pu/about-police.uk-crime-data/).

CAM-02 and CAM-03 have different persistent IDs but the same published map point.
Keep both records. Shared coordinates do not prove a shared event.
The numeric API identifier and street identifier are not police case references.
[API field definitions](https://data.police.uk/docs/method/crime-street/).

## Selection and provenance

The existing acquisition task collected one-mile circles around three research anchors.
The Camden anchor is 51.5392, -0.1426. Its July file contains 1,666 source rows.
That is a source-response count, not a town-centre crime total.

This study selected five combined-category rows near the project’s named Camden streets and station approaches.
Original zero-based row positions are 1274, 1279, 1331, 1419, and 1494.
Selection is purposive. It does not estimate local prevalence or women’s risk.
No approved pilot polygon exists in the current area configuration.
Published points are anonymised. Their actual incident locations can differ.

The original file’s SHA256 matched its acquisition manifest.
A fresh API request found all five persistent IDs with unchanged selected row contents.
The fresh full-response hash differs from the earlier file hash. Both hashes remain recorded.
Do not describe the full response as byte-identical or every source record as unchanged.
The earlier file remains intact in the acquisition worktree.

The source dataset uses the Open Government Licence v3.0.
This study retains attribution and publishes only the requested research excerpts.
It does not change the bulk collector’s publication or alert gates.
[Police.uk provenance and licence](https://data.police.uk/about/).

## How police reporting differs from public publication

| Stage | Information or process | What this study can establish |
| --- | --- | --- |
| Initial contact | Police ask who, what, where, and when. | This is published guidance, not proof of each case’s handling. |
| Investigation | Officers can obtain detailed statements and relevant digital material. | The five rows do not disclose their case evidence. |
| Outcomes | Police and justice systems record investigation and court outcomes. | The sample includes the outcome labels above. |
| Open-data release | Forces submit monthly data. Publication reduces detail and protects privacy. | We have the public release, not the case files. |

Police do care about people, events, places, and times.
The official reporting guidance asks for all four.
It also recognises that a person may not remember exact details.
An exact-time field in our app must allow uncertainty.
[Initial reporting guidance](https://www.police.uk/ro/report/rsa/alpha-v1/advice/rape-sexual-assault-and-other-sexual-offences/what-happens-after-report-rape-sexual-assault/).

Detailed statements and relevant phone or social-media material can support an investigation.
A forensic examination may be offered when applicable.
These are general methods. None is established as collected evidence for the five selected records.
[Met investigation guidance](https://www.met.police.uk/ro/report/rsa/alpha-v1/advice/rape-sexual-assault-and-other-sexual-offences/rape-sexual-assault-investigation/).

## A separate Camden narrative

Contemporaneous Sky News coverage describes a 14 January 2026 Camden High Street police appeal.
It reports alleged attempted robbery and sexual assault involving three women.
Police were called around 08:00. This is a call time, not a verified exact incident time.
The report says police spoke with the women and reviewed CCTV.
The footage revealed an intervening witness whom police sought to contact.
[Sky News coverage, reproduced by Yahoo, 26 January 2026](https://uk.news.yahoo.com/police-appeal-heroic-witness-stepped-115100459.html).

The original Met appeal returned HTTP 404 during this research.
Its removal reason and the current investigation status are unknown.
The source remains useful as historical reporting coverage, with that limitation visible.
[Original Met appeal, currently unavailable](https://news.met.police.uk/news/officers-urge-heroic-witness-to-come-forward-505471).

This January narrative is separate from the five July records.
It cannot supply their missing details. No same-incident relationship is established.
The research omits the witness’s appearance and identifying detail from the example graph.

## What enriched data means

Enrichment adds a supported field or relationship while retaining the original source and its limits.
It does not invent missing offence details.

| Addition | Actual evidence | Useful result | Unsupported inference |
| --- | --- | --- | --- |
| Category label | Official category dictionary | Translate `violent-crime` into its published label. | Classify the row as sexual assault. |
| Source identity | Snapshot hash, row position, persistent ID | Trace a field to a source revision. | Treat the public ID as a case number. |
| Local policing context | Camden Town priority, dated 1 September 2026 | Show the published women and girls safety priority. | Claim these five cases caused an operation. |
| Help information | Dated Camden Safety Bus notice | Explain a scheduled location exception. | Claim staff are present now. |
| Transport identity | Existing TfL station records | Associate a public station reference with area context. | Prove an incident occurred at that station. |
| Lamp or camera inventory | Existing permitted map or asset records | Show an asset exists in a source inventory. | Prove it worked, filmed an event, or caused harm. |

The fresh priorities response pairs a women and girls safety issue with an action statement.
The action describes police operations and work with council and licensing teams, including staff training.
The source date is 1 September 2026. Completion is unverified.
This is a police-published statement, not an independent community report.
[Camden Town priorities](https://data.police.uk/api/metropolitan/E05013655/priorities).
The exact first item is retained in [priority-excerpt.json](priority-excerpt.json).

The council page lists a Safety Bus exception for 12 September outside KOKO on Camden High Street.
Published hours are 21:30 to 02:30 the following day, in Europe/London time.
The usual station location must not override this dated exception.
Actual deployment remains unconfirmed. The September notice does not describe July conditions.
[Camden Safety Bus](https://www.camden.gov.uk/staying-safe-at-night).

## Fictional community comparison

The component contains five isolated fictional accounts.
They illustrate unwanted touching, pushing, following, a witness account, and an environmental observation.
They are not reconstructions of the police records.

| Field | Fictional account can demonstrate | Production treatment |
| --- | --- | --- |
| What happened | A person’s stated behaviour or environmental concern | Preserve attribution and uncertainty. Do not assert guilt. |
| When observed | A reported time or interval | Preserve time zone, precision, and uncertainty. |
| When submitted | A separate submission timestamp | Do not substitute it for the incident time. |
| People involved | Anonymous roles, such as reporter or witness | Keep identity out of the public graph. |
| Evidence | “Witness account offered” or “camera seen nearby” | Distinguish offered, obtained, reviewed, and unavailable. |
| Public summary | A reduced account suitable for the demonstration | Real reports need authorised review before publication. |
| Correction | Revised time or withdrawn account | Remove dependent claims and refresh projections. |

This is not a request for users to investigate or gather evidence at risk.
The current product does not accept public evidence uploads or send reports to police automatically.
An app submission is not a police report.

## Graph foundation

Keep three separate identities: source family, originating claim, and source record.
Different records from one source remain distinct.
Copied accounts do not become independent witnesses.

Store source snapshots, real record excerpts, source statements, and isolated fictional revisions as typed nodes.
Each assertion needs evidence references, source family, method version, precision, recorded time, and status.
A public explanation must not expose private neighbours or identities.

Supported relationships include source derivation, source-stated action, and area context.
A fictional correction supersedes its prior version.
Withdrawal removes its derived current claims.
Real historical records remain unchanged by fictional actions.
No edge establishes shared offenders, guilt, or a confirmed event match.

The example graph uses a scoped versioned contract.
It does not silently extend the main stored graph’s node types.
Integration into hosted storage requires the graph owner’s reviewed contract and migration.
The local example does not write to production databases or issue alerts.

## Build on the existing acquisition

The dataset handoff records 108 monthly police files and 134,305 normalized source rows across three research circles.
It also records TfL, NaPTAN, ONS Census, OSM, and police-priority acquisitions.
This study directly inspected the Camden police file, priority export, and selected TfL identities.
It did not revalidate all 108 monthly files or every other dataset.
[Existing dataset handoff](../datasets/HANDOFF.md).

Reuse those source snapshots and their existing lineage keys for future reviewed imports.
Do not download the same data under a new identity or add overlapping datasets as independent crime counts.
Keep the 36-month historical store internal until geography and publication rules are reviewed.

No genuine community dataset has been collected in the existing handoff.
The fictional accounts cannot provide a community-to-police overlap rate or an independent correlation.
ONS resident counts do not measure the night-time population of the research circle.
Different source geographies need an explicit reviewed mapping before statistical comparison.

## Review and remaining work

The idea review supported the page with source and synthetic separation.
Its strongest concern was invented reconstruction from broad anonymous rows.
The implementation addresses that concern through unknown fields and prohibited event-matching assertions.

The example is a research and interface demonstration.
It does not establish five complete case histories, confirmed victim characteristics, operational help availability, or reduced harm.
Future real reports need moderation, private storage controls, consent, correction, retention, and source-permission review.
