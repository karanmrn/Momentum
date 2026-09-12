import { z } from "zod";

export const MPS_BOROUGH_URL =
  "https://data.london.gov.uk/download/exy3m/pf6/MPS%20Borough%20Level%20Crime%20(most%20recent%2024%20months).csv";
export const MPS_CATALOGUE_URL =
  "https://data.london.gov.uk/dataset/mps-recorded-crime-geographic-breakdown-exy3m";
export const MPS_LIMITS = {
  maxBytes: 2_000_000,
  maxSourceRows: 5000,
  months: 24,
  maxSelectedCells: 504,
  maxCellLength: 300,
} as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const column = z.string().regex(/^20\d{2}(0[1-9]|1[0-2])$/);
const timestamp = z.string().datetime({ offset: true });
export const mpsBoroughSchema = z.enum(["Camden", "Hounslow", "Croydon"]);
export const mpsCategoryPairs = [
  ["SEXUAL OFFENCES", "OTHER SEXUAL OFFENCES"],
  ["SEXUAL OFFENCES", "RAPE"],
  ["VIOLENCE AGAINST THE PERSON", "DEATH SERIOUS INJURY ILLEGAL DRIVING"],
  ["VIOLENCE AGAINST THE PERSON", "HOMICIDE"],
  ["VIOLENCE AGAINST THE PERSON", "STALKING AND HARASSMENT"],
  ["VIOLENCE AGAINST THE PERSON", "VIOLENCE WITH INJURY"],
  ["VIOLENCE AGAINST THE PERSON", "VIOLENCE WITHOUT INJURY"],
] as const;
const major = z.enum(["SEXUAL OFFENCES", "VIOLENCE AGAINST THE PERSON"]);
const minor = z.enum([
  "OTHER SEXUAL OFFENCES",
  "RAPE",
  "DEATH SERIOUS INJURY ILLEGAL DRIVING",
  "HOMICIDE",
  "STALKING AND HARASSMENT",
  "VIOLENCE WITH INJURY",
  "VIOLENCE WITHOUT INJURY",
]);
export const mpsDownloadManifestSchema = z
  .object({
    url: z.literal(MPS_BOROUGH_URL),
    acquisitionMethod: z.literal("official_browser_download"),
    fetchedAt: timestamp,
    sha256: hash,
    bytes: z.number().int().min(1).max(MPS_LIMITS.maxBytes),
  })
  .strict();
const cellSchema = z
  .object({
    id: hash,
    borough: mpsBoroughSchema,
    majorCategory: major,
    minorCategory: minor,
    month,
    count: z.number().int().min(0).max(1_000_000_000).nullable(),
    valueStatus: z.enum(["known", "missing"]),
    sourceValue: z.string().max(MPS_LIMITS.maxCellLength),
    sourceRowIndex: z
      .number()
      .int()
      .min(0)
      .max(MPS_LIMITS.maxSourceRows - 1),
    sourceColumnIndex: z.number().int().min(3).max(26),
    sourceColumn: column,
    sourceSnapshotSha256: hash,
    geographicPrecision: z.literal("borough"),
    timePrecision: z.literal("month"),
    synthetic: z.literal(false),
  })
  .strict()
  .superRefine((cell, ctx) => {
    let parsed: number | null;
    try {
      parsed = parseCount(cell.sourceValue);
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid MPS source count." });
      return;
    }
    if (
      parsed !== cell.count ||
      (cell.count === null) !== (cell.valueStatus === "missing") ||
      cell.month !==
        `${cell.sourceColumn.slice(0, 4)}-${cell.sourceColumn.slice(4)}` ||
      !mpsCategoryPairs.some(
        (pair) =>
          pair[0] === cell.majorCategory && pair[1] === cell.minorCategory,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "MPS cell value, category, or month lineage is inconsistent.",
      });
    }
  });
