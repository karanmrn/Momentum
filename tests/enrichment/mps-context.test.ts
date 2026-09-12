import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  importMpsBoroughCsv,
  MPS_BOROUGH_URL,
  mpsCategoryPairs,
  mpsContextSchema,
  parseMpsCsv,
  selectMpsBoroughContext,
} from "../../packages/enrichment/mps-context.js";

const periods = Array.from({ length: 24 }, (_, index) => {
  const date = new Date(Date.UTC(2024, 8 + index, 1));
  return date.toISOString().slice(0, 7).replace("-", "");
});
const header = ["Group", "SubGroup", "BOCU", ...periods].join(",");
const sourceRows = () =>
  ["Camden", "Hounslow", "Croydon"].flatMap((borough) =>
    mpsCategoryPairs.map((pair) =>
      [...pair, borough, ...periods.map((_, index) => String(index))].join(","),
    ),
  );
function fixture(rows = sourceRows(), sourceHeader = header) {
  const bytes = new TextEncoder().encode(
    [sourceHeader, ...rows].join("\r\n") + "\r\n",
  );
  const manifest = {
    url: MPS_BOROUGH_URL,
    acquisitionMethod: "official_browser_download",
    fetchedAt: "2026-09-12T14:46:22Z",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
  return { bytes, manifest };
}
async function parse(rows = sourceRows(), sourceHeader = header) {
  const source = fixture(rows, sourceHeader);
  return importMpsBoroughCsv(
    source.bytes,
    source.manifest,
    "2026-09-12T15:00:00Z",
  );
}

describe("MPS borough context", () => {
  it("retains all three boroughs, minor categories and 24 months with exact cell lineage", async () => {
    const data = await parse();
    expect(data.cells).toHaveLength(504);
    expect(data.months).toHaveLength(24);
    const camden = selectMpsBoroughContext(data, "Camden");
    expect(camden).toHaveLength(168);
    expect(new Set(camden.map((cell) => cell.minorCategory)).size).toBe(7);
    expect(camden[0]).toMatchObject({
      sourceRowIndex: 0,
      sourceColumnIndex: 3,
      sourceColumn: "202409",
      month: "2024-09",
      count: 0,
      valueStatus: "known",
      geographicPrecision: "borough",
    });
    expect(data.additiveWithPoliceUk).toBe(false);
    expect(data.incidentClassificationAllowed).toBe(false);
    expect(data.source.networkFetchClaimed).toBe(false);
    expect(new Set(data.cells.map((cell) => cell.id)).size).toBe(504);
  });
  it("preserves missing counts and zero separately without invented known values", async () => {
    const rows = sourceRows(),
      first = rows[0].split(",");
    first[3] = "";
    first[4] = "0";
    first[5] = "..";
    first[6] = "-";
    rows[0] = first.join(",");
    const data = await parse(rows);
    expect(data.cells.slice(0, 4).map((cell) => cell.count)).toEqual([
      null,
      0,
      null,
      null,
    ]);
    expect(data.cells.slice(0, 4).map((cell) => cell.valueStatus)).toEqual([
      "missing",
      "known",
      "missing",
      "missing",
    ]);
    const altered = structuredClone(data);
    altered.cells[0].count = 0;
    altered.cells[0].valueStatus = "known";
    expect(mpsContextSchema.safeParse(altered).success).toBe(false);
  });
  it("rejects malformed CSV and negative, fractional or invalid counts", async () => {
    expect(() => parseMpsCsv('"unfinished')).toThrow("Unterminated");
    expect(() => parseMpsCsv('"closed"wrong,field')).toThrow("Malformed");
    for (const value of ["-1", "2.3", "unknown", "1000000001"]) {
      const rows = sourceRows(),
        first = rows[0].split(",");
      first[3] = value;
      rows[0] = first.join(",");
      await expect(parse(rows)).rejects.toThrow();
    }
  });
  it("supports quoted commas, escaped quotes, BOM and embedded newlines", () => {
    expect(parseMpsCsv('\uFEFF"one,two","a""b","line\nwrap"\r\n')).toEqual([
      ["one,two", 'a"b', "line\nwrap"],
    ]);
  });
  it("rejects missing rows or columns, duplicate series and duplicate months", async () => {
    await expect(parse(sourceRows().slice(1))).rejects.toThrow();
    const rows = sourceRows();
    rows[0] = rows[0].split(",").slice(0, -1).join(",");
    await expect(parse(rows)).rejects.toThrow("columns");
    const duplicate = sourceRows();
    duplicate.push(duplicate[0]);
    await expect(parse(duplicate)).rejects.toThrow("Duplicate");
    const repeatedHeader = header.split(",");
    repeatedHeader[4] = repeatedHeader[3];
    await expect(
      parse(sourceRows(), repeatedHeader.join(",")),
    ).rejects.toThrow();
  });
  it("rejects missing boroughs, unknown selected categories and invalid source provenance", async () => {
    const rows = sourceRows().filter((row) => !row.includes(",Croydon,"));
    await expect(parse(rows)).rejects.toThrow();
    const wrongCategory = sourceRows();
    wrongCategory[0] = wrongCategory[0].replace(
      "OTHER SEXUAL OFFENCES",
      "NEW CATEGORY",
    );
    await expect(parse(wrongCategory)).rejects.toThrow("Unrecognized");
    const source = fixture();
    await expect(
      importMpsBoroughCsv(source.bytes, {
        ...source.manifest,
        url: "https://example.com/data.csv",
      }),
    ).rejects.toThrow();
    await expect(
      importMpsBoroughCsv(source.bytes, {
        ...source.manifest,
        sha256: "0".repeat(64),
      }),
    ).rejects.toThrow("manifest");
  });
  it("rejects duplicate projected cells and forged source row lineage", async () => {
    const data = await parse();
    const duplicate = structuredClone(data);
    duplicate.cells[1] = duplicate.cells[0];
    expect(mpsContextSchema.safeParse(duplicate).success).toBe(false);
    const mismatched = structuredClone(data);
    mismatched.cells[0].sourceRowIndex = 1;
    expect(mpsContextSchema.safeParse(mismatched).success).toBe(false);
    const noHash = structuredClone(data);
    noHash.cells[0].sourceSnapshotSha256 = "0".repeat(64);
    expect(mpsContextSchema.safeParse(noHash).success).toBe(false);
  });
});
