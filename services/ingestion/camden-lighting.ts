import { z } from "zod";
import type { SourceCard } from "../../packages/contracts/index.js";

const query = new URLSearchParams({
  $where: "latitude between 51.533 and 51.545 AND longitude between -0.148 and -0.132",
  $limit: "200",
  $order: "local_authority_asset_number",
  $select: "local_authority_asset_number,street_name,longitude,latitude,last_uploaded",
});
const endpoint = `https://opendata.camden.gov.uk/resource/dfq3-8wzu.json?${query}`;
const coordinate = z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number);
const rowsSchema = z.array(z.object({
  local_authority_asset_number: z.string().trim().min(1).max(100),
  street_name: z.string().trim().min(1).max(200),
  longitude: coordinate.pipe(z.number().min(-0.148).max(-0.132)),
  latitude: coordinate.pipe(z.number().min(51.533).max(51.545)),
  last_uploaded: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/),
}).strict()).min(1).max(200).refine(
  rows => new Set(rows.map(row => row.local_authority_asset_number)).size === rows.length,
  "Duplicate asset identifiers.",
);

/** Council inventory only. The query rectangle is not an approved pilot polygon. */
export async function getCamdenLighting(): Promise<SourceCard> {
  const card: SourceCard = {
    id: "C03",
    title: "Camden street lighting inventory",
    summary: "Inventory sample unavailable. Current lamp operation is unknown.",
    url: "https://opendata.camden.gov.uk/Environment/Camden-Street-Lighting/dfq3-8wzu",
    status: "unavailable",
    sourceKind: "map_inventory",
    fetchedAt: null,
    publishedAt: null,
    synthetic: false,
    checkedAt: new Date().toISOString(),
    coverage: "unavailable",
    attribution: "London Borough of Camden, Open Government Licence v3.0",
    scope: "Candidate Camden Town rectangle; not an approved pilot polygon. London Borough of Camden, Open Government Licence v3.0.",
  };
  try {
    if (typeof window !== "undefined") return card;
    const response = await fetch(endpoint, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok || !response.body) return card;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 500_000) throw new Error("Source response is too large.");
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    const rows = rowsSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const streets = new Set(rows.map(row => row.street_name)).size;
    const uploadDate = rows.map(row => row.last_uploaded.slice(0, 10)).sort().at(-1);
    return {
      ...card,
      status: "available",
      recordCount: rows.length,
      recordCountLabel: "Lighting assets in bounded sample; not a total",
      coverage: "sample",
      fetchedAt: new Date().toISOString(),
      summary: `Sample: ${rows.length} lighting assets across ${streets} named streets; limit 200, not a total. Latest source upload date: ${uploadDate}. Current lamp operation is unknown.`,
    };
  } catch {
    return card;
  }
}
