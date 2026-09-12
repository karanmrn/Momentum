# OSM map context

Run `node --import tsx scripts/datasets/osm/collect.ts` from the dataset worktree.

The collector uses one serial Overpass request for each existing one-mile research circle.
It selects toilets, libraries, pharmacies, community centres, and police stations.
It excludes explicitly private or prohibited access. Missing access tags still mean unknown access.

The source is OpenStreetMap through the documented public Overpass endpoint.
https://wiki.openstreetmap.org/wiki/Overpass_API
https://overpass-api.de/api/interpreter

Each request has a 30-second deadline, a 5 MB response limit, and a 1,000-element validation limit.
The collector has no retries or endpoint failover. Denials and rate limits stop remaining requests.

Saved files contain element IDs, versions, timestamps, coordinates, and approved static tags.
Contributor metadata and unrelated tags are discarded before storage.
The manifest keeps separate received-response and persisted-file hashes.
Original response bodies are not saved because they include unnecessary contributor metadata.

Map features are not reviewed help venues. Their hours, access, and staffing remain unconfirmed.
Way and relation coordinates are bounding-box centres, not entrances.
Research circles are not approved pilot boundaries. Missing map features do not prove absent facilities.

ODbL 1.0 applies. Attribution: © OpenStreetMap contributors.
https://www.openstreetmap.org/copyright

Raw and normalized evidence stays local under `.data/datasets/osm/`.
The tracked manifest contains counts, file metadata, source scope, and limits.
No private repository code, accounts, or data were used.
No public notices or graph routes are created by this collector.