export const mpsContextSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    methodVersion: z.literal("mps-borough-context/1"),
    importedAt: timestamp,
    source: mpsDownloadManifestSchema
      .extend({
        catalogueUrl: z.literal(MPS_CATALOGUE_URL),
        sourceFamilyId: z.literal("metropolitan-police-connect"),
        sourceRowCount: z.number().int().min(1).max(MPS_LIMITS.maxSourceRows),
        importMethod: z.literal("bounded_local_file"),
        networkFetchClaimed: z.literal(false),
      })
      .strict(),
    licence: z
      .object({
        name: z.literal("Open Government Licence v2.0"),
        url: z.literal(
          "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/2/",
        ),
      })
      .strict(),
    scope: z.literal("borough_historical_context"),
    incidentClassificationAllowed: z.literal(false),
    additiveWithPoliceUk: z.literal(false),
    alertEligible: z.literal(false),
    synthetic: z.literal(false),
    months: z.array(month).length(MPS_LIMITS.months),
    cells: z.array(cellSchema).length(MPS_LIMITS.maxSelectedCells),
    limitations: z.array(z.string().min(1).max(500)).min(1).max(12),
  })
  .strict()
  .superRefine((data, ctx) => {
    const monthNumbers = data.months.map(
      (value) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5)),
    );
    if (
      new Set(data.months).size !== 24 ||
      monthNumbers.some(
        (value, index) => index > 0 && value !== monthNumbers[index - 1] + 1,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "MPS reporting months must be consecutive and distinct.",
      });
    const keys = new Set<string>(),
      ids = new Set<string>();
    const seriesRows = new Map<string, number>(),
      rowSeries = new Map<number, string>();
    for (const cell of data.cells) {
      const seriesKey = `${cell.borough}|${cell.majorCategory}|${cell.minorCategory}`;
      const key = `${seriesKey}|${cell.month}`;
      if (
        keys.has(key) ||
        ids.has(cell.id) ||
        cell.sourceSnapshotSha256 !== data.source.sha256 ||
        data.months[cell.sourceColumnIndex - 3] !== cell.month ||
        cell.sourceRowIndex >= data.source.sourceRowCount ||
        (seriesRows.has(seriesKey) &&
          seriesRows.get(seriesKey) !== cell.sourceRowIndex) ||
        (rowSeries.has(cell.sourceRowIndex) &&
          rowSeries.get(cell.sourceRowIndex) !== seriesKey)
      )
        ctx.addIssue({
          code: "custom",
          message: "MPS duplicate cell or invalid row and snapshot lineage.",
        });
      keys.add(key);
      ids.add(cell.id);
      seriesRows.set(seriesKey, cell.sourceRowIndex);
      rowSeries.set(cell.sourceRowIndex, seriesKey);
    }
    for (const borough of mpsBoroughSchema.options)
      for (const pair of mpsCategoryPairs)
        for (const period of data.months) {
          if (!keys.has(`${borough}|${pair[0]}|${pair[1]}|${period}`))
            ctx.addIssue({
              code: "custom",
              message: "MPS expected borough, category, or month is missing.",
            });
        }
  });
export type MpsContext = z.infer<typeof mpsContextSchema>;
export type MpsContextCell = MpsContext["cells"][number];
export type MpsBorough = z.infer<typeof mpsBoroughSchema>;
function parseCount(input: string): number | null {
  if (["", "..", "-", "NA", "N/A"].includes(input.trim())) return null;
  if (!/^\d+$/.test(input.trim())) throw new Error("Invalid MPS count value.");
  const value = Number(input.trim());
  if (!Number.isSafeInteger(value) || value > 1_000_000_000)
    throw new Error("MPS count exceeds bounds.");
  return value;
}
/** Strict bounded CSV parser. Supports BOM, CRLF, quoted separators and escaped quotes. */
export function parseMpsCsv(input: string): string[][] {
  if (input.length > MPS_LIMITS.maxBytes)
    throw new Error("MPS CSV input exceeds bounds.");
  const csv = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  function fieldEnd() {
    row.push(field);
    field = "";
    closed = false;
    if (row.length > 27) throw new Error("Too many MPS columns.");
  }
  function rowEnd() {
    fieldEnd();
    rows.push(row);
    row = [];
    if (rows.length > MPS_LIMITS.maxSourceRows + 1)
      throw new Error("Too many MPS source rows.");
  }
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (quoted) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
    } else if (char === ",") fieldEnd();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[index + 1] === "\n") index++;
      rowEnd();
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (closed || char === '"')
      throw new Error("Malformed MPS quoted field.");
    else field += char;
    if (field.length > MPS_LIMITS.maxCellLength)
      throw new Error("MPS field exceeds bounds.");
  }
  if (quoted) throw new Error("Unterminated MPS quoted field.");
  if (field || row.length || closed) rowEnd();
  return rows;
}
async function sha256(input: Uint8Array | string): Promise<string> {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", copy))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
export async function importMpsBoroughCsv(
  bytes: Uint8Array,
  manifestInput: unknown,
  importedAt = new Date().toISOString(),
): Promise<MpsContext> {
  const manifest = mpsDownloadManifestSchema.parse(manifestInput);
  if (
    bytes.length > MPS_LIMITS.maxBytes ||
    bytes.length !== manifest.bytes ||
    (await sha256(bytes)) !== manifest.sha256
  )
    throw new Error("MPS file does not match its download manifest.");
  const [header, ...rows] = parseMpsCsv(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (
    !header ||
    header.length !== 27 ||
    header.slice(0, 3).join(",") !== "Group,SubGroup,BOCU" ||
    header.slice(3).some((value) => !column.safeParse(value).success)
  )
    throw new Error("Unexpected MPS CSV header.");
  const months = header
    .slice(3)
    .map((value) => `${value.slice(0, 4)}-${value.slice(4)}`);
  const cells: MpsContextCell[] = [];
  const selectedSeries = new Set<string>();
  for (let sourceRowIndex = 0; sourceRowIndex < rows.length; sourceRowIndex++) {
    const row = rows[sourceRowIndex];
    if (row.length !== header.length)
      throw new Error("MPS row has missing or extra columns.");
    if (
      !mpsBoroughSchema.safeParse(row[2]).success ||
      !major.safeParse(row[0]).success
    )
      continue;
    if (
      !mpsCategoryPairs.some((pair) => pair[0] === row[0] && pair[1] === row[1])
    )
      throw new Error("Unrecognized MPS selected category.");
    const key = row.slice(0, 3).join("|");
    if (selectedSeries.has(key))
      throw new Error("Duplicate MPS borough category row.");
    selectedSeries.add(key);
    for (
      let sourceColumnIndex = 3;
      sourceColumnIndex < header.length;
      sourceColumnIndex++
    ) {
      const count = parseCount(row[sourceColumnIndex]);
      cells.push(
        cellSchema.parse({
          id: await sha256(
            `${manifest.sha256}:${sourceRowIndex}:${sourceColumnIndex}`,
          ),
          borough: row[2],
          majorCategory: row[0],
          minorCategory: row[1],
          month: months[sourceColumnIndex - 3],
          count,
          valueStatus: count === null ? "missing" : "known",
          sourceValue: row[sourceColumnIndex],
          sourceRowIndex,
          sourceColumnIndex,
          sourceColumn: header[sourceColumnIndex],
          sourceSnapshotSha256: manifest.sha256,
          geographicPrecision: "borough",
          timePrecision: "month",
          synthetic: false,
        }),
      );
    }
  }
  return mpsContextSchema.parse({
    schemaVersion: "1.0",
    methodVersion: "mps-borough-context/1",
    importedAt,
    source: {
      ...manifest,
      catalogueUrl: MPS_CATALOGUE_URL,
      sourceFamilyId: "metropolitan-police-connect",
      sourceRowCount: rows.length,
      importMethod: "bounded_local_file",
      networkFetchClaimed: false,
    },
    licence: {
      name: "Open Government Licence v2.0",
      url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/2/",
    },
    scope: "borough_historical_context",
    incidentClassificationAllowed: false,
    additiveWithPoliceUk: false,
    alertEligible: false,
    synthetic: false,
    months,
    cells,
    limitations: [
      "These counts cover whole boroughs, not the three town-centre pilot areas or individual streets.",
      "MPS borough counts and Police.uk records have different publication methods. Do not add or directly reconcile their totals.",
      "These categories cannot classify any of the five selected Police.uk records or establish a community report match.",
      "Sexual offences are not supplied at LSOA level. This importer does not infer or reconstruct suppressed local counts.",
      "Data uploaded after February 2024 comes from CONNECT. Exercise care when comparing it with earlier system releases.",
      "Some details cannot be translated between legacy systems and CONNECT. Unknown values must remain unknown.",
      "A recorded count of zero differs from a missing source value. Neither establishes that an area is safe.",
      "The original file came from an official browser download. This local importer does not claim a successful direct HTTP fetch.",
    ],
  });
}
export function selectMpsBoroughContext(
  input: unknown,
  boroughInput: unknown,
): MpsContextCell[] {
  const data = mpsContextSchema.parse(input),
    borough = mpsBoroughSchema.parse(boroughInput);
  return data.cells.filter((cell) => cell.borough === borough);
}
